# app/measures/services/general.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.measures.models import MedidaGeneral
from app.measures.general_contrib_models import GeneralPeriodContribution
from app.ingestion.models import IngestionFile

from app.measures.services.common import (
    _file_id,
    _safe_refresh,
    _recalcular_energia_pf_final,
)


# ---------- helpers GENERAL deterministic contributions ----------


def _sum_contribuciones_general(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> dict[str, float]:
    row = (
        db.query(
            func.coalesce(func.sum(GeneralPeriodContribution.energia_generada_kwh), 0.0),
            func.coalesce(func.sum(GeneralPeriodContribution.energia_frontera_dd_kwh), 0.0),
            func.coalesce(func.sum(GeneralPeriodContribution.energia_pf_kwh), 0.0),
        )
        .filter(
            GeneralPeriodContribution.tenant_id == tenant_id,
            GeneralPeriodContribution.empresa_id == empresa_id,
            GeneralPeriodContribution.anio == anio,
            GeneralPeriodContribution.mes == mes,
        )
        .one()
    )

    return {
        "energia_generada_kwh": float(row[0] or 0.0),
        "energia_frontera_dd_kwh": float(row[1] or 0.0),
        "energia_pf_kwh": float(row[2] or 0.0),
    }


def _get_existing_general_file_periods(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    ingestion_file_id: int,
) -> set[tuple[int, int]]:
    periods: set[tuple[int, int]] = set()

    rows = (
        db.query(GeneralPeriodContribution.anio, GeneralPeriodContribution.mes)
        .filter(
            GeneralPeriodContribution.tenant_id == tenant_id,
            GeneralPeriodContribution.empresa_id == empresa_id,
            GeneralPeriodContribution.ingestion_file_id == ingestion_file_id,
        )
        .distinct()
        .all()
    )

    for anio, mes in rows:
        if anio is not None and mes is not None:
            periods.add((int(anio), int(mes)))

    return periods


def _rebuild_medida_general_from_contributions(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    fichero: IngestionFile,
    punto_id_default: str,
) -> MedidaGeneral:
    mg = (
        db.query(MedidaGeneral)
        .filter_by(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )
        .first()
    )

    if mg is None:
        mg = MedidaGeneral(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            punto_id=punto_id_default,
            anio=anio,
            mes=mes,
        )
        db.add(mg)
    elif not getattr(mg, "punto_id", None):
        mg.punto_id = punto_id_default  # type: ignore[assignment]

    sums = _sum_contribuciones_general(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )

    mg.energia_generada_kwh = float(sums["energia_generada_kwh"])  # type: ignore[assignment]
    mg.energia_frontera_dd_kwh = float(sums["energia_frontera_dd_kwh"])  # type: ignore[assignment]
    mg.energia_pf_kwh = float(sums["energia_pf_kwh"])  # type: ignore[assignment]
    mg.file_id = _file_id(fichero)  # type: ignore[assignment]

    _recalcular_energia_pf_final(mg)
    return mg


def _save_general_period_contribution_and_rebuild(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    anio: int,
    mes: int,
    source_tipo: str,
    energia_generada_kwh: float = 0.0,
    energia_frontera_dd_kwh: float = 0.0,
    energia_pf_kwh: float = 0.0,
    punto_id_default: str = "GENERAL",
) -> MedidaGeneral:
    periodos_previos = _get_existing_general_file_periods(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
    )

    (
        db.query(GeneralPeriodContribution)
        .filter(
            GeneralPeriodContribution.tenant_id == tenant_id,
            GeneralPeriodContribution.empresa_id == empresa_id,
            GeneralPeriodContribution.ingestion_file_id == _file_id(fichero),
            GeneralPeriodContribution.source_tipo == source_tipo,
        )
        .delete(synchronize_session=False)
    )

    db.flush()

    contrib = GeneralPeriodContribution(  # type: ignore[call-arg]
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
        anio=anio,
        mes=mes,
        source_tipo=source_tipo,
        energia_generada_kwh=float(energia_generada_kwh),
        energia_frontera_dd_kwh=float(energia_frontera_dd_kwh),
        energia_pf_kwh=float(energia_pf_kwh),
        is_principal=True,
    )
    db.add(contrib)
    db.flush()

    periodos_afectados = set(periodos_previos) | {(anio, mes)}

    mg_result: MedidaGeneral | None = None
    for anio_af, mes_af in sorted(periodos_afectados):
        mg = _rebuild_medida_general_from_contributions(
            db=db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio_af,
            mes=mes_af,
            fichero=fichero,
            punto_id_default=punto_id_default,
        )
        if (anio_af, mes_af) == (anio, mes):
            mg_result = mg

    db.flush()

    if mg_result is None:
        mg_result = (
            db.query(MedidaGeneral)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio,
                mes=mes,
            )
            .first()
        )

    if mg_result is None:
        raise ValueError("No se pudo reconstruir la medida general tras guardar contribuciones")

    _safe_refresh(db, mg_result)
    return mg_result