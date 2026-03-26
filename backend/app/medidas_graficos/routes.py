# app/medidas_graficos/routes.py
# pyright: reportMissingImports=false
from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, false as sql_false
from sqlalchemy.orm import Query as SAQuery, Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.measures.models import MedidaGeneral
from app.medidas_graficos import schemas as graficos_schemas
from app.tenants.models import User

router = APIRouter(prefix="/medidas-graficos", tags=["medidas-graficos"])


def _allowed_empresa_ids(db: Session, current_user: User) -> list[int]:
    tenant_id = int(cast(int, current_user.tenant_id))
    if bool(getattr(current_user, "is_superuser", False)):
        rows = (
            db.query(Empresa.id)
            .filter(Empresa.tenant_id == tenant_id)
            .order_by(Empresa.id.asc())
            .all()
        )
        return [int(row[0]) for row in rows if row and row[0] is not None]
    raw_ids = getattr(current_user, "empresa_ids_permitidas", None)
    explicit_ids = [int(x) for x in raw_ids if x is not None] if raw_ids else []
    if explicit_ids:
        return explicit_ids
    return []


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
) -> list[graficos_schemas.GraficoSerie]:
    field = getattr(MedidaGeneral, field_name)
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
            func.avg(field).label("value"),
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
) -> graficos_schemas.GraficoSerie:
    """
    Adquisición = E PF Final + E generada - E frontera DD
    Calculado directamente en SQL para mantener consistencia con el dashboard.
    """
    effective_ids = empresa_ids  # None si all_selected, lista si filtrado

    if all_selected:
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
                func.avg(
                    MedidaGeneral.energia_pf_final_kwh
                    + MedidaGeneral.energia_generada_kwh
                    - MedidaGeneral.energia_frontera_dd_kwh
                ).label("value"),
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
        return graficos_schemas.GraficoSerie(
            serie_key="adquisicion",
            serie_label="Adquisición",
            points=points,
        )
    else:
        # Por empresa — devolvemos serie agregada igualmente (avg de la fórmula)
        rows = (
            _base_general_query(
                db,
                tenant_id=tenant_id,
                allowed_empresa_ids=allowed_empresa_ids,
                empresa_ids=selected_empresa_ids,
                anios=anios,
                meses=meses,
            )
            .with_entities(
                MedidaGeneral.anio.label("anio"),
                MedidaGeneral.mes.label("mes"),
                func.avg(
                    MedidaGeneral.energia_pf_final_kwh
                    + MedidaGeneral.energia_generada_kwh
                    - MedidaGeneral.energia_frontera_dd_kwh
                ).label("value"),
            )
            .group_by(MedidaGeneral.anio, MedidaGeneral.mes)
            .order_by(MedidaGeneral.anio.asc(), MedidaGeneral.mes.asc())
            .all()
        )
        points = [
            graficos_schemas.GraficoPoint(
                period_key=_period_key(int(cast(Any, row).anio), int(cast(Any, row).mes)),
                period_label=_period_label(int(cast(Any, row).anio), int(cast(Any, row).mes)),
                value=float(cast(Any, row).value or 0.0),
            )
            for row in rows
        ]
        return graficos_schemas.GraficoSerie(
            serie_key="adquisicion",
            serie_label="Adquisición",
            points=points,
        )


@router.get(
    "/filters",
    response_model=graficos_schemas.GraficoFiltersResponse,
)
def get_medidas_graficos_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> graficos_schemas.GraficoFiltersResponse:
    tenant_id_int = int(cast(int, current_user.tenant_id))
    allowed_empresa_ids = _allowed_empresa_ids(db, current_user)
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
    allowed_empresa_ids = _allowed_empresa_ids(db, current_user)
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

    energia_facturada_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_neta_facturada_kwh", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_neta_facturada_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )
    perdidas_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_pct", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_pct",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )
    perdidas_kwh_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_kwh", label="Pérdidas E facturada (kWh)",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="perdidas_e_facturada_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )
    autoconsumo_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_autoconsumo_kwh", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_autoconsumo_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )
    energia_generada_series = (
        _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_generada_kwh", label="Todas las empresas",
            empresa_ids=effective_empresa_ids, anios=anios, meses=meses,
        )
        if all_selected else
        _build_series_by_empresa(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name="energia_generada_kwh",
            empresa_ids=selected_empresa_ids, anios=anios, meses=meses,
        )
    )

    # Energías publicadas — E neta publicada M2, M7, M11, ART15
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
            anios=anios, meses=meses,
        )[0]
        energias_publicadas_series.append(
            graficos_schemas.GraficoSerie(serie_key=key, serie_label=label, points=aggregated.points)
        )

    # Energías PF — pf_final se mantiene para Gráfica 3, más M2, M7, M11, ART15
    energias_pf_series: list[graficos_schemas.GraficoSerie] = []
    for field_name, label, key in (
        ("energia_pf_final_kwh",   "E PF Final",   "pf_final"),
        ("energia_pf_m2_kwh",      "E PF M2",      "pf_m2"),
        ("energia_pf_m7_kwh",      "E PF M7",      "pf_m7"),
        ("energia_pf_m11_kwh",     "E PF M11",     "pf_m11"),
        ("energia_pf_art15_kwh",   "E PF ART15",   "pf_art15"),
    ):
        aggregated = _build_series_aggregated(
            db, tenant_id=tenant_id_int, allowed_empresa_ids=allowed_empresa_ids,
            field_name=field_name, label=label,
            empresa_ids=effective_empresa_ids if all_selected else selected_empresa_ids,
            anios=anios, meses=meses,
        )[0]
        energias_pf_series.append(
            graficos_schemas.GraficoSerie(serie_key=key, serie_label=label, points=aggregated.points)
        )

    # Pérdidas por ventana en % — M2, M7, M11, ART15
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
            anios=anios, meses=meses,
        )[0]
        perdidas_ventanas_series.append(
            graficos_schemas.GraficoSerie(serie_key=key, serie_label=label, points=aggregated.points)
        )

    # ── Adquisición = E PF Final + E generada - E frontera DD ────────────
    adquisicion_serie = _build_adquisicion_series(
        db,
        tenant_id=tenant_id_int,
        allowed_empresa_ids=allowed_empresa_ids,
        empresa_ids=effective_empresa_ids,
        all_selected=all_selected,
        selected_empresa_ids=selected_empresa_ids,
        anios=anios,
        meses=meses,
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
            aggregation="avg",
        ),
        energia_facturada=graficos_schemas.GraficoSeriesGroup(series=energia_facturada_series),
        perdidas=graficos_schemas.GraficoSeriesGroup(series=perdidas_series),
        perdidas_kwh=graficos_schemas.GraficoSeriesGroup(series=perdidas_kwh_series),
        perdidas_ventanas=graficos_schemas.GraficoSeriesGroup(series=perdidas_ventanas_series),
        energias_publicadas=graficos_schemas.GraficoSeriesGroup(series=energias_publicadas_series),
        energias_pf=graficos_schemas.GraficoSeriesGroup(series=energias_pf_series),
        autoconsumo=graficos_schemas.GraficoSeriesGroup(series=autoconsumo_series),
        energia_generada=graficos_schemas.GraficoSeriesGroup(series=energia_generada_series),
        adquisicion=graficos_schemas.GraficoSeriesGroup(series=[adquisicion_serie]),
    )