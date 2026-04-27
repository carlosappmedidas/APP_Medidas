# app/medidas_graficos/routes.py
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
from app.measures.models import MedidaGeneral
from app.medidas_graficos import schemas as graficos_schemas
from app.tenants.models import User

router = APIRouter(prefix="/medidas-graficos", tags=["medidas-graficos"])


def _period_key(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def _period_label(anio: int, mes: int) -> str:
    month_names = {
        1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr",
        5: "May", 6: "Jun", 7: "Jul", 8: "Ago",
        9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
    }
    return f"{month_names.get(mes, str(mes))} {anio}"


def _base_general_query(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    empresa_ids: list[int] | None = None,
    anios: list[int] | None = None,
    meses: list[int] | None = None,
) -> SAQuery[Any]:
    query: SAQuery[Any] = db.query(MedidaGeneral).filter(
        MedidaGeneral.tenant_id == tenant_id
    )
    if not allowed_empresa_ids:
        return query.filter(sql_false())
    query = query.filter(MedidaGeneral.empresa_id.in_(allowed_empresa_ids))
    if empresa_ids:
        query = query.filter(MedidaGeneral.empresa_id.in_(empresa_ids))
    if anios:
        query = query.filter(MedidaGeneral.anio.in_(anios))
    if meses:
        query = query.filter(MedidaGeneral.mes.in_(meses))
    return query


def _get_tenant_empresas(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
) -> list[Empresa]:
    if not allowed_empresa_ids:
        return []
    empresas = (
        db.query(Empresa)
        .filter(
            Empresa.tenant_id == tenant_id,
            Empresa.id.in_(allowed_empresa_ids),
        )
        .order_by(Empresa.nombre.asc(), Empresa.id.asc())
        .all()
    )
    return cast(list[Empresa], empresas)


def _build_series_aggregated(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    field_name: str,
    label: str,
    empresa_ids: list[int] | None,
    anios: list[int] | None,
    meses: list[int] | None,
    aggregation: str = "avg",
) -> list[graficos_schemas.GraficoSerie]:
    field = getattr(MedidaGeneral, field_name)
    agg_func = func.sum(field) if aggregation == "sum" else func.avg(field)
    rows = (
        _base_general_query(
            db,
            tenant_id=tenant_id,
            allowed_empresa_ids=allowed_empresa_ids,
            empresa_ids=empresa_ids,
            anios=anios,
            meses=meses,
        )
        .with_entities(
            MedidaGeneral.anio.label("anio"),
            MedidaGeneral.mes.label("mes"),
            agg_func.label("value"),
        )
        .group_by(MedidaGeneral.anio, MedidaGeneral.mes)
        .order_by(MedidaGeneral.anio.asc(), MedidaGeneral.mes.asc())
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
    return [
        graficos_schemas.GraficoSerie(
            serie_key="all",
            serie_label=label,
            points=points,
        )
    ]


def _build_series_by_empresa(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    field_name: str,
    empresa_ids: list[int],
    anios: list[int] | None,
    meses: list[int] | None,
) -> list[graficos_schemas.GraficoSerie]:
    field = getattr(MedidaGeneral, field_name)
    safe_empresa_ids = [eid for eid in empresa_ids if eid in allowed_empresa_ids]
    if not safe_empresa_ids:
        return []
    empresas = (
        db.query(Empresa)
        .filter(
            Empresa.tenant_id == tenant_id,
            Empresa.id.in_(safe_empresa_ids),
        )
        .order_by(Empresa.nombre.asc(), Empresa.id.asc())
        .all()
    )
    empresa_name_by_id: dict[int, str] = {
        cast(int, empresa.id): cast(str | None, empresa.nombre) or f"Empresa {cast(int, empresa.id)}"
        for empresa in empresas
    }
    rows = (
        _base_general_query(
            db,
            tenant_id=tenant_id,
            allowed_empresa_ids=allowed_empresa_ids,
            empresa_ids=safe_empresa_ids,
            anios=anios,
            meses=meses,
        )
        .with_entities(
            MedidaGeneral.empresa_id.label("empresa_id"),
            MedidaGeneral.anio.label("anio"),
            MedidaGeneral.mes.label("mes"),
            func.avg(field).label("value"),
        )
        .group_by(MedidaGeneral.empresa_id, MedidaGeneral.anio, MedidaGeneral.mes)
        .order_by(
            MedidaGeneral.empresa_id.asc(),
            MedidaGeneral.anio.asc(),
            MedidaGeneral.mes.asc(),
        )
        .all()
    )
    points_by_empresa: dict[int, list[graficos_schemas.GraficoPoint]] = {}
    for row in rows:
        row_any = cast(Any, row)
        empresa_id = int(row_any.empresa_id)
        points_by_empresa.setdefault(empresa_id, []).append(
            graficos_schemas.GraficoPoint(
                period_key=_period_key(int(row_any.anio), int(row_any.mes)),
                period_label=_period_label(int(row_any.anio), int(row_any.mes)),
                value=float(row_any.value or 0.0),
            )
        )
    series: list[graficos_schemas.GraficoSerie] = []
    for empresa in empresas:
        empresa_id = cast(int, empresa.id)
        series.append(
            graficos_schemas.GraficoSerie(
                serie_key=f"empresa_{empresa_id}",
                serie_label=empresa_name_by_id.get(empresa_id, f"Empresa {empresa_id}"),
                points=points_by_empresa.get(empresa_id, []),
            )
        )
    return series


def _build_adquisicion_series(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    empresa_ids: list[int] | None,
    all_selected: bool,
    selected_empresa_ids: list[int],
    anios: list[int] | None,
    meses: list[int] | None,
    aggregation: str = "sum",
) -> graficos_schemas.GraficoSerie:
    """
    Adquisición = PF + E generada - E frontera DD, usando jerarquía de ventanas:
    ART15 > M11 > M7 > M2 > M1(final)
    Para cada período elige la ventana más actualizada que tenga datos.
    Devuelve el campo ventana en cada GraficoPoint para mostrarlo en el tooltip.
    """
    effective_ids = None if all_selected else selected_empresa_ids
    agg_func = func.sum if aggregation == "sum" else func.avg

    rows = (
        _base_general_query(
            db,
            tenant_id=tenant_id,
            allowed_empresa_ids=allowed_empresa_ids,
            empresa_ids=effective_ids,
            anios=anios,
            meses=meses,
        )
        .with_entities(
            MedidaGeneral.anio.label("anio"),
            MedidaGeneral.mes.label("mes"),
            agg_func(MedidaGeneral.energia_pf_final_kwh).label("pf_m1"),
            agg_func(MedidaGeneral.energia_generada_kwh).label("gen_m1"),
            agg_func(MedidaGeneral.energia_frontera_dd_kwh).label("front_m1"),
            agg_func(MedidaGeneral.energia_pf_m2_kwh).label("pf_m2"),
            agg_func(MedidaGeneral.energia_generada_m2_kwh).label("gen_m2"),
            agg_func(MedidaGeneral.energia_frontera_dd_m2_kwh).label("front_m2"),
            agg_func(MedidaGeneral.energia_pf_m7_kwh).label("pf_m7"),
            agg_func(MedidaGeneral.energia_generada_m7_kwh).label("gen_m7"),
            agg_func(MedidaGeneral.energia_frontera_dd_m7_kwh).label("front_m7"),
            agg_func(MedidaGeneral.energia_pf_m11_kwh).label("pf_m11"),
            agg_func(MedidaGeneral.energia_generada_m11_kwh).label("gen_m11"),
            agg_func(MedidaGeneral.energia_frontera_dd_m11_kwh).label("front_m11"),
            agg_func(MedidaGeneral.energia_pf_art15_kwh).label("pf_art15"),
            agg_func(MedidaGeneral.energia_generada_art15_kwh).label("gen_art15"),
            agg_func(MedidaGeneral.energia_frontera_dd_art15_kwh).label("front_art15"),
        )
        .group_by(MedidaGeneral.anio, MedidaGeneral.mes)
        .order_by(MedidaGeneral.anio.asc(), MedidaGeneral.mes.asc())
        .all()
    )

    def _f(v: Any) -> float:
        if v is None:
            return 0.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    _VENTANA_NAMES = {
        "pf_art15": "ART15", "pf_m11": "M11",
        "pf_m7": "M7", "pf_m2": "M2", "pf_m1": "M1",
    }

    def _resolve_adq(row: Any) -> tuple[float, str]:
        """Jerarquía ART15 > M11 > M7 > M2 > M1. Devuelve (valor, nombre_ventana)."""
        for pf_key, gen_key, front_key in (
            ("pf_art15", "gen_art15", "front_art15"),
            ("pf_m11",   "gen_m11",   "front_m11"),
            ("pf_m7",    "gen_m7",    "front_m7"),
            ("pf_m2",    "gen_m2",    "front_m2"),
            ("pf_m1",    "gen_m1",    "front_m1"),
        ):
            pf    = _f(getattr(row, pf_key, None))
            gen   = _f(getattr(row, gen_key, None))
            front = _f(getattr(row, front_key, None))
            if pf != 0.0 or gen != 0.0 or front != 0.0:
                return pf + gen - front, _VENTANA_NAMES[pf_key]
        return 0.0, "M1"

    points: list[graficos_schemas.GraficoPoint] = []
    for row in rows:
        value, ventana = _resolve_adq(row)
        points.append(graficos_schemas.GraficoPoint(
            period_key=_period_key(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            period_label=_period_label(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            value=value,
            ventana=ventana,
        ))

    return graficos_schemas.GraficoSerie(
        serie_key="adquisicion",
        serie_label="Adquisición",
        points=points,
    )


def _build_adquisicion_por_ventana(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: list[int],
    empresa_ids: list[int] | None,
    anios: list[int] | None,
    meses: list[int] | None,
    aggregation: str = "sum",
) -> list[graficos_schemas.GraficoSerie]:
    """
    Devuelve 5 series de adquisición, una por ventana de publicación:
      adq_m1   = pf_final    + generada    - frontera_dd
      adq_m2   = pf_m2       + generada_m2 - frontera_dd_m2
      adq_m7   = pf_m7       + generada_m7 - frontera_dd_m7
      adq_m11  = pf_m11      + generada_m11 - frontera_dd_m11
      adq_art15= pf_art15    + generada_art15 - frontera_dd_art15
    """
    agg_func = func.sum if aggregation == "sum" else func.avg

    ventanas = [
        (
            "adq_m1", "Adq. M1",
            MedidaGeneral.energia_pf_final_kwh,
            MedidaGeneral.energia_generada_kwh,
            MedidaGeneral.energia_frontera_dd_kwh,
        ),
        (
            "adq_m2", "Adq. M2",
            MedidaGeneral.energia_pf_m2_kwh,
            MedidaGeneral.energia_generada_m2_kwh,
            MedidaGeneral.energia_frontera_dd_m2_kwh,
        ),
        (
            "adq_m7", "Adq. M7",
            MedidaGeneral.energia_pf_m7_kwh,
            MedidaGeneral.energia_generada_m7_kwh,
            MedidaGeneral.energia_frontera_dd_m7_kwh,
        ),
        (
            "adq_m11", "Adq. M11",
            MedidaGeneral.energia_pf_m11_kwh,
            MedidaGeneral.energia_generada_m11_kwh,
            MedidaGeneral.energia_frontera_dd_m11_kwh,
        ),
        (
            "adq_art15", "Adq. ART15",
            MedidaGeneral.energia_pf_art15_kwh,
            MedidaGeneral.energia_generada_art15_kwh,
            MedidaGeneral.energia_frontera_dd_art15_kwh,
        ),
    ]

    series: list[graficos_schemas.GraficoSerie] = []
    for serie_key, serie_label, pf_field, gen_field, front_field in ventanas:
        rows = (
            _base_general_query(
                db,
                tenant_id=tenant_id,
                allowed_empresa_ids=allowed_empresa_ids,
                empresa_ids=empresa_ids,
                anios=anios,
                meses=meses,
            )
            .with_entities(
                MedidaGeneral.anio.label("anio"),
                MedidaGeneral.mes.label("mes"),
                agg_func(pf_field + gen_field - front_field).label("value"),
            )
            .group_by(MedidaGeneral.anio, MedidaGeneral.mes)
            .order_by(MedidaGeneral.anio.asc(), MedidaGeneral.mes.asc())
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
        series.append(
            graficos_schemas.GraficoSerie(
                serie_key=serie_key,
                serie_label=serie_label,
                points=points,
            )
        )
    return series


@router.get(
    "/filters",
    response_model=graficos_schemas.GraficoFiltersResponse,
)
def get_medidas_graficos_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> graficos_schemas.GraficoFiltersResponse:
    tenant_id_int = int(cast(int, current_user.tenant_id))
    allowed_empresa_ids = get_allowed_empresa_ids(db, current_user)
    empresas = _get_tenant_empresas(
        db,
        tenant_id=tenant_id_int,
        allowed_empresa_ids=allowed_empresa_ids,
    )
    if not allowed_empresa_ids:
        return graficos_schemas.GraficoFiltersResponse(
            empresas=[],
            anios=[],
            meses=[],
        )
    period_rows = (
        db.query(MedidaGeneral.anio, MedidaGeneral.mes)
        .filter(
            MedidaGeneral.tenant_id == tenant_id_int,
            MedidaGeneral.empresa_id.in_(allowed_empresa_ids),
        )
        .distinct()
        .order_by(MedidaGeneral.anio.desc(), MedidaGeneral.mes.asc())
        .all()
    )
    anios = sorted({int(cast(Any, row).anio) for row in period_rows}, reverse=True)
    meses = sorted({int(cast(Any, row).mes) for row in period_rows})
    return graficos_schemas.GraficoFiltersResponse(
        empresas=[
            graficos_schemas.GraficoEmpresaOption(
                id=cast(int, empresa.id),
                nombre=cast(str | None, empresa.nombre) or f"Empresa {cast(int, empresa.id)}",
            )
            for empresa in empresas
        ],
        anios=anios,
        meses=meses,
    )


@router.get(
    "/series",
    response_model=graficos_schemas.GraficosSeriesResponse,
)
def get_medidas_graficos_series(
    empresa_ids: list[int] | None = Query(default=None),
    anios: list[int] | None = Query(default=None),
    meses: list[int] | None = Query(default=None),
    aggregation: str = Query(default="avg"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> graficos_schemas.GraficosSeriesResponse:
    tenant_id_int = int(cast(int, current_user.tenant_id))
    allowed_empresa_ids = get_allowed_empresa_ids(db, current_user)
    tenant_empresas = _get_tenant_empresas(
        db,
        tenant_id=tenant_id_int,
        allowed_empresa_ids=allowed_empresa_ids,
    )
    tenant_empresa_ids = [cast(int, empresa.id) for empresa in tenant_empresas]
    selected_empresa_ids = [
        empresa_id
        for empresa_id in (empresa_ids or [])
        if empresa_id in tenant_empresa_ids
    ]
    all_selected = (
        len(selected_empresa_ids) == 0
        or len(selected_empresa_ids) == len(tenant_empresa_ids)
    )
    effective_empresa_ids = None if all_selected else selected_empresa_ids

    # Energía facturada — kWh: siempre suma
    energia_facturada_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_neta_facturada_kwh", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
            aggregation="sum",
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_neta_facturada_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )

    # Pérdidas % — promedio
    perdidas_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_pct", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
            aggregation="avg",
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_pct",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )

    # Pérdidas kWh total — suma
    perdidas_kwh_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_kwh", label="Pérdidas E facturada (kWh)",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
            aggregation="sum",
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )

    # Autoconsumo kWh — suma
    autoconsumo_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_autoconsumo_kwh", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
            aggregation="sum",
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_autoconsumo_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )

    # Energía generada kWh — suma
    energia_generada_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_generada_kwh", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
            aggregation="sum",
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_generada_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )

    # Energías publicadas — suma
    energias_publicadas_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, label, key in (
        ("energia_neta_facturada_m2_kwh",    "M2",    "m2"),
        ("energia_neta_facturada_m7_kwh",    "M7",    "m7"),
        ("energia_neta_facturada_m11_kwh",   "M11",   "m11"),
        ("energia_neta_facturada_art15_kwh", "ART15", "art15"),
    ):
        aggregated = _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, label=label,
            empresa_ids=effective_empresa_ids if all_selected else selected_empresa_ids,
            anios=anios, meses=meses, aggregation="sum",
        )[0]
        energias_publicadas_series.append(
            graficos_schemas.GraficoSerie(serie_key=key, serie_label=label, points=aggregated.points)
        )

    # Energías PF — suma
    energias_pf_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, label, key in (
        ("energia_pf_final_kwh",   "E PF Final",  "pf_final"),
        ("energia_pf_m2_kwh",      "E PF M2",     "pf_m2"),
        ("energia_pf_m7_kwh",      "E PF M7",     "pf_m7"),
        ("energia_pf_m11_kwh",     "E PF M11",    "pf_m11"),
        ("energia_pf_art15_kwh",   "E PF ART15",  "pf_art15"),
    ):
        aggregated = _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, label=label,
            empresa_ids=effective_empresa_ids if all_selected else selected_empresa_ids,
            anios=anios, meses=meses, aggregation="sum",
        )[0]
        energias_pf_series.append(
            graficos_schemas.GraficoSerie(serie_key=key, serie_label=label, points=aggregated.points)
        )

    # Pérdidas ventanas % — promedio
    perdidas_ventanas_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, label, key in (
        ("perdidas_e_facturada_m2_pct",    "Pérdidas M2 (%)",    "perd_m2"),
        ("perdidas_e_facturada_m7_pct",    "Pérdidas M7 (%)",    "perd_m7"),
        ("perdidas_e_facturada_m11_pct",   "Pérdidas M11 (%)",   "perd_m11"),
        ("perdidas_e_facturada_art15_pct", "Pérdidas ART15 (%)", "perd_art15"),
    ):
        aggregated = _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, label=label,
            empresa_ids=effective_empresa_ids if all_selected else selected_empresa_ids,
            anios=anios, meses=meses, aggregation="avg",
        )[0]
        perdidas_ventanas_series.append(
            graficos_schemas.GraficoSerie(serie_key=key, serie_label=label, points=aggregated.points)
        )

    # Pérdidas ventanas kWh — suma
    perdidas_kwh_ventanas_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, label, key in (
        ("perdidas_e_facturada_m2_kwh",    "Pérdidas M2 (kWh)",    "perd_kwh_m2"),
        ("perdidas_e_facturada_m7_kwh",    "Pérdidas M7 (kWh)",    "perd_kwh_m7"),
        ("perdidas_e_facturada_m11_kwh",   "Pérdidas M11 (kWh)",   "perd_kwh_m11"),
        ("perdidas_e_facturada_art15_kwh", "Pérdidas ART15 (kWh)", "perd_kwh_art15"),
    ):
        aggregated = _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, label=label,
            empresa_ids=effective_empresa_ids if all_selected else selected_empresa_ids,
            anios=anios, meses=meses, aggregation="sum",
        )[0]
        perdidas_kwh_ventanas_series.append(
            graficos_schemas.GraficoSerie(serie_key=key, serie_label=label, points=aggregated.points)
        )

    # ── Adquisición con jerarquía ART15 > M11 > M7 > M2 > M1 ────────────
    adquisicion_serie = _build_adquisicion_series(
        db,
        tenant_id=tenant_id_int,
        allowed_empresa_ids=allowed_empresa_ids,
        empresa_ids=effective_empresa_ids,
        all_selected=all_selected,
        selected_empresa_ids=selected_empresa_ids,
        anios=anios,
        meses=meses,
        aggregation="sum",
    )

    # ── Adquisición por ventana individual ────────────────────────────────
    adquisicion_ventanas_series = _build_adquisicion_por_ventana(
        db,
        tenant_id=tenant_id_int,
        allowed_empresa_ids=allowed_empresa_ids,
        empresa_ids=effective_empresa_ids if all_selected else selected_empresa_ids,
        anios=anios,
        meses=meses,
        aggregation="sum",
    )

    return graficos_schemas.GraficosSeriesResponse(
        filters=graficos_schemas.GraficosFiltersApplied(
            empresa_ids=selected_empresa_ids,
            anios=anios or [],
            meses=meses or [],
            aggregation=aggregation,
        ),
        scope=graficos_schemas.GraficosScope(
            all_empresas_selected=all_selected,
            aggregation=aggregation,
        ),
        energia_facturada=graficos_schemas.GraficoSeriesGroup(series=energia_facturada_series),
        perdidas=graficos_schemas.GraficoSeriesGroup(series=perdidas_series),
        perdidas_kwh=graficos_schemas.GraficoSeriesGroup(series=perdidas_kwh_series),
        perdidas_ventanas=graficos_schemas.GraficoSeriesGroup(series=perdidas_ventanas_series),
        perdidas_kwh_ventanas=graficos_schemas.GraficoSeriesGroup(series=perdidas_kwh_ventanas_series),
        energias_publicadas=graficos_schemas.GraficoSeriesGroup(series=energias_publicadas_series),
        energias_pf=graficos_schemas.GraficoSeriesGroup(series=energias_pf_series),
        autoconsumo=graficos_schemas.GraficoSeriesGroup(series=autoconsumo_series),
        energia_generada=graficos_schemas.GraficoSeriesGroup(series=energia_generada_series),
        adquisicion=graficos_schemas.GraficoSeriesGroup(series=[adquisicion_serie]),
        adquisicion_ventanas=graficos_schemas.GraficoSeriesGroup(series=adquisicion_ventanas_series),
    )