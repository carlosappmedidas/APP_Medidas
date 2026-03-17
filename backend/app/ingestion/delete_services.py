# app/ingestion/delete_services.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import Any, cast

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Query, Session

from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.bald_contrib_models import BaldPeriodContribution
from app.measures.general_contrib_models import GeneralPeriodContribution
from app.measures.m1_models import M1PeriodContribution
from app.measures.models import MedidaGeneral, MedidaPS
from app.measures.ps_detail_models import PSPeriodDetail
from app.measures.ps_models import PSPeriodContribution


def apply_ingestion_filters(
    query: Query[Any],
    *,
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> Query[Any]:
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


def validate_delete_scope(
    db: Session,
    *,
    tenant_id: int | None,
    empresa_id: int | None,
) -> int | None:
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
        return tenant_id

    if tenant_id is None and empresa_id is not None:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        return cast(int, empresa.tenant_id)

    return tenant_id


def target_contribution_filters(
    query: Query[Any],
    model: Any,
    *,
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> Query[Any]:
    if tenant_id is not None:
        query = query.filter(model.tenant_id == tenant_id)
    if empresa_id is not None:
        query = query.filter(model.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(model.anio == anio)
    if mes is not None:
        query = query.filter(model.mes == mes)
    return query


def serialize_period(
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


def period_sort_key(item: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    tenant_id, empresa_id, anio, mes = item
    return (empresa_id, anio, mes, tenant_id)


def collect_general_affected_periods(
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

    rows_m1_target = target_contribution_filters(
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

    rows_general_target = target_contribution_filters(
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

    rows_bald_target = target_contribution_filters(
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

    rows_medidas_target = target_contribution_filters(
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


def collect_ps_affected_periods(
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

    rows_detail_target = target_contribution_filters(
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

    rows_contrib_target = target_contribution_filters(
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

    rows_medidas_target = target_contribution_filters(
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


def cleanup_orphan_medidas_general(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
) -> int:
    deleted = 0

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=period_sort_key):
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


def cleanup_orphan_medidas_ps(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
) -> int:
    deleted = 0

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=period_sort_key):
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


def build_m1_delete_candidates(
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

    rows_target = target_contribution_filters(
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


def build_general_delete_candidates(
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

    rows_target = target_contribution_filters(
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


def build_bald_delete_candidates(
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

    rows_target = target_contribution_filters(
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


def build_ps_detail_delete_candidates(
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

    rows_target = target_contribution_filters(
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


def build_ps_contrib_delete_candidates(
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

    rows_target = target_contribution_filters(
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


def preview_orphan_general_periods(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
    deleted_m1_ids: set[int],
    deleted_general_ids: set[int],
    deleted_bald_ids: set[int],
) -> list[dict[str, int]]:
    out: list[dict[str, int]] = []

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=period_sort_key):
        remaining_m1_rows = (
            db.query(M1PeriodContribution.id)
            .filter(
                M1PeriodContribution.tenant_id == tenant_id,
                M1PeriodContribution.empresa_id == empresa_id,
                M1PeriodContribution.anio == anio,
                M1PeriodContribution.mes == mes,
            )
            .all()
        )
        has_m1_remaining = any(cast(int, row[0]) not in deleted_m1_ids for row in remaining_m1_rows)

        remaining_general_rows = (
            db.query(GeneralPeriodContribution.id)
            .filter(
                GeneralPeriodContribution.tenant_id == tenant_id,
                GeneralPeriodContribution.empresa_id == empresa_id,
                GeneralPeriodContribution.anio == anio,
                GeneralPeriodContribution.mes == mes,
            )
            .all()
        )
        has_general_remaining = any(
            cast(int, row[0]) not in deleted_general_ids for row in remaining_general_rows
        )

        remaining_bald_rows = (
            db.query(BaldPeriodContribution.id)
            .filter(
                BaldPeriodContribution.tenant_id == tenant_id,
                BaldPeriodContribution.empresa_id == empresa_id,
                BaldPeriodContribution.anio == anio,
                BaldPeriodContribution.mes == mes,
            )
            .all()
        )
        has_bald_remaining = any(
            cast(int, row[0]) not in deleted_bald_ids for row in remaining_bald_rows
        )

        if not has_m1_remaining and not has_general_remaining and not has_bald_remaining:
            out.append(serialize_period(tenant_id, empresa_id, anio, mes))

    return out


def preview_orphan_ps_periods(
    db: Session,
    *,
    periods: set[tuple[int, int, int, int]],
    deleted_ps_detail_ids: set[int],
    deleted_ps_contrib_ids: set[int],
) -> list[dict[str, int]]:
    out: list[dict[str, int]] = []

    for tenant_id, empresa_id, anio, mes in sorted(periods, key=period_sort_key):
        remaining_detail_rows = (
            db.query(PSPeriodDetail.id)
            .filter(
                PSPeriodDetail.tenant_id == tenant_id,
                PSPeriodDetail.empresa_id == empresa_id,
                PSPeriodDetail.anio == anio,
                PSPeriodDetail.mes == mes,
            )
            .all()
        )
        has_detail_remaining = any(
            cast(int, row[0]) not in deleted_ps_detail_ids for row in remaining_detail_rows
        )

        remaining_contrib_rows = (
            db.query(PSPeriodContribution.id)
            .filter(
                PSPeriodContribution.tenant_id == tenant_id,
                PSPeriodContribution.empresa_id == empresa_id,
                PSPeriodContribution.anio == anio,
                PSPeriodContribution.mes == mes,
            )
            .all()
        )
        has_contrib_remaining = any(
            cast(int, row[0]) not in deleted_ps_contrib_ids for row in remaining_contrib_rows
        )

        if not has_detail_remaining and not has_contrib_remaining:
            out.append(serialize_period(tenant_id, empresa_id, anio, mes))

    return out


def build_refacturas_preview(
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
        if ingestion_file is None:
            continue

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


def build_delete_preview(
    db: Session,
    *,
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> dict[str, Any]:
    tenant_id = validate_delete_scope(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
    )

    base_query = db.query(IngestionFile)
    base_query = apply_ingestion_filters(
        base_query,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )

    ingestion_files = cast(
        list[IngestionFile],
        base_query.order_by(
            IngestionFile.empresa_id.asc(),
            IngestionFile.anio.asc(),
            IngestionFile.mes.asc(),
            IngestionFile.id.asc(),
        ).all(),
    )
    ids_to_delete = [cast(int, row.id) for row in ingestion_files]

    affected_general_periods = collect_general_affected_periods(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    affected_ps_periods = collect_ps_affected_periods(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )

    deleted_m1_map = build_m1_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_general_map = build_general_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_bald_map = build_bald_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_ps_detail_map = build_ps_detail_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    deleted_ps_contrib_map = build_ps_contrib_delete_candidates(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )

    orphan_general_candidates = preview_orphan_general_periods(
        db,
        periods=affected_general_periods,
        deleted_m1_ids=set(deleted_m1_map.keys()),
        deleted_general_ids=set(deleted_general_map.keys()),
        deleted_bald_ids=set(deleted_bald_map.keys()),
    )
    orphan_ps_candidates = preview_orphan_ps_periods(
        db,
        periods=affected_ps_periods,
        deleted_ps_detail_ids=set(deleted_ps_detail_map.keys()),
        deleted_ps_contrib_ids=set(deleted_ps_contrib_map.keys()),
    )

    refacturas_m1 = build_refacturas_preview(
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
            serialize_period(t_id, e_id, a, m)
            for t_id, e_id, a, m in sorted(affected_general_periods, key=period_sort_key)
        ],
        "affected_ps_periods": [
            serialize_period(t_id, e_id, a, m)
            for t_id, e_id, a, m in sorted(affected_ps_periods, key=period_sort_key)
        ],
        "orphan_medidas_general_candidates": orphan_general_candidates,
        "orphan_medidas_ps_candidates": orphan_ps_candidates,
        "refacturas_m1": refacturas_m1,
    }


def execute_delete(
    db: Session,
    *,
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> dict[str, Any]:
    tenant_id = validate_delete_scope(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
    )

    base_query = db.query(IngestionFile)
    base_query = apply_ingestion_filters(
        base_query,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )

    rows_to_delete = cast(list[IngestionFile], base_query.all())
    ids_to_delete = [cast(int, row.id) for row in rows_to_delete]

    affected_general_periods = collect_general_affected_periods(
        db,
        ingestion_file_ids=ids_to_delete,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    affected_ps_periods = collect_ps_affected_periods(
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

    deleted_m1_contrib_target = target_contribution_filters(
        db.query(M1PeriodContribution),
        M1PeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_general_contrib_target = target_contribution_filters(
        db.query(GeneralPeriodContribution),
        GeneralPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_bald_contrib_target = target_contribution_filters(
        db.query(BaldPeriodContribution),
        BaldPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_ps_detail_target = target_contribution_filters(
        db.query(PSPeriodDetail),
        PSPeriodDetail,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_ps_contrib_target = target_contribution_filters(
        db.query(PSPeriodContribution),
        PSPeriodContribution,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    ).delete(synchronize_session=False)

    deleted_medidas_general_orphan = cleanup_orphan_medidas_general(
        db,
        periods=affected_general_periods,
    )
    deleted_medidas_ps_orphan = cleanup_orphan_medidas_ps(
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