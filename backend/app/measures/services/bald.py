# app/measures/services/bald.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from typing import Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.measures.models import MedidaGeneral
from app.measures.bald_contrib_models import BaldPeriodContribution
from app.ingestion.models import IngestionFile

from app.measures.services.common import (
    _file_id,
    _file_anio,
    _file_mes,
    _safe_refresh,
    _to_float,
    _recalcular_energia_neta_y_perdidas,
)


# ---------- helpers BALD ----------


def _sum_contribuciones_bald(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    ventana_publicacion: str,
) -> dict[str, float]:
    row = (
        db.query(
            func.coalesce(func.sum(BaldPeriodContribution.energia_publicada_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_autoconsumo_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_pf_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_frontera_dd_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_generada_kwh), 0.0),
        )
        .filter(
            BaldPeriodContribution.tenant_id == tenant_id,
            BaldPeriodContribution.empresa_id == empresa_id,
            BaldPeriodContribution.anio == anio,
            BaldPeriodContribution.mes == mes,
            BaldPeriodContribution.ventana_publicacion == ventana_publicacion,
        )
        .one()
    )

    return {
        "energia_publicada_kwh": float(row[0] or 0.0),
        "energia_autoconsumo_kwh": float(row[1] or 0.0),
        "energia_pf_kwh": float(row[2] or 0.0),
        "energia_frontera_dd_kwh": float(row[3] or 0.0),
        "energia_generada_kwh": float(row[4] or 0.0),
    }


def _get_existing_bald_period_window(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    ventana_publicacion: str,
) -> set[tuple[int, int, str]]:
    rows = (
        db.query(
            BaldPeriodContribution.anio,
            BaldPeriodContribution.mes,
            BaldPeriodContribution.ventana_publicacion,
        )
        .filter(
            BaldPeriodContribution.tenant_id == tenant_id,
            BaldPeriodContribution.empresa_id == empresa_id,
            BaldPeriodContribution.anio == anio,
            BaldPeriodContribution.mes == mes,
            BaldPeriodContribution.ventana_publicacion == ventana_publicacion,
        )
        .distinct()
        .all()
    )

    result: set[tuple[int, int, str]] = set()
    for anio_row, mes_row, ventana_row in rows:
        if anio_row is not None and mes_row is not None and ventana_row:
            result.add((int(anio_row), int(mes_row), str(ventana_row)))
    return result


def _rebuild_medida_general_bald_window(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    ventana_publicacion: str,
    fichero: IngestionFile,
    punto_id_default: str = "BALD",
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

    sums = _sum_contribuciones_bald(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        ventana_publicacion=ventana_publicacion,
    )

    sufijo = ventana_publicacion.lower()

    setattr(mg, f"energia_publicada_{sufijo}_kwh", float(sums["energia_publicada_kwh"]))
    setattr(mg, f"energia_autoconsumo_{sufijo}_kwh", float(sums["energia_autoconsumo_kwh"]))
    setattr(mg, f"energia_pf_{sufijo}_kwh", float(sums["energia_pf_kwh"]))
    setattr(mg, f"energia_frontera_dd_{sufijo}_kwh", float(sums["energia_frontera_dd_kwh"]))
    setattr(mg, f"energia_generada_{sufijo}_kwh", float(sums["energia_generada_kwh"]))

    mg.file_id = _file_id(fichero)  # type: ignore[assignment]
    _recalcular_energia_neta_y_perdidas(mg)
    return mg


def _save_bald_period_contribution_and_rebuild(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    anio: int,
    mes: int,
    ventana_publicacion: str,
    energia_publicada_kwh: float,
    energia_autoconsumo_kwh: float,
    energia_pf_kwh: float,
    energia_frontera_dd_kwh: float,
    energia_generada_kwh: float,
) -> MedidaGeneral:
    previos = _get_existing_bald_period_window(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        ventana_publicacion=ventana_publicacion,
    )

    (
        db.query(BaldPeriodContribution)
        .filter(
            BaldPeriodContribution.tenant_id == tenant_id,
            BaldPeriodContribution.empresa_id == empresa_id,
            BaldPeriodContribution.anio == anio,
            BaldPeriodContribution.mes == mes,
            BaldPeriodContribution.ventana_publicacion == ventana_publicacion,
        )
        .delete(synchronize_session=False)
    )

    db.flush()

    contrib = BaldPeriodContribution(  # type: ignore[call-arg]
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
        anio=anio,
        mes=mes,
        ventana_publicacion=ventana_publicacion,
        energia_publicada_kwh=float(energia_publicada_kwh),
        energia_autoconsumo_kwh=float(energia_autoconsumo_kwh),
        energia_pf_kwh=float(energia_pf_kwh),
        energia_frontera_dd_kwh=float(energia_frontera_dd_kwh),
        energia_generada_kwh=float(energia_generada_kwh),
        is_principal=True,
    )
    db.add(contrib)
    db.flush()

    afectados = set(previos) | {(anio, mes, ventana_publicacion)}

    mg_result: MedidaGeneral | None = None
    for anio_af, mes_af, ventana_af in sorted(afectados):
        mg = _rebuild_medida_general_bald_window(
            db=db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio_af,
            mes=mes_af,
            ventana_publicacion=ventana_af,
            fichero=fichero,
            punto_id_default="BALD",
        )
        if (anio_af, mes_af, ventana_af) == (anio, mes, ventana_publicacion):
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
        raise ValueError("No se pudo reconstruir la medida general BALD tras guardar contribuciones")

    _safe_refresh(db, mg_result)
    return mg_result


# ---------- procesador BALD ----------


def procesar_bald_medidas_general(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    periodo_bald: str,
    fila: Dict[str, Any],
) -> MedidaGeneral:
    periodo_bald_norm = str(periodo_bald).upper()
    if periodo_bald_norm not in {"M2", "M7", "M11", "ART15"}:
        raise ValueError(f"Periodo BALD no reconocido: {periodo_bald}")

    anio = _file_anio(fichero)
    mes = _file_mes(fichero)

    demanda_suministrada = _to_float(fila.get("Demanda_suministrada"))
    demanda_vertida = _to_float(fila.get("Demanda_vertida"))
    dd_a = _to_float(fila.get("DD_A"))
    dd_s = _to_float(fila.get("DD_S"))
    ed = _to_float(fila.get("ED"))
    cil = _to_float(fila.get("CIL"))
    energia_generada = ed + cil

    return _save_bald_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        ventana_publicacion=periodo_bald_norm,
        energia_publicada_kwh=float(demanda_suministrada),
        energia_autoconsumo_kwh=float(demanda_vertida),
        energia_pf_kwh=float(dd_a),
        energia_frontera_dd_kwh=float(dd_s),
        energia_generada_kwh=float(energia_generada),
    )