# app/medidas_graficos/routes_ps.py
# pyright: reportMissingImports=false
from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, false as sql_false
from sqlalchemy.orm import Query as SAQuery, Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.permissions import get_allowed_empresa_ids
from app.empresas.models import Empresa
from app.measures.models import MedidaPS
from app.medidas_graficos import schemas as graficos_schemas
from app.tenants.models import User

router = APIRouter(prefix="/medidas-graficos-ps", tags=["medidas-graficos-ps"])


def _period_key(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def _period_label(anio: int, mes: int) -> str:
    month_names = {
        1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr",
        5: "May", 6: "Jun", 7: "Jul", 8: "Ago",
        9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
    }
    return f"{month_names.get(mes, str(mes))} {anio}"


def _base_ps_query(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    empresa_ids: list[int] | None = None,
    anios: list[int] | None = None,
    meses: list[int] | None = None,
) -> SAQuery[Any]:
    query: SAQuery[Any] = db.query(MedidaPS).filter(
        MedidaPS.tenant_id == tenant_id
    )
    if not allowed_empresa_ids:
        return query.filter(sql_false())
    query = query.filter(MedidaPS.empresa_id.in_(allowed_empresa_ids))
    if empresa_ids:
        query = query.filter(MedidaPS.empresa_id.in_(empresa_ids))
    if anios:
        query = query.filter(MedidaPS.anio.in_(anios))
    if meses:
        query = query.filter(MedidaPS.mes.in_(meses))
    return query


def _build_ps_serie(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    field_name: str,
    serie_key: str,
    serie_label: str,
    empresa_ids: list[int] | None,
    anios: list[int] | None,
    meses: list[int] | None,
) -> graficos_schemas.GraficoSerie:
    field = getattr(MedidaPS, field_name)
    rows = (
        _base_ps_query(
            db,
            tenant_id=tenant_id,
            allowed_empresa_ids=allowed_empresa_ids,
            empresa_ids=empresa_ids,
            anios=anios,
            meses=meses,
        )
        .with_entities(
            MedidaPS.anio.label("anio"),
            MedidaPS.mes.label("mes"),
            func.sum(field).label("value"),
        )
        .group_by(MedidaPS.anio, MedidaPS.mes)
        .order_by(MedidaPS.anio.asc(), MedidaPS.mes.asc())
        .all()
    )
    points: list[graficos_schemas.GraficoPoint] = [
        graficos_schemas.GraficoPoint(
            period_key=_period_key(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            period_label=_period_label(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            value=float(cast(Any, row).value or 0.0),
        )
        for row in rows
    ]
    return graficos_schemas.GraficoSerie(
        serie_key=serie_key,
        serie_label=serie_label,
        points=points,
    )


def _build_ps_serie_sum(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    field_names: list[str],
    serie_key: str,
    serie_label: str,
    empresa_ids: list[int] | None,
    anios: list[int] | None,
    meses: list[int] | None,
) -> graficos_schemas.GraficoSerie:
    """Construye una serie sumando múltiples campos de BD — para totales calculados."""
    fields = [getattr(MedidaPS, fn) for fn in field_names]
    total_expr = fields[0]
    for f in fields[1:]:
        total_expr = total_expr + f
    rows = (
        _base_ps_query(
            db,
            tenant_id=tenant_id,
            allowed_empresa_ids=allowed_empresa_ids,
            empresa_ids=empresa_ids,
            anios=anios,
            meses=meses,
        )
        .with_entities(
            MedidaPS.anio.label("anio"),
            MedidaPS.mes.label("mes"),
            func.sum(total_expr).label("value"),
        )
        .group_by(MedidaPS.anio, MedidaPS.mes)
        .order_by(MedidaPS.anio.asc(), MedidaPS.mes.asc())
        .all()
    )
    points: list[graficos_schemas.GraficoPoint] = [
        graficos_schemas.GraficoPoint(
            period_key=_period_key(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            period_label=_period_label(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            value=float(cast(Any, row).value or 0.0),
        )
        for row in rows
    ]
    return graficos_schemas.GraficoSerie(
        serie_key=serie_key,
        serie_label=serie_label,
        points=points,
    )


@router.get(
    "/series-cups",
    response_model=graficos_schemas.GraficosPsSeriesResponse,
)
def get_medidas_graficos_ps_cups(
    empresa_ids: list[int] | None = Query(default=None),
    anios: list[int] | None = Query(default=None),
    meses: list[int] | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> graficos_schemas.GraficosPsSeriesResponse:
    tenant_id_int = int(cast(int, current_user.tenant_id))
    allowed_empresa_ids = get_allowed_empresa_ids(db, current_user)

    tenant_empresa_rows = (
        db.query(Empresa.id)
        .filter(
            Empresa.tenant_id == tenant_id_int,
            Empresa.id.in_(allowed_empresa_ids),
        )
        .all()
    ) if allowed_empresa_ids else []
    tenant_empresa_ids = [int(cast(Any, row)[0]) for row in tenant_empresa_rows]

    selected_empresa_ids = [
        eid for eid in (empresa_ids or []) if eid in tenant_empresa_ids
    ]
    all_selected = (
        len(selected_empresa_ids) == 0
        or len(selected_empresa_ids) == len(tenant_empresa_ids)
    )
    effective_empresa_ids = None if all_selected else selected_empresa_ids

    # ── CUPS por tipo ────────────────────────────────────────────────────
    cups_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, serie_key, serie_label in (
        ("cups_tipo_1", "cups_t1",    "CUPS Tipo 1"),
        ("cups_tipo_2", "cups_t2",    "CUPS Tipo 2"),
        ("cups_tipo_3", "cups_t3",    "CUPS Tipo 3"),
        ("cups_tipo_4", "cups_t4",    "CUPS Tipo 4"),
        ("cups_tipo_5", "cups_t5",    "CUPS Tipo 5"),
        ("cups_total",  "cups_total", "CUPS Total"),
    ):
        cups_series.append(_build_ps_serie(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, serie_key=serie_key, serie_label=serie_label,
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        ))

    # ── Energía por tipo ─────────────────────────────────────────────────
    energia_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, serie_key, serie_label in (
        ("energia_ps_tipo_1_kwh", "en_t1",    "Energía Tipo 1 (kWh)"),
        ("energia_ps_tipo_2_kwh", "en_t2",    "Energía Tipo 2 (kWh)"),
        ("energia_ps_tipo_3_kwh", "en_t3",    "Energía Tipo 3 (kWh)"),
        ("energia_ps_tipo_4_kwh", "en_t4",    "Energía Tipo 4 (kWh)"),
        ("energia_ps_tipo_5_kwh", "en_t5",    "Energía Tipo 5 (kWh)"),
        ("energia_ps_total_kwh",  "en_total", "Energía Total (kWh)"),
    ):
        energia_series.append(_build_ps_serie(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, serie_key=serie_key, serie_label=serie_label,
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        ))

    # ── Importe por tipo ─────────────────────────────────────────────────
    importe_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, serie_key, serie_label in (
        ("importe_tipo_1_eur", "im_t1",    "Importe Tipo 1 (€)"),
        ("importe_tipo_2_eur", "im_t2",    "Importe Tipo 2 (€)"),
        ("importe_tipo_3_eur", "im_t3",    "Importe Tipo 3 (€)"),
        ("importe_tipo_4_eur", "im_t4",    "Importe Tipo 4 (€)"),
        ("importe_tipo_5_eur", "im_t5",    "Importe Tipo 5 (€)"),
        ("importe_total_eur",  "im_total", "Importe Total (€)"),
    ):
        importe_series.append(_build_ps_serie(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, serie_key=serie_key, serie_label=serie_label,
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        ))

    # ── Energía por tarifa ───────────────────────────────────────────────
    _ENERGIA_TARIFAS = [
        "energia_tarifa_20td_kwh", "energia_tarifa_30td_kwh",
        "energia_tarifa_30tdve_kwh", "energia_tarifa_61td_kwh",
    ]
    energia_tarifa_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, serie_key, serie_label in (
        ("energia_tarifa_20td_kwh",   "et_20td",   "E 2.0TD (kWh)"),
        ("energia_tarifa_30td_kwh",   "et_30td",   "E 3.0TD (kWh)"),
        ("energia_tarifa_30tdve_kwh", "et_30tdve", "E 3.0TDVE (kWh)"),
        ("energia_tarifa_61td_kwh",   "et_61td",   "E 6.1TD (kWh)"),
    ):
        energia_tarifa_series.append(_build_ps_serie(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, serie_key=serie_key, serie_label=serie_label,
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        ))
    # Total tarifas energía — suma de los 4 campos reales en BD
    energia_tarifa_series.append(_build_ps_serie_sum(
        db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
        field_names=_ENERGIA_TARIFAS,
        serie_key="et_total", serie_label="E Tarifas Total (kWh)",
        empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
    ))

    # ── CUPS por tarifa ──────────────────────────────────────────────────
    _CUPS_TARIFAS = [
        "cups_tarifa_20td", "cups_tarifa_30td",
        "cups_tarifa_30tdve", "cups_tarifa_61td",
    ]
    cups_tarifa_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, serie_key, serie_label in (
        ("cups_tarifa_20td",   "ct_20td",   "CUPS 2.0TD"),
        ("cups_tarifa_30td",   "ct_30td",   "CUPS 3.0TD"),
        ("cups_tarifa_30tdve", "ct_30tdve", "CUPS 3.0TDVE"),
        ("cups_tarifa_61td",   "ct_61td",   "CUPS 6.1TD"),
    ):
        cups_tarifa_series.append(_build_ps_serie(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, serie_key=serie_key, serie_label=serie_label,
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        ))
    # Total tarifas CUPS — suma de los 4 campos reales en BD
    cups_tarifa_series.append(_build_ps_serie_sum(
        db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
        field_names=_CUPS_TARIFAS,
        serie_key="ct_total", serie_label="CUPS Tarifas Total",
        empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
    ))

    # ── Importe por tarifa ───────────────────────────────────────────────
    _IMPORTE_TARIFAS = [
        "importe_tarifa_20td_eur", "importe_tarifa_30td_eur",
        "importe_tarifa_30tdve_eur", "importe_tarifa_61td_eur",
    ]
    importe_tarifa_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, serie_key, serie_label in (
        ("importe_tarifa_20td_eur",   "it_20td",   "Importe 2.0TD (€)"),
        ("importe_tarifa_30td_eur",   "it_30td",   "Importe 3.0TD (€)"),
        ("importe_tarifa_30tdve_eur", "it_30tdve", "Importe 3.0TDVE (€)"),
        ("importe_tarifa_61td_eur",   "it_61td",   "Importe 6.1TD (€)"),
    ):
        importe_tarifa_series.append(_build_ps_serie(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, serie_key=serie_key, serie_label=serie_label,
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        ))
    # Total tarifas importe — suma de los 4 campos reales en BD
    importe_tarifa_series.append(_build_ps_serie_sum(
        db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
        field_names=_IMPORTE_TARIFAS,
        serie_key="it_total", serie_label="Importe Tarifas Total (€)",
        empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
    ))

    return graficos_schemas.GraficosPsSeriesResponse(
        filters=graficos_schemas.GraficosFiltersApplied(
            empresa_ids=selected_empresa_ids,
            anios=anios or [],
            meses=meses or [],
            aggregation="sum",
        ),
        scope=graficos_schemas.GraficosScope(
            all_empresas_selected=all_selected,
            aggregation="sum",
        ),
        cups_por_tipo=graficos_schemas.GraficoSeriesGroup(series=cups_series),
        energia_por_tipo=graficos_schemas.GraficoSeriesGroup(series=energia_series),
        importe_por_tipo=graficos_schemas.GraficoSeriesGroup(series=importe_series),
        energia_por_tarifa=graficos_schemas.GraficoSeriesGroup(series=energia_tarifa_series),
        cups_por_tarifa=graficos_schemas.GraficoSeriesGroup(series=cups_tarifa_series),
        importe_por_tarifa=graficos_schemas.GraficoSeriesGroup(series=importe_tarifa_series),
    )