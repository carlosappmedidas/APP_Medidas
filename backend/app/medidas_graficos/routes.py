# app/medidas_graficos/routes.py
# pyright: reportMissingImports=false
from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.measures.models import MedidaGeneral
from app.medidas_graficos.schemas import (
    GraficoEmpresaOption,
    GraficoFiltersResponse,
    GraficoPoint,
    GraficoSerie,
    GraficoSeriesGroup,
    GraficosFiltersApplied,
    GraficosScope,
    GraficosSeriesResponse,
)
from app.tenants.models import User

router = APIRouter(prefix="/medidas-graficos", tags=["medidas-graficos"])


def _period_key(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def _period_label(anio: int, mes: int) -> str:
    month_names = {
        1: "Ene",
        2: "Feb",
        3: "Mar",
        4: "Abr",
        5: "May",
        6: "Jun",
        7: "Jul",
        8: "Ago",
        9: "Sep",
        10: "Oct",
        11: "Nov",
        12: "Dic",
    }
    return f"{month_names.get(mes, str(mes))} {anio}"


def _base_general_query(
    db: Session,
    *,
    tenant_id: int,
    empresa_ids: list[int] | None = None,
    anios: list[int] | None = None,
    meses: list[int] | None = None,
):
    query = db.query(MedidaGeneral).filter(MedidaGeneral.tenant_id == tenant_id)

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
) -> list[Empresa]:
    return (
        db.query(Empresa)
        .filter(Empresa.tenant_id == tenant_id)
        .order_by(Empresa.nombre.asc(), Empresa.id.asc())
        .all()
    )


def _build_series_aggregated(
    db: Session,
    *,
    tenant_id: int,
    field_name: str,
    label: str,
    empresa_ids: list[int] | None,
    anios: list[int] | None,
    meses: list[int] | None,
) -> list[GraficoSerie]:
    field = getattr(MedidaGeneral, field_name)

    rows = (
        _base_general_query(
            db,
            tenant_id=tenant_id,
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

    points = [
        GraficoPoint(
            period_key=_period_key(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            period_label=_period_label(int(cast(Any, row).anio), int(cast(Any, row).mes)),
            value=float(cast(Any, row).value or 0.0),
        )
        for row in rows
    ]

    return [GraficoSerie(serie_key="all", serie_label=label, points=points)]


def _build_series_by_empresa(
    db: Session,
    *,
    tenant_id: int,
    field_name: str,
    empresa_ids: list[int],
    anios: list[int] | None,
    meses: list[int] | None,
) -> list[GraficoSerie]:
    field = getattr(MedidaGeneral, field_name)

    empresas = (
        db.query(Empresa)
        .filter(
            Empresa.tenant_id == tenant_id,
            Empresa.id.in_(empresa_ids),
        )
        .order_by(Empresa.nombre.asc(), Empresa.id.asc())
        .all()
    )

    empresa_name_by_id = {
        cast(int, empresa.id): cast(str | None, empresa.nombre) or f"Empresa {cast(int, empresa.id)}"
        for empresa in empresas
    }

    rows = (
        _base_general_query(
            db,
            tenant_id=tenant_id,
            empresa_ids=empresa_ids,
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

    points_by_empresa: dict[int, list[GraficoPoint]] = {}
    for row in rows:
        row_any = cast(Any, row)
        empresa_id = int(row_any.empresa_id)
        points_by_empresa.setdefault(empresa_id, []).append(
            GraficoPoint(
                period_key=_period_key(int(row_any.anio), int(row_any.mes)),
                period_label=_period_label(int(row_any.anio), int(row_any.mes)),
                value=float(row_any.value or 0.0),
            )
        )

    series: list[GraficoSerie] = []
    for empresa in empresas:
        empresa_id = cast(int, empresa.id)
        series.append(
            GraficoSerie(
                serie_key=f"empresa_{empresa_id}",
                serie_label=empresa_name_by_id.get(empresa_id, f"Empresa {empresa_id}"),
                points=points_by_empresa.get(empresa_id, []),
            )
        )

    return series


@router.get("/filters", response_model=GraficoFiltersResponse)
def get_medidas_graficos_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)

    empresas = _get_tenant_empresas(db, tenant_id=tenant_id_int)

    period_rows = (
        db.query(MedidaGeneral.anio, MedidaGeneral.mes)
        .filter(MedidaGeneral.tenant_id == tenant_id_int)
        .distinct()
        .order_by(MedidaGeneral.anio.desc(), MedidaGeneral.mes.asc())
        .all()
    )

    anios = sorted({int(cast(Any, row).anio) for row in period_rows}, reverse=True)
    meses = sorted({int(cast(Any, row).mes) for row in period_rows})

    return GraficoFiltersResponse(
        empresas=[
            GraficoEmpresaOption(
                id=cast(int, empresa.id),
                nombre=cast(str | None, empresa.nombre) or f"Empresa {cast(int, empresa.id)}",
            )
            for empresa in empresas
        ],
        anios=anios,
        meses=meses,
    )


@router.get("/series", response_model=GraficosSeriesResponse)
def get_medidas_graficos_series(
    empresa_ids: list[int] | None = Query(default=None),
    anios: list[int] | None = Query(default=None),
    meses: list[int] | None = Query(default=None),
    aggregation: str = Query(default="avg"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)

    tenant_empresas = _get_tenant_empresas(db, tenant_id=tenant_id_int)
    tenant_empresa_ids = [cast(int, empresa.id) for empresa in tenant_empresas]

    selected_empresa_ids = [
        empresa_id for empresa_id in (empresa_ids or []) if empresa_id in tenant_empresa_ids
    ]

    all_selected = (
        len(selected_empresa_ids) == 0
        or len(selected_empresa_ids) == len(tenant_empresa_ids)
    )

    effective_empresa_ids = None if all_selected else selected_empresa_ids

    energia_facturada_series = (
        _build_series_aggregated(
            db,
            tenant_id=tenant_id_int,
            field_name="energia_neta_facturada_kwh",
            label="Todas las empresas",
            empresa_ids=effective_empresa_ids,
            anios=anios,
            meses=meses,
        )
        if all_selected
        else _build_series_by_empresa(
            db,
            tenant_id=tenant_id_int,
            field_name="energia_neta_facturada_kwh",
            empresa_ids=selected_empresa_ids,
            anios=anios,
            meses=meses,
        )
    )

    perdidas_series = (
        _build_series_aggregated(
            db,
            tenant_id=tenant_id_int,
            field_name="perdidas_e_facturada_pct",
            label="Todas las empresas",
            empresa_ids=effective_empresa_ids,
            anios=anios,
            meses=meses,
        )
        if all_selected
        else _build_series_by_empresa(
            db,
            tenant_id=tenant_id_int,
            field_name="perdidas_e_facturada_pct",
            empresa_ids=selected_empresa_ids,
            anios=anios,
            meses=meses,
        )
    )

    autoconsumo_series = (
        _build_series_aggregated(
            db,
            tenant_id=tenant_id_int,
            field_name="energia_autoconsumo_kwh",
            label="Todas las empresas",
            empresa_ids=effective_empresa_ids,
            anios=anios,
            meses=meses,
        )
        if all_selected
        else _build_series_by_empresa(
            db,
            tenant_id=tenant_id_int,
            field_name="energia_autoconsumo_kwh",
            empresa_ids=selected_empresa_ids,
            anios=anios,
            meses=meses,
        )
    )

    energia_generada_series = (
        _build_series_aggregated(
            db,
            tenant_id=tenant_id_int,
            field_name="energia_generada_kwh",
            label="Todas las empresas",
            empresa_ids=effective_empresa_ids,
            anios=anios,
            meses=meses,
        )
        if all_selected
        else _build_series_by_empresa(
            db,
            tenant_id=tenant_id_int,
            field_name="energia_generada_kwh",
            empresa_ids=selected_empresa_ids,
            anios=anios,
            meses=meses,
        )
    )

    energias_publicadas_series: list[GraficoSerie] = []
    for field_name, label, key in (
        ("energia_neta_facturada_m2_kwh", "M2", "m2"),
        ("energia_neta_facturada_m7_kwh", "M7", "m7"),
        ("energia_neta_facturada_m11_kwh", "M11", "m11"),
        ("energia_neta_facturada_art15_kwh", "ART15", "art15"),
    ):
        aggregated = _build_series_aggregated(
            db,
            tenant_id=tenant_id_int,
            field_name=field_name,
            label=label,
            empresa_ids=effective_empresa_ids if all_selected else selected_empresa_ids,
            anios=anios,
            meses=meses,
        )[0]

        energias_publicadas_series.append(
            GraficoSerie(
                serie_key=key,
                serie_label=label,
                points=aggregated.points,
            )
        )

    return GraficosSeriesResponse(
        filters=GraficosFiltersApplied(
            empresa_ids=selected_empresa_ids,
            anios=anios or [],
            meses=meses or [],
            aggregation=aggregation,
        ),
        scope=GraficosScope(
            all_empresas_selected=all_selected,
            aggregation="avg",
        ),
        energia_facturada=GraficoSeriesGroup(series=energia_facturada_series),
        perdidas=GraficoSeriesGroup(series=perdidas_series),
        energias_publicadas=GraficoSeriesGroup(series=energias_publicadas_series),
        autoconsumo=GraficoSeriesGroup(series=autoconsumo_series),
        energia_generada=GraficoSeriesGroup(series=energia_generada_series),
    )