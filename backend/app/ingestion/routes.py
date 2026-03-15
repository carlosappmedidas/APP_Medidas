# app/ingestion/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, cast
import json
import re
import shutil

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_active_superuser, get_current_user
from app.core.config import get_settings
from app.core.db import get_db
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.ingestion.schemas import IngestionFileCreate, IngestionFileRead
from app.ingestion.services import (
    procesar_fichero_acum_h2_gen_generacion,
    procesar_fichero_acum_h2_grd_generacion,
    procesar_fichero_acum_h2_rdd_p1_frontera_dd,
    procesar_fichero_acum_h2_rdd_p2_frontera_dd,
    procesar_fichero_acum_h2_rdd_pf_kwh,
    procesar_fichero_acumcil_generacion,
    procesar_fichero_bald,
    procesar_fichero_m1_autoconsumo_desde_csv,
    procesar_fichero_m1_desde_csv,
    procesar_fichero_ps,
)
from app.measures.bald_contrib_models import BaldPeriodContribution
from app.measures.general_contrib_models import GeneralPeriodContribution
from app.measures.m1_models import M1PeriodContribution
from app.measures.models import MedidaGeneral, MedidaPS
from app.measures.ps_detail_models import PSPeriodDetail
from app.measures.ps_models import PSPeriodContribution
from app.tenants.models import User

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

UPLOAD_BASE_PATH = Path("data/ingestion")


def _infer_period_from_filename(tipo: str, filename: str) -> tuple[int, int]:
    tipo_norm = (tipo or "").upper()
    name = str(filename)

    if tipo_norm in {"M1_AUTOCONSUMO", "ACUMCIL"}:
        m = re.search(r"_(\d{4})(\d{2})_", name)
        if m:
            return int(m.group(1)), int(m.group(2))

    if tipo_norm == "M1":
        m = re.search(r"_(\d{4})(\d{2})", name)
        if m:
            return int(m.group(1)), int(m.group(2))

    if tipo_norm == "BALD":
        m = re.search(r"BALD_\d+_(\d{6})_", name.upper())
        if m:
            periodo_str = m.group(1)
            return int(periodo_str[:4]), int(periodo_str[4:6])

    if tipo_norm in {"ACUM_H2_GRD", "ACUM_H2_GEN", "ACUM_H2_RDD_P1", "ACUM_H2_RDD_P2"}:
        m = re.search(r"_(\d{4})(\d{2})", name)
        if m:
            return int(m.group(1)), int(m.group(2))

    m = re.search(r"_(\d{4})(\d{2})", name)
    if m:
        return int(m.group(1)), int(m.group(2))

    raise ValueError(
        f"No se ha podido inferir el periodo AAAAMM del nombre de fichero "
        f"'{name}' para el tipo '{tipo_norm}'."
    )


def _find_existing_ingestion_file(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    tipo: str,
    anio: int,
    mes: int,
    filename: str | None = None,
) -> IngestionFile | None:
    q = (
        db.query(IngestionFile)
        .filter(
            IngestionFile.tenant_id == tenant_id,
            IngestionFile.empresa_id == empresa_id,
            IngestionFile.tipo == tipo,
            IngestionFile.anio == anio,
            IngestionFile.mes == mes,
        )
    )

    if (tipo or "").upper() == "BALD" and filename:
        q = q.filter(IngestionFile.filename == filename)

    return q.order_by(IngestionFile.id.desc()).first()


def _safe_unlink(storage_key: str | None) -> None:
    if not storage_key:
        return
    try:
        p = Path(storage_key)
        if p.exists() and p.is_file():
            p.unlink()
    except Exception:
        return


def _extract_ingestion_warnings(obj: Any) -> list[Any]:
    try:
        warnings = getattr(obj, "_ingestion_warnings", None)
    except Exception:
        warnings = None

    if isinstance(warnings, list):
        return warnings
    return []


def _apply_ingestion_filters(
    query,
    *,
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
):
    if tenant_id is not None:
        query = query.filter(IngestionFile.tenant_id == tenant_id)

    if empresa_id is not None:
        query = query.filter(IngestionFile.empresa_id == empresa_id)

    if tipo is not None:
        query = query.filter(IngestionFile.tipo == tipo)

    if status_ is not None:
        allowed = {
            IngestionFile.STATUS_PENDING,
            IngestionFile.STATUS_PROCESSING,
            IngestionFile.STATUS_OK,
            IngestionFile.STATUS_ERROR,
        }
        if status_ not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Status no válido. Debe ser uno de: {', '.join(sorted(allowed))}",
            )
        query = query.filter(IngestionFile.status == status_)

    if anio is not None:
        query = query.filter(IngestionFile.anio == anio)

    if mes is not None:
        query = query.filter(IngestionFile.mes == mes)

    return query


def _target_contribution_filters(
    query,
    model,
    *,
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
):
    if tenant_id is not None:
        query = query.filter(model.tenant_id == tenant_id)
    if empresa_id is not None:
        query = query.filter(model.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(model.anio == anio)
    if mes is not None:
        query = query.filter(model.mes == mes)
    return query


def _serialize_period(
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> dict[str, int]:
    return {
        "tenant_id": int(tenant_id),
        "empresa_id": int(empresa_id),
        "anio": int(anio),
        "mes": int(mes),
    }


def _period_sort_key(item: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    tenant_id, empresa_id, anio, mes = item
    return (empresa_id, anio, mes, tenant_id)


def _collect_general_affected_periods(
    db: Session,
    *,
    ingestion_file_ids: list[int],
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> set[tuple[int, int, int, int]]:
    result: set[tuple[int, int, int, int]] = set()

    if ingestion_file_ids:
        rows_m1 = (
            db.query(
                M1PeriodContribution.tenant_id,
                M1PeriodContribution.empresa_id,
                M1PeriodContribution.anio,
                M1PeriodContribution.mes,
            )
            .filter(M1PeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .distinct()
            .all()
        )
        for t_id, e_id, a, m in rows_m1:
            result.add((int(t_id), int(e_id), int(a), int(m)))

        rows_general = (
            db.query(
                GeneralPeriodContribution.tenant_id,
                GeneralPeriodContribution.empresa_id,
                GeneralPeriodContribution.anio,
                GeneralPeriodContribution.mes,
            )
            .filter(GeneralPeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .distinct()
            .all()
        )
        for t_id, e_id, a, m in rows_general:
            result.add((int(t_id), int(e_id), int(a), int(m)))

        rows_bald = (
            db.query(
                BaldPeriodContribution.tenant_id,
                BaldPeriodContribution.empresa_id,
                BaldPeriodContribution.anio,
                BaldPeriodContribution.mes,
            )
            .filter(BaldPeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .distinct()
            .all()
        )
        for t_id, e_id, a, m in rows_bald:
            result.add((int(t_id), int(e_id), int(a), int(m)))

        rows_medidas = (
            db.query(
                MedidaGeneral.tenant_id,
                MedidaGeneral.empresa_id,
                MedidaGeneral.anio,
                MedidaGeneral.mes,
            )
            .filter(MedidaGeneral.file_id.in_(ingestion_file_ids))
            .distinct()
            .all()
        )
        for t_id, e_id, a, m in rows_medidas:
            result.add((int(t_id), int(e_id), int(a), int(m)))

    rows_m1_target = _target_contribution_filters(
        db.query(
            M1PeriodContribution.tenant_id,
            M1PeriodContribution.empresa_id,
            M1PeriodContribution.anio,
            M1PeriodContribution.mes,
        ).distinct(),
        M1PeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for t_id, e_id, a, m in rows_m1_target:
        result.add((int(t_id), int(e_id), int(a), int(m)))

    rows_general_target = _target_contribution_filters(
        db.query(
            GeneralPeriodContribution.tenant_id,
            GeneralPeriodContribution.empresa_id,
            GeneralPeriodContribution.anio,
            GeneralPeriodContribution.mes,
        ).distinct(),
        GeneralPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for t_id, e_id, a, m in rows_general_target:
        result.add((int(t_id), int(e_id), int(a), int(m)))

    rows_bald_target = _target_contribution_filters(
        db.query(
            BaldPeriodContribution.tenant_id,
            BaldPeriodContribution.empresa_id,
            BaldPeriodContribution.anio,
            BaldPeriodContribution.mes,
        ).distinct(),
        BaldPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for t_id, e_id, a, m in rows_bald_target:
        result.add((int(t_id), int(e_id), int(a), int(m)))

    rows_medidas_target = _target_contribution_filters(
        db.query(
            MedidaGeneral.tenant_id,
            MedidaGeneral.empresa_id,
            MedidaGeneral.anio,
            MedidaGeneral.mes,
        ).distinct(),
        MedidaGeneral,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for t_id, e_id, a, m in rows_medidas_target:
        result.add((int(t_id), int(e_id), int(a), int(m)))

    return result


def _collect_ps_affected_periods(
    db: Session,
    *,
    ingestion_file_ids: list[int],
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> set[tuple[int, int, int, int]]:
    result: set[tuple[int, int, int, int]] = set()

    if ingestion_file_ids:
        rows_detail = (
            db.query(
                PSPeriodDetail.tenant_id,
                PSPeriodDetail.empresa_id,
                PSPeriodDetail.anio,
                PSPeriodDetail.mes,
            )
            .filter(PSPeriodDetail.ingestion_file_id.in_(ingestion_file_ids))
            .distinct()
            .all()
        )
        for t_id, e_id, a, m in rows_detail:
            result.add((int(t_id), int(e_id), int(a), int(m)))

        rows_contrib = (
            db.query(
                PSPeriodContribution.tenant_id,
                PSPeriodContribution.empresa_id,
                PSPeriodContribution.anio,
                PSPeriodContribution.mes,
            )
            .filter(PSPeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .distinct()
            .all()
        )
        for t_id, e_id, a, m in rows_contrib:
            result.add((int(t_id), int(e_id), int(a), int(m)))

        rows_medidas = (
            db.query(
                MedidaPS.tenant_id,
                MedidaPS.empresa_id,
                MedidaPS.anio,
                MedidaPS.mes,
            )
            .filter(MedidaPS.file_id.in_(ingestion_file_ids))
            .distinct()
            .all()
        )
        for t_id, e_id, a, m in rows_medidas:
            result.add((int(t_id), int(e_id), int(a), int(m)))

    rows_detail_target = _target_contribution_filters(
        db.query(
            PSPeriodDetail.tenant_id,
            PSPeriodDetail.empresa_id,
            PSPeriodDetail.anio,
            PSPeriodDetail.mes,
        ).distinct(),
        PSPeriodDetail,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for t_id, e_id, a, m in rows_detail_target:
        result.add((int(t_id), int(e_id), int(a), int(m)))

    rows_contrib_target = _target_contribution_filters(
        db.query(
            PSPeriodContribution.tenant_id,
            PSPeriodContribution.empresa_id,
            PSPeriodContribution.anio,
            PSPeriodContribution.mes,
        ).distinct(),
        PSPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for t_id, e_id, a, m in rows_contrib_target:
        result.add((int(t_id), int(e_id), int(a), int(m)))

    rows_medidas_target = _target_contribution_filters(
        db.query(
            MedidaPS.tenant_id,
            MedidaPS.empresa_id,
            MedidaPS.anio,
            MedidaPS.mes,
        ).distinct(),
        MedidaPS,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for t_id, e_id, a, m in rows_medidas_target:
        result.add((int(t_id), int(e_id), int(a), int(m)))

    return result


def _cleanup_orphan_medidas_general(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
) -> int:
    deleted = 0

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=_period_sort_key):
        has_m1 = (
            db.query(M1PeriodContribution.id)
            .filter(
                M1PeriodContribution.tenant_id == tenant_id,
                M1PeriodContribution.empresa_id == empresa_id,
                M1PeriodContribution.anio == anio,
                M1PeriodContribution.mes == mes,
            )
            .first()
            is not None
        )

        has_general = (
            db.query(GeneralPeriodContribution.id)
            .filter(
                GeneralPeriodContribution.tenant_id == tenant_id,
                GeneralPeriodContribution.empresa_id == empresa_id,
                GeneralPeriodContribution.anio == anio,
                GeneralPeriodContribution.mes == mes,
            )
            .first()
            is not None
        )

        has_bald = (
            db.query(BaldPeriodContribution.id)
            .filter(
                BaldPeriodContribution.tenant_id == tenant_id,
                BaldPeriodContribution.empresa_id == empresa_id,
                BaldPeriodContribution.anio == anio,
                BaldPeriodContribution.mes == mes,
            )
            .first()
            is not None
        )

        if not has_m1 and not has_general and not has_bald:
            deleted += (
                db.query(MedidaGeneral)
                .filter(
                    MedidaGeneral.tenant_id == tenant_id,
                    MedidaGeneral.empresa_id == empresa_id,
                    MedidaGeneral.anio == anio,
                    MedidaGeneral.mes == mes,
                )
                .delete(synchronize_session=False)
            )

    return deleted


def _cleanup_orphan_medidas_ps(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
) -> int:
    deleted = 0

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=_period_sort_key):
        has_detail = (
            db.query(PSPeriodDetail.id)
            .filter(
                PSPeriodDetail.tenant_id == tenant_id,
                PSPeriodDetail.empresa_id == empresa_id,
                PSPeriodDetail.anio == anio,
                PSPeriodDetail.mes == mes,
            )
            .first()
            is not None
        )

        has_contrib = (
            db.query(PSPeriodContribution.id)
            .filter(
                PSPeriodContribution.tenant_id == tenant_id,
                PSPeriodContribution.empresa_id == empresa_id,
                PSPeriodContribution.anio == anio,
                PSPeriodContribution.mes == mes,
            )
            .first()
            is not None
        )

        if not has_detail and not has_contrib:
            deleted += (
                db.query(MedidaPS)
                .filter(
                    MedidaPS.tenant_id == tenant_id,
                    MedidaPS.empresa_id == empresa_id,
                    MedidaPS.anio == anio,
                    MedidaPS.mes == mes,
                )
                .delete(synchronize_session=False)
            )

    return deleted


def _build_m1_delete_candidates(
    db: Session,
    *,
    ingestion_file_ids: list[int],
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> dict[int, M1PeriodContribution]:
    result: dict[int, M1PeriodContribution] = {}

    if ingestion_file_ids:
        rows = (
            db.query(M1PeriodContribution)
            .filter(M1PeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .all()
        )
        for row in rows:
            result[cast(int, row.id)] = row

    rows_target = _target_contribution_filters(
        db.query(M1PeriodContribution),
        M1PeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for row in rows_target:
        result[cast(int, row.id)] = row

    return result


def _build_general_delete_candidates(
    db: Session,
    *,
    ingestion_file_ids: list[int],
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> dict[int, GeneralPeriodContribution]:
    result: dict[int, GeneralPeriodContribution] = {}

    if ingestion_file_ids:
        rows = (
            db.query(GeneralPeriodContribution)
            .filter(GeneralPeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .all()
        )
        for row in rows:
            result[cast(int, row.id)] = row

    rows_target = _target_contribution_filters(
        db.query(GeneralPeriodContribution),
        GeneralPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for row in rows_target:
        result[cast(int, row.id)] = row

    return result


def _build_bald_delete_candidates(
    db: Session,
    *,
    ingestion_file_ids: list[int],
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> dict[int, BaldPeriodContribution]:
    result: dict[int, BaldPeriodContribution] = {}

    if ingestion_file_ids:
        rows = (
            db.query(BaldPeriodContribution)
            .filter(BaldPeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .all()
        )
        for row in rows:
            result[cast(int, row.id)] = row

    rows_target = _target_contribution_filters(
        db.query(BaldPeriodContribution),
        BaldPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for row in rows_target:
        result[cast(int, row.id)] = row

    return result


def _build_ps_detail_delete_candidates(
    db: Session,
    *,
    ingestion_file_ids: list[int],
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> dict[int, PSPeriodDetail]:
    result: dict[int, PSPeriodDetail] = {}

    if ingestion_file_ids:
        rows = (
            db.query(PSPeriodDetail)
            .filter(PSPeriodDetail.ingestion_file_id.in_(ingestion_file_ids))
            .all()
        )
        for row in rows:
            result[cast(int, row.id)] = row

    rows_target = _target_contribution_filters(
        db.query(PSPeriodDetail),
        PSPeriodDetail,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for row in rows_target:
        result[cast(int, row.id)] = row

    return result


def _build_ps_contrib_delete_candidates(
    db: Session,
    *,
    ingestion_file_ids: list[int],
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> dict[int, PSPeriodContribution]:
    result: dict[int, PSPeriodContribution] = {}

    if ingestion_file_ids:
        rows = (
            db.query(PSPeriodContribution)
            .filter(PSPeriodContribution.ingestion_file_id.in_(ingestion_file_ids))
            .all()
        )
        for row in rows:
            result[cast(int, row.id)] = row

    rows_target = _target_contribution_filters(
        db.query(PSPeriodContribution),
        PSPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).all()
    for row in rows_target:
        result[cast(int, row.id)] = row

    return result


def _preview_orphan_general_periods(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
    deleted_m1_ids: set[int],
    deleted_general_ids: set[int],
    deleted_bald_ids: set[int],
) -> list[dict[str, int]]:
    out: list[dict[str, int]] = []

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=_period_sort_key):
        has_m1_remaining = (
            db.query(M1PeriodContribution.id)
            .filter(
                M1PeriodContribution.tenant_id == tenant_id,
                M1PeriodContribution.empresa_id == empresa_id,
                M1PeriodContribution.anio == anio,
                M1PeriodContribution.mes == mes,
            )
            .all()
        )
        has_m1_remaining = any(cast(int, row[0]) not in deleted_m1_ids for row in has_m1_remaining)

        has_general_remaining = (
            db.query(GeneralPeriodContribution.id)
            .filter(
                GeneralPeriodContribution.tenant_id == tenant_id,
                GeneralPeriodContribution.empresa_id == empresa_id,
                GeneralPeriodContribution.anio == anio,
                GeneralPeriodContribution.mes == mes,
            )
            .all()
        )
        has_general_remaining = any(cast(int, row[0]) not in deleted_general_ids for row in has_general_remaining)

        has_bald_remaining = (
            db.query(BaldPeriodContribution.id)
            .filter(
                BaldPeriodContribution.tenant_id == tenant_id,
                BaldPeriodContribution.empresa_id == empresa_id,
                BaldPeriodContribution.anio == anio,
                BaldPeriodContribution.mes == mes,
            )
            .all()
        )
        has_bald_remaining = any(cast(int, row[0]) not in deleted_bald_ids for row in has_bald_remaining)

        if not has_m1_remaining and not has_general_remaining and not has_bald_remaining:
            out.append(_serialize_period(tenant_id, empresa_id, anio, mes))

    return out


def _preview_orphan_ps_periods(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
    deleted_ps_detail_ids: set[int],
    deleted_ps_contrib_ids: set[int],
) -> list[dict[str, int]]:
    out: list[dict[str, int]] = []

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=_period_sort_key):
        has_detail_remaining = (
            db.query(PSPeriodDetail.id)
            .filter(
                PSPeriodDetail.tenant_id == tenant_id,
                PSPeriodDetail.empresa_id == empresa_id,
                PSPeriodDetail.anio == anio,
                PSPeriodDetail.mes == mes,
            )
            .all()
        )
        has_detail_remaining = any(cast(int, row[0]) not in deleted_ps_detail_ids for row in has_detail_remaining)

        has_contrib_remaining = (
            db.query(PSPeriodContribution.id)
            .filter(
                PSPeriodContribution.tenant_id == tenant_id,
                PSPeriodContribution.empresa_id == empresa_id,
                PSPeriodContribution.anio == anio,
                PSPeriodContribution.mes == mes,
            )
            .all()
        )
        has_contrib_remaining = any(cast(int, row[0]) not in deleted_ps_contrib_ids for row in has_contrib_remaining)

        if not has_detail_remaining and not has_contrib_remaining:
            out.append(_serialize_period(tenant_id, empresa_id, anio, mes))

    return out


def _build_refacturas_preview(
    db: Session,
    *,
    deleted_m1_rows: list[M1PeriodContribution],
) -> list[dict[str, Any]]:
    if not deleted_m1_rows:
        return []

    file_ids = sorted(
        {
            cast(int, row.ingestion_file_id)
            for row in deleted_m1_rows
            if getattr(row, "ingestion_file_id", None) is not None
        }
    )

    files_by_id: dict[int, IngestionFile] = {}
    if file_ids:
        rows = db.query(IngestionFile).filter(IngestionFile.id.in_(file_ids)).all()
        files_by_id = {cast(int, row.id): row for row in rows}

    result: list[dict[str, Any]] = []

    for row in deleted_m1_rows:
        file_id = cast(int, row.ingestion_file_id)
        ingestion_file = files_by_id.get(file_id)

        source_anio = cast(int | None, getattr(ingestion_file, "anio", None))
        source_mes = cast(int | None, getattr(ingestion_file, "mes", None))
        affected_anio = cast(int, row.anio)
        affected_mes = cast(int, row.mes)

        if source_anio is None or source_mes is None:
            continue

        if (source_anio, source_mes) == (affected_anio, affected_mes):
            continue

        result.append(
            {
                "source_period": {
                    "anio": int(source_anio),
                    "mes": int(source_mes),
                },
                "affected_period": {
                    "anio": int(affected_anio),
                    "mes": int(affected_mes),
                },
                "energia_kwh": float(cast(float | None, getattr(row, "energia_kwh", None)) or 0.0),
                "filename": getattr(ingestion_file, "filename", None),
                "ingestion_file_id": file_id,
            }
        )

    result.sort(
        key=lambda item: (
            int(item["affected_period"]["anio"]),
            int(item["affected_period"]["mes"]),
            int(item["source_period"]["anio"]),
            int(item["source_period"]["mes"]),
            int(item.get("ingestion_file_id") or 0),
        )
    )
    return result


@router.post(
    "/files/upload",
    response_model=IngestionFileRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    empresa_id: int = Form(...),
    tipo: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tipo_norm = (tipo or "").upper()
    tenant_id_int = cast(int, current_user.tenant_id)

    empresa = (
        db.query(Empresa)
        .filter(
            Empresa.id == empresa_id,
            Empresa.tenant_id == tenant_id_int,
        )
        .first()
    )
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada para este tenant",
        )

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El fichero debe tener un nombre",
        )

    try:
        anio, mes = _infer_period_from_filename(tipo_norm, file.filename)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    existing = _find_existing_ingestion_file(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        tipo=tipo_norm,
        anio=anio,
        mes=mes,
        filename=file.filename if tipo_norm == "BALD" else None,
    )

    dest_dir = (
        UPLOAD_BASE_PATH
        / f"tenant_{tenant_id_int}"
        / f"empresa_{empresa_id}"
        / tipo_norm
        / f"{anio}{mes:02d}"
    )
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_path = dest_dir / file.filename
    with dest_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    storage_key = str(dest_path)

    if existing:
        old_storage_key = cast(str, getattr(existing, "storage_key", None) or "")

        ex = cast(Any, existing)
        ex.filename = file.filename
        ex.storage_key = storage_key
        ex.tipo = tipo_norm
        ex.anio = anio
        ex.mes = mes
        ex.status = IngestionFile.STATUS_PENDING
        ex.rows_ok = 0
        ex.rows_error = 0
        ex.error_message = None
        ex.processed_at = None
        ex.updated_at = datetime.utcnow()
        ex.warnings_json = None

        db.commit()
        db.refresh(existing)

        if old_storage_key and old_storage_key != storage_key:
            _safe_unlink(old_storage_key)

        return existing

    ingestion_data: dict[str, Any] = {
        "tenant_id": tenant_id_int,
        "empresa_id": empresa_id,
        "tipo": tipo_norm,
        "anio": anio,
        "mes": mes,
        "filename": file.filename,
        "storage_key": storage_key,
        "status": IngestionFile.STATUS_PENDING,
        "uploaded_by": cast(int, current_user.id),
        "warnings_json": None,
    }

    ingestion = IngestionFile(**ingestion_data)  # type: ignore[arg-type]
    db.add(ingestion)
    db.commit()
    db.refresh(ingestion)
    return ingestion


@router.post(
    "/files",
    response_model=IngestionFileRead,
    status_code=status.HTTP_201_CREATED,
)
def register_file(
    data: IngestionFileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)

    empresa = (
        db.query(Empresa)
        .filter(
            Empresa.id == data.empresa_id,
            Empresa.tenant_id == tenant_id_int,
        )
        .first()
    )
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada para este tenant",
        )

    tipo_norm = str(data.tipo).upper()

    existing = _find_existing_ingestion_file(
        db,
        tenant_id=tenant_id_int,
        empresa_id=data.empresa_id,
        tipo=tipo_norm,
        anio=data.anio,
        mes=data.mes,
        filename=data.filename if tipo_norm == "BALD" else None,
    )

    if existing:
        ex = cast(Any, existing)
        ex.filename = data.filename
        ex.storage_key = data.storage_key
        ex.tipo = tipo_norm
        ex.anio = data.anio
        ex.mes = data.mes
        ex.status = IngestionFile.STATUS_PENDING
        ex.rows_ok = 0
        ex.rows_error = 0
        ex.error_message = None
        ex.processed_at = None
        ex.updated_at = datetime.utcnow()
        ex.warnings_json = None

        db.commit()
        db.refresh(existing)
        return existing

    ingestion_data: dict[str, Any] = {
        "tenant_id": tenant_id_int,
        "empresa_id": data.empresa_id,
        "tipo": tipo_norm,
        "anio": data.anio,
        "mes": data.mes,
        "filename": data.filename,
        "storage_key": data.storage_key,
        "status": IngestionFile.STATUS_PENDING,
        "uploaded_by": cast(int, current_user.id),
        "warnings_json": None,
    }

    ingestion = IngestionFile(**ingestion_data)  # type: ignore[arg-type]
    db.add(ingestion)
    db.commit()
    db.refresh(ingestion)
    return ingestion


@router.get("/files", response_model=list[IngestionFileRead])
def list_files(
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)

    query = db.query(IngestionFile).filter(
        IngestionFile.tenant_id == tenant_id_int,
    )

    query = _apply_ingestion_filters(
        query,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )

    query = query.order_by(
        IngestionFile.anio.desc(),
        IngestionFile.mes.desc(),
        IngestionFile.id.desc(),
    )

    return query.all()


@router.get("/files/delete-preview")
def delete_files_preview(
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    if tenant_id is not None and empresa_id is not None:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        empresa_tenant_id = cast(int, empresa.tenant_id)
        if empresa_tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La empresa indicada no pertenece al tenant indicado",
            )

    elif tenant_id is None and empresa_id is not None:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        tenant_id = cast(int, empresa.tenant_id)

    base_query = db.query(IngestionFile)
    base_query = _apply_ingestion_filters(
        base_query,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )

    ingestion_files = cast(list[IngestionFile], base_query.order_by(
        IngestionFile.empresa_id.asc(),
        IngestionFile.anio.asc(),
        IngestionFile.mes.asc(),
        IngestionFile.id.asc(),
    ).all())
    ids_to_delete = [cast(int, row.id) for row in ingestion_files]

    affected_general_periods = _collect_general_affected_periods(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    affected_ps_periods = _collect_ps_affected_periods(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )

    deleted_m1_map = _build_m1_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_general_map = _build_general_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_bald_map = _build_bald_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_ps_detail_map = _build_ps_detail_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_ps_contrib_map = _build_ps_contrib_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )

    orphan_general_candidates = _preview_orphan_general_periods(
        db,
        periods=affected_general_periods,
        deleted_m1_ids=set(deleted_m1_map.keys()),
        deleted_general_ids=set(deleted_general_map.keys()),
        deleted_bald_ids=set(deleted_bald_map.keys()),
    )
    orphan_ps_candidates = _preview_orphan_ps_periods(
        db,
        periods=affected_ps_periods,
        deleted_ps_detail_ids=set(deleted_ps_detail_map.keys()),
        deleted_ps_contrib_ids=set(deleted_ps_contrib_map.keys()),
    )

    refacturas_m1 = _build_refacturas_preview(
        db,
        deleted_m1_rows=list(deleted_m1_map.values()),
    )

    return {
        "filters": {
            "tenant_id": tenant_id,
            "empresa_id": empresa_id,
            "tipo": tipo,
            "status_": status_,
            "anio": anio,
            "mes": mes,
        },
        "summary": {
            "ingestion_files_count": len(ids_to_delete),
            "m1_period_contributions_count": len(deleted_m1_map),
            "general_period_contributions_count": len(deleted_general_map),
            "bald_period_contributions_count": len(deleted_bald_map),
            "ps_period_detail_count": len(deleted_ps_detail_map),
            "ps_period_contributions_count": len(deleted_ps_contrib_map),
            "medidas_general_direct_count": (
                db.query(MedidaGeneral)
                .filter(MedidaGeneral.file_id.in_(ids_to_delete))
                .count()
                if ids_to_delete
                else 0
            ),
            "medidas_ps_direct_count": (
                db.query(MedidaPS)
                .filter(MedidaPS.file_id.in_(ids_to_delete))
                .count()
                if ids_to_delete
                else 0
            ),
            "affected_general_periods_count": len(affected_general_periods),
            "affected_ps_periods_count": len(affected_ps_periods),
            "orphan_medidas_general_candidate_count": len(orphan_general_candidates),
            "orphan_medidas_ps_candidate_count": len(orphan_ps_candidates),
            "refacturas_m1_count": len(refacturas_m1),
        },
        "ingestion_files": [
            {
                "id": cast(int, row.id),
                "tenant_id": cast(int, row.tenant_id),
                "empresa_id": cast(int, row.empresa_id),
                "tipo": cast(str, row.tipo),
                "anio": cast(int, row.anio),
                "mes": cast(int, row.mes),
                "filename": cast(str, row.filename),
                "status": cast(str | None, row.status),
            }
            for row in ingestion_files
        ],
        "affected_general_periods": [
            _serialize_period(t_id, e_id, a, m)
            for t_id, e_id, a, m in sorted(affected_general_periods, key=_period_sort_key)
        ],
        "affected_ps_periods": [
            _serialize_period(t_id, e_id, a, m)
            for t_id, e_id, a, m in sorted(affected_ps_periods, key=_period_sort_key)
        ],
        "orphan_medidas_general_candidates": orphan_general_candidates,
        "orphan_medidas_ps_candidates": orphan_ps_candidates,
        "refacturas_m1": refacturas_m1,
    }


@router.delete("/files")
def delete_files(
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    if tenant_id is not None and empresa_id is not None:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        empresa_tenant_id = cast(int, empresa.tenant_id)
        if empresa_tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La empresa indicada no pertenece al tenant indicado",
            )

    elif tenant_id is None and empresa_id is not None:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        tenant_id = cast(int, empresa.tenant_id)

    base_query = db.query(IngestionFile)
    base_query = _apply_ingestion_filters(
        base_query,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )

    rows_to_delete = base_query.all()
    ids_to_delete = [cast(int, row.id) for row in rows_to_delete]

    affected_general_periods = _collect_general_affected_periods(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    affected_ps_periods = _collect_ps_affected_periods(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )

    deleted_m1_contrib_by_file = 0
    deleted_general_contrib_by_file = 0
    deleted_bald_contrib_by_file = 0
    deleted_ps_detail_by_file = 0
    deleted_ps_contrib_by_file = 0
    deleted_medidas_general_direct = 0
    deleted_medidas_ps_direct = 0
    deleted_files = 0

    if ids_to_delete:
        ids_select = select(IngestionFile.id).where(IngestionFile.id.in_(ids_to_delete))

        deleted_m1_contrib_by_file = (
            db.query(M1PeriodContribution)
            .filter(M1PeriodContribution.ingestion_file_id.in_(cast(Any, ids_select)))
            .delete(synchronize_session=False)
        )

        deleted_general_contrib_by_file = (
            db.query(GeneralPeriodContribution)
            .filter(GeneralPeriodContribution.ingestion_file_id.in_(cast(Any, ids_select)))
            .delete(synchronize_session=False)
        )

        deleted_bald_contrib_by_file = (
            db.query(BaldPeriodContribution)
            .filter(BaldPeriodContribution.ingestion_file_id.in_(cast(Any, ids_select)))
            .delete(synchronize_session=False)
        )

        deleted_ps_detail_by_file = (
            db.query(PSPeriodDetail)
            .filter(PSPeriodDetail.ingestion_file_id.in_(cast(Any, ids_select)))
            .delete(synchronize_session=False)
        )

        deleted_ps_contrib_by_file = (
            db.query(PSPeriodContribution)
            .filter(PSPeriodContribution.ingestion_file_id.in_(cast(Any, ids_select)))
            .delete(synchronize_session=False)
        )

        deleted_medidas_general_direct = (
            db.query(MedidaGeneral)
            .filter(MedidaGeneral.file_id.in_(cast(Any, ids_select)))
            .delete(synchronize_session=False)
        )

        deleted_medidas_ps_direct = (
            db.query(MedidaPS)
            .filter(MedidaPS.file_id.in_(cast(Any, ids_select)))
            .delete(synchronize_session=False)
        )

        deleted_files = (
            db.query(IngestionFile)
            .filter(IngestionFile.id.in_(ids_to_delete))
            .delete(synchronize_session=False)
        )

    deleted_m1_contrib_target = _target_contribution_filters(
        db.query(M1PeriodContribution),
        M1PeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_general_contrib_target = _target_contribution_filters(
        db.query(GeneralPeriodContribution),
        GeneralPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_bald_contrib_target = _target_contribution_filters(
        db.query(BaldPeriodContribution),
        BaldPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_ps_detail_target = _target_contribution_filters(
        db.query(PSPeriodDetail),
        PSPeriodDetail,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_ps_contrib_target = _target_contribution_filters(
        db.query(PSPeriodContribution),
        PSPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_medidas_general_orphan = _cleanup_orphan_medidas_general(
        db,
        periods=affected_general_periods,
    )
    deleted_medidas_ps_orphan = _cleanup_orphan_medidas_ps(
        db,
        periods=affected_ps_periods,
    )

    db.commit()

    return {
        "deleted_ingestion_files": deleted_files,
        "deleted_m1_period_contributions": deleted_m1_contrib_by_file + deleted_m1_contrib_target,
        "deleted_general_period_contributions": (
            deleted_general_contrib_by_file + deleted_general_contrib_target
        ),
        "deleted_bald_period_contributions": (
            deleted_bald_contrib_by_file + deleted_bald_contrib_target
        ),
        "deleted_ps_period_detail": deleted_ps_detail_by_file + deleted_ps_detail_target,
        "deleted_ps_period_contributions": (
            deleted_ps_contrib_by_file + deleted_ps_contrib_target
        ),
        "deleted_medidas_general_direct": deleted_medidas_general_direct,
        "deleted_medidas_general_orphan": deleted_medidas_general_orphan,
        "deleted_medidas_ps_direct": deleted_medidas_ps_direct,
        "deleted_medidas_ps_orphan": deleted_medidas_ps_orphan,
        "filters": {
            "tenant_id": tenant_id,
            "empresa_id": empresa_id,
            "tipo": tipo,
            "status_": status_,
            "anio": anio,
            "mes": mes,
        },
    }


@router.post(
    "/files/{file_id}/process",
    response_model=IngestionFileRead,
    status_code=status.HTTP_200_OK,
)
def process_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)

    ingestion = (
        db.query(IngestionFile)
        .filter(
            IngestionFile.id == file_id,
            IngestionFile.tenant_id == tenant_id_int,
        )
        .first()
    )
    if not ingestion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichero de ingestion no encontrado",
        )

    ing = cast(Any, ingestion)

    if ing.status not in (IngestionFile.STATUS_PENDING, IngestionFile.STATUS_ERROR):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede procesar un fichero en estado {ing.status}",
        )

    if not ing.storage_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El fichero no tiene storage_key; no se puede procesar",
        )

    ing.warnings_json = None
    ing.status = IngestionFile.STATUS_PROCESSING
    db.commit()
    db.refresh(ingestion)

    storage_key_for_cleanup = cast(str, ing.storage_key)

    try:
        tipo = (ing.tipo or "").upper()

        tenant_id_local = cast(int, ing.tenant_id)
        empresa_id_local = cast(int, ing.empresa_id)
        storage_key = cast(str, ing.storage_key)

        result_obj: Any | None = None

        if tipo == "BALD":
            result_obj = procesar_fichero_bald(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "M1":
            result_obj = procesar_fichero_m1_desde_csv(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "M1_AUTOCONSUMO":
            result_obj = procesar_fichero_m1_autoconsumo_desde_csv(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUMCIL":
            result_obj = procesar_fichero_acumcil_generacion(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_GRD":
            result_obj = procesar_fichero_acum_h2_grd_generacion(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_GEN":
            result_obj = procesar_fichero_acum_h2_gen_generacion(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_RDD_P2":
            result_obj = procesar_fichero_acum_h2_rdd_p2_frontera_dd(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_RDD_P1":
            procesar_fichero_acum_h2_rdd_p1_frontera_dd(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
            result_obj = procesar_fichero_acum_h2_rdd_pf_kwh(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "PS":
            result_obj = procesar_fichero_ps(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        else:
            raise ValueError(f"Tipo de fichero no soportado para procesado: {tipo}")

        warnings_list = _extract_ingestion_warnings(result_obj)
        if warnings_list:
            ing.warnings_json = json.dumps(warnings_list, ensure_ascii=False)

        ing.status = IngestionFile.STATUS_OK
        ing.rows_ok = int(ing.rows_ok or 0) + 1
        ing.rows_error = int(ing.rows_error or 0)
        ing.error_message = None

        db.commit()
        db.refresh(ingestion)

    except Exception as exc:
        db.rollback()

        ingestion = (
            db.query(IngestionFile)
            .filter(
                IngestionFile.id == file_id,
                IngestionFile.tenant_id == tenant_id_int,
            )
            .first()
        )

        if ingestion is not None:
            ing = cast(Any, ingestion)
            ing.status = IngestionFile.STATUS_ERROR
            ing.rows_error = int(ing.rows_error or 0) + 1
            ing.error_message = str(exc)
            ing.processed_at = datetime.utcnow()
            db.commit()
            db.refresh(ingestion)
        else:
            raise

    finally:
        try:
            ingestion = (
                db.query(IngestionFile)
                .filter(
                    IngestionFile.id == file_id,
                    IngestionFile.tenant_id == tenant_id_int,
                )
                .first()
            )

            if ingestion is not None:
                ing = cast(Any, ingestion)

                if ing.status in (
                    IngestionFile.STATUS_OK,
                    IngestionFile.STATUS_ERROR,
                ) and ing.processed_at is None:
                    ing.processed_at = datetime.utcnow()
                    db.commit()
                    db.refresh(ingestion)

                try:
                    settings = get_settings()
                    delete_after_ok = bool(getattr(settings, "INGESTION_DELETE_AFTER_OK", True))
                except Exception:
                    delete_after_ok = True

                if delete_after_ok and cast(str, ing.status) == IngestionFile.STATUS_OK:
                    _safe_unlink(storage_key_for_cleanup)
        except Exception:
            pass

    ingestion = (
        db.query(IngestionFile)
        .filter(
            IngestionFile.id == file_id,
            IngestionFile.tenant_id == tenant_id_int,
        )
        .first()
    )
    if not ingestion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichero de ingestion no encontrado tras el procesado",
        )

    return ingestion