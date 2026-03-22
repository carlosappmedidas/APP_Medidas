# app/dashboard/routes.py
# pyright: reportMissingImports=false
from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Query, Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.measures.models import MedidaGeneral, MedidaPS
from app.tenants.models import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _apply_scope_filters(
    query: Query[Any],
    model: type[Any],
    *,
    tenant_id: int,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> Query[Any]:
    query = query.filter(model.tenant_id == tenant_id)
    if empresa_id is not None:
        query = query.filter(model.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(model.anio == anio)
    if mes is not None:
        query = query.filter(model.mes == mes)
    return query


def _ensure_empresa_belongs_to_tenant(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
) -> None:
    if empresa_id is None:
        return
    empresa = (
        db.query(Empresa)
        .filter(
            Empresa.id == empresa_id,
            Empresa.tenant_id == tenant_id,
        )
        .first()
    )
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada para este tenant",
        )


def _build_common_periods_subqueries(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None = None,
    anio: int | None = None,
):
    general_periods = (
        _apply_scope_filters(
            db.query(
                MedidaGeneral.anio.label("anio"),
                MedidaGeneral.mes.label("mes"),
            ).distinct(),
            MedidaGeneral,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
        )
        .subquery()
    )
    ps_periods = (
        _apply_scope_filters(
            db.query(
                MedidaPS.anio.label("anio"),
                MedidaPS.mes.label("mes"),
            ).distinct(),
            MedidaPS,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
        )
        .subquery()
    )
    return general_periods, ps_periods


def _resolve_common_period(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
) -> tuple[int, int]:
    if anio is None and mes is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes informar mes sin anio.",
        )
    if anio is not None and mes is not None:
        general_exists = (
            _apply_scope_filters(
                db.query(MedidaGeneral.id),
                MedidaGeneral,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio,
                mes=mes,
            ).first()
            is not None
        )
        ps_exists = (
            _apply_scope_filters(
                db.query(MedidaPS.id),
                MedidaPS,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio,
                mes=mes,
            ).first()
            is not None
        )
        if not general_exists or not ps_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No existe un periodo común entre Medidas General y PS para los filtros indicados.",
            )
        return anio, mes

    general_periods, ps_periods = _build_common_periods_subqueries(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
    )
    row = (
        db.query(general_periods.c.anio, general_periods.c.mes)
        .join(
            ps_periods,
            and_(
                general_periods.c.anio == ps_periods.c.anio,
                general_periods.c.mes == ps_periods.c.mes,
            ),
        )
        .order_by(general_periods.c.anio.desc(), general_periods.c.mes.desc())
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay periodo común entre Medidas General y PS para los filtros indicados.",
        )
    return int(row[0]), int(row[1])


def _find_previous_common_period(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
    current_anio: int,
    current_mes: int,
    same_year_only: bool,
) -> tuple[int, int] | None:
    general_periods, ps_periods = _build_common_periods_subqueries(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=current_anio if same_year_only else None,
    )
    query = db.query(general_periods.c.anio, general_periods.c.mes).join(
        ps_periods,
        and_(
            general_periods.c.anio == ps_periods.c.anio,
            general_periods.c.mes == ps_periods.c.mes,
        ),
    )
    if same_year_only:
        query = query.filter(general_periods.c.mes < current_mes)
    else:
        query = query.filter(
            or_(
                general_periods.c.anio < current_anio,
                and_(
                    general_periods.c.anio == current_anio,
                    general_periods.c.mes < current_mes,
                ),
            )
        )
    row = query.order_by(
        general_periods.c.anio.desc(), general_periods.c.mes.desc()
    ).first()
    if row is None:
        return None
    return int(row[0]), int(row[1])


def _sum_dashboard_values(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
    anio: int,
    mes: int,
    aggregation_mode: str,
) -> tuple[float, float, float]:
    general_query_kwh = db.query(
        func.sum(MedidaGeneral.energia_neta_facturada_kwh)
    ).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.anio == anio,
    )
    general_query_perdidas = db.query(
        func.sum(MedidaGeneral.perdidas_e_facturada_kwh)
    ).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.anio == anio,
    )
    ps_query_eur = db.query(func.sum(MedidaPS.importe_total_eur)).filter(
        MedidaPS.tenant_id == tenant_id,
        MedidaPS.anio == anio,
    )
    if empresa_id is not None:
        general_query_kwh = general_query_kwh.filter(
            MedidaGeneral.empresa_id == empresa_id
        )
        general_query_perdidas = general_query_perdidas.filter(
            MedidaGeneral.empresa_id == empresa_id
        )
        ps_query_eur = ps_query_eur.filter(MedidaPS.empresa_id == empresa_id)
    if aggregation_mode == "ytd":
        general_query_kwh = general_query_kwh.filter(MedidaGeneral.mes <= mes)
        general_query_perdidas = general_query_perdidas.filter(
            MedidaGeneral.mes <= mes
        )
        ps_query_eur = ps_query_eur.filter(MedidaPS.mes <= mes)
    else:
        general_query_kwh = general_query_kwh.filter(MedidaGeneral.mes == mes)
        general_query_perdidas = general_query_perdidas.filter(
            MedidaGeneral.mes == mes
        )
        ps_query_eur = ps_query_eur.filter(MedidaPS.mes == mes)

    energia_neta_facturada_kwh = cast(
        float | None, general_query_kwh.scalar()
    )
    perdidas_e_facturada_kwh = cast(
        float | None, general_query_perdidas.scalar()
    )
    importe_total_eur = cast(float | None, ps_query_eur.scalar())
    return (
        float(energia_neta_facturada_kwh or 0.0),
        float(perdidas_e_facturada_kwh or 0.0),
        float(importe_total_eur or 0.0),
    )


def _absolute_change(current: float, previous: float) -> float:
    return current - previous


def _resolve_pf_kwh(row: Any) -> tuple[float, str, str]:
    """Devuelve el valor PF más reciente disponible siguiendo la jerarquía:
    art15 → m11 → m7 → m2 → pf_final (ACUM).
    Usa el primero que sea distinto de cero y devuelve también su origen.
    """
    hierarchy = (
        ("energia_pf_art15_kwh", "art15", "PF ART15"),
        ("energia_pf_m11_kwh", "m11", "PF M11"),
        ("energia_pf_m7_kwh", "m7", "PF M7"),
        ("energia_pf_m2_kwh", "m2", "PF M2"),
        ("energia_pf_final_kwh", "final", "PF FINAL"),
    )
    for field, source, label in hierarchy:
        val = float(cast(float | None, getattr(row, field, None)) or 0.0)
        if val != 0.0:
            return val, source, label
    return 0.0, "final", "PF FINAL"


def _build_energy_comparison_chart_series(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
    anio: int,
    max_mes: int,
) -> list[dict[str, float | int | str]]:
    rows_query = db.query(
        MedidaGeneral.mes.label("mes"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_bruta_facturada), 0.0
        ).label("energia_bruta_facturada"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_publicada_m2_kwh), 0.0
        ).label("energia_publicada_m2_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_publicada_m7_kwh), 0.0
        ).label("energia_publicada_m7_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_publicada_m11_kwh), 0.0
        ).label("energia_publicada_m11_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_publicada_art15_kwh), 0.0
        ).label("energia_publicada_art15_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_pf_final_kwh), 0.0
        ).label("energia_pf_final_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_pf_m2_kwh), 0.0
        ).label("energia_pf_m2_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_pf_m7_kwh), 0.0
        ).label("energia_pf_m7_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_pf_m11_kwh), 0.0
        ).label("energia_pf_m11_kwh"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_pf_art15_kwh), 0.0
        ).label("energia_pf_art15_kwh"),
    ).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.anio == anio,
        MedidaGeneral.mes <= max_mes,
    )
    if empresa_id is not None:
        rows_query = rows_query.filter(
            MedidaGeneral.empresa_id == empresa_id
        )
    rows = (
        rows_query.group_by(MedidaGeneral.mes)
        .order_by(MedidaGeneral.mes.asc())
        .all()
    )
    rows_by_mes: dict[int, Any] = {
        int(cast(int, row.mes)): row for row in rows
    }
    series: list[dict[str, float | int | str]] = []
    for month_number in range(1, max_mes + 1):
        row = rows_by_mes.get(month_number)
        pf_value, pf_source, pf_label = (
            _resolve_pf_kwh(row)
            if row is not None
            else (0.0, "final", "PF FINAL")
        )
        series.append(
            {
                "mes": month_number,
                "mes_label": str(month_number),
                "energia_bruta_facturada": float(
                    cast(
                        float | None,
                        getattr(row, "energia_bruta_facturada", 0.0),
                    )
                    or 0.0
                ),
                "energia_publicada_m2_kwh": float(
                    cast(
                        float | None,
                        getattr(row, "energia_publicada_m2_kwh", 0.0),
                    )
                    or 0.0
                ),
                "energia_publicada_m7_kwh": float(
                    cast(
                        float | None,
                        getattr(row, "energia_publicada_m7_kwh", 0.0),
                    )
                    or 0.0
                ),
                "energia_publicada_m11_kwh": float(
                    cast(
                        float | None,
                        getattr(row, "energia_publicada_m11_kwh", 0.0),
                    )
                    or 0.0
                ),
                "energia_publicada_art15_kwh": float(
                    cast(
                        float | None,
                        getattr(row, "energia_publicada_art15_kwh", 0.0),
                    )
                    or 0.0
                ),
                "energia_pf_final_kwh": pf_value,
                "pf_source": pf_source,
                "pf_label": pf_label,
            }
        )
    return series


def _build_energy_trend_chart_series(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
    anio: int,
    max_mes: int,
) -> list[dict[str, float | int | str]]:
    rows_query = db.query(
        MedidaGeneral.mes.label("mes"),
        func.coalesce(
            func.sum(MedidaGeneral.energia_neta_facturada_kwh), 0.0
        ).label("energia_neta_facturada_kwh"),
    ).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.anio == anio,
        MedidaGeneral.mes <= max_mes,
    )
    if empresa_id is not None:
        rows_query = rows_query.filter(
            MedidaGeneral.empresa_id == empresa_id
        )
    rows = (
        rows_query.group_by(MedidaGeneral.mes)
        .order_by(MedidaGeneral.mes.asc())
        .all()
    )
    rows_by_mes: dict[int, Any] = {
        int(cast(int, row.mes)): row for row in rows
    }
    series: list[dict[str, float | int | str]] = []
    for month_number in range(1, max_mes + 1):
        row = rows_by_mes.get(month_number)
        series.append(
            {
                "mes": month_number,
                "mes_label": str(month_number),
                "energia_neta_facturada_kwh": float(
                    cast(
                        float | None,
                        getattr(row, "energia_neta_facturada_kwh", 0.0),
                    )
                    or 0.0
                ),
            }
        )
    return series


def _build_losses_trend_chart_series(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
    anio: int,
    max_mes: int,
) -> list[dict[str, float | int | str]]:
    rows_query = db.query(
        MedidaGeneral.mes.label("mes"),
        func.avg(MedidaGeneral.perdidas_e_facturada_pct).label(
            "perdidas_e_facturada_pct"
        ),
    ).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.anio == anio,
        MedidaGeneral.mes <= max_mes,
    )
    if empresa_id is not None:
        rows_query = rows_query.filter(
            MedidaGeneral.empresa_id == empresa_id
        )
    rows = (
        rows_query.group_by(MedidaGeneral.mes)
        .order_by(MedidaGeneral.mes.asc())
        .all()
    )
    rows_by_mes: dict[int, Any] = {
        int(cast(int, row.mes)): row for row in rows
    }
    series: list[dict[str, float | int | str]] = []
    for month_number in range(1, max_mes + 1):
        row = rows_by_mes.get(month_number)
        value = cast(
            float | None,
            getattr(row, "perdidas_e_facturada_pct", None),
        )
        series.append(
            {
                "mes": month_number,
                "mes_label": str(month_number),
                "perdidas_e_facturada_pct": (
                    float(value) if value is not None else 0.0
                ),
            }
        )
    return series


@router.get("/filters")
def get_dashboard_filters(
    empresa_id: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)
    _ensure_empresa_belongs_to_tenant(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
    )
    empresas = (
        db.query(Empresa)
        .filter(Empresa.tenant_id == tenant_id_int)
        .order_by(Empresa.nombre.asc(), Empresa.codigo_ree.asc(), Empresa.id.asc())
        .all()
    )
    general_periods, ps_periods = _build_common_periods_subqueries(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=anio,
    )
    common_period_rows = (
        db.query(general_periods.c.anio, general_periods.c.mes)
        .join(
            ps_periods,
            and_(
                general_periods.c.anio == ps_periods.c.anio,
                general_periods.c.mes == ps_periods.c.mes,
            ),
        )
        .distinct()
        .all()
    )
    anios = sorted({int(row[0]) for row in common_period_rows}, reverse=True)
    meses = sorted({int(row[1]) for row in common_period_rows})
    return {
        "empresas": [
            {
                "id": cast(int, empresa.id),
                "nombre": cast(str | None, empresa.nombre),
                "codigo": cast(str | None, empresa.codigo_ree or empresa.codigo_cnmc),
            }
            for empresa in empresas
        ],
        "anios": anios,
        "meses": meses,
    }


@router.get("/summary")
def get_dashboard_summary(
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)
    _ensure_empresa_belongs_to_tenant(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
    )
    periodo_anio, periodo_mes = _resolve_common_period(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    aggregation_mode = "ytd" if anio is not None and mes is None else "month"
    energia_neta_facturada_kwh, perdidas_e_facturada_kwh, importe_total_eur = (
        _sum_dashboard_values(
            db,
            tenant_id=tenant_id_int,
            empresa_id=empresa_id,
            anio=periodo_anio,
            mes=periodo_mes,
            aggregation_mode=aggregation_mode,
        )
    )
    previous_period = _find_previous_common_period(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        current_anio=periodo_anio,
        current_mes=periodo_mes,
        same_year_only=aggregation_mode == "ytd",
    )
    energia_variation_kwh_delta: float | None = None
    energia_variation_eur_delta: float | None = None
    perdidas_variation_kwh_delta: float | None = None
    if previous_period is not None:
        previous_anio, previous_mes = previous_period
        previous_energia_kwh, previous_perdidas_kwh, previous_importe_eur = (
            _sum_dashboard_values(
                db,
                tenant_id=tenant_id_int,
                empresa_id=empresa_id,
                anio=previous_anio,
                mes=previous_mes,
                aggregation_mode=aggregation_mode,
            )
        )
        energia_variation_kwh_delta = _absolute_change(
            energia_neta_facturada_kwh, previous_energia_kwh
        )
        energia_variation_eur_delta = _absolute_change(
            importe_total_eur, previous_importe_eur
        )
        perdidas_variation_kwh_delta = _absolute_change(
            perdidas_e_facturada_kwh, previous_perdidas_kwh
        )
    return {
        "filters": {
            "tenant_id": tenant_id_int,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
        "common_period": {
            "anio": periodo_anio,
            "mes": periodo_mes,
        },
        "previous_common_period": (
            {
                "anio": previous_period[0],
                "mes": previous_period[1],
            }
            if previous_period is not None
            else None
        ),
        "aggregation_mode": aggregation_mode,
        "energia_facturada": {
            "energia_neta_facturada_kwh_total": energia_neta_facturada_kwh,
            "importe_total_eur_total": importe_total_eur,
            "variation_vs_previous": {
                "energia_neta_facturada_kwh_delta": energia_variation_kwh_delta,
                "importe_total_eur_delta": energia_variation_eur_delta,
            },
        },
        "perdidas": {
            "perdidas_e_facturada_kwh_total": perdidas_e_facturada_kwh,
            "perdidas_e_facturada_eur_total": None,
            "variation_vs_previous": {
                "perdidas_e_facturada_kwh_delta": perdidas_variation_kwh_delta,
            },
        },
    }


@router.get("/energy-comparison-chart")
def get_dashboard_energy_comparison_chart(
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)
    _ensure_empresa_belongs_to_tenant(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
    )
    periodo_anio, periodo_mes = _resolve_common_period(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    chart_anio = periodo_anio
    chart_max_mes = int(mes) if mes is not None else periodo_mes
    if chart_max_mes < 1 or chart_max_mes > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mes no válido para construir la gráfica.",
        )
    series = _build_energy_comparison_chart_series(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=chart_anio,
        max_mes=chart_max_mes,
    )
    return {
        "filters": {
            "tenant_id": tenant_id_int,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
        "resolved_period": {
            "anio": periodo_anio,
            "mes": periodo_mes,
        },
        "chart_scope": {
            "anio": chart_anio,
            "from_mes": 1,
            "to_mes": chart_max_mes,
        },
        "series": series,
    }


@router.get("/energy-trend-chart")
def get_dashboard_energy_trend_chart(
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)
    _ensure_empresa_belongs_to_tenant(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
    )
    periodo_anio, periodo_mes = _resolve_common_period(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    chart_anio = periodo_anio
    chart_max_mes = int(mes) if mes is not None else periodo_mes
    if chart_max_mes < 1 or chart_max_mes > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mes no válido para construir la gráfica.",
        )
    series = _build_energy_trend_chart_series(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=chart_anio,
        max_mes=chart_max_mes,
    )
    return {
        "filters": {
            "tenant_id": tenant_id_int,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
        "resolved_period": {
            "anio": periodo_anio,
            "mes": periodo_mes,
        },
        "chart_scope": {
            "anio": chart_anio,
            "from_mes": 1,
            "to_mes": chart_max_mes,
        },
        "series": series,
    }


@router.get("/losses-trend-chart")
def get_dashboard_losses_trend_chart(
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)
    _ensure_empresa_belongs_to_tenant(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
    )
    periodo_anio, periodo_mes = _resolve_common_period(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    chart_anio = periodo_anio
    chart_max_mes = int(mes) if mes is not None else periodo_mes
    if chart_max_mes < 1 or chart_max_mes > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mes no válido para construir la gráfica.",
        )
    series = _build_losses_trend_chart_series(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=chart_anio,
        max_mes=chart_max_mes,
    )
    return {
        "filters": {
            "tenant_id": tenant_id_int,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
        "resolved_period": {
            "anio": periodo_anio,
            "mes": periodo_mes,
        },
        "chart_scope": {
            "anio": chart_anio,
            "from_mes": 1,
            "to_mes": chart_max_mes,
        },
        "series": series,
    }


@router.get("/losses-consistency")
def get_dashboard_losses_consistency(
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve kWh, % pérdidas y kWh PF por ventana de publicación.
    Usado en la tarjeta de consistencia de pérdidas del dashboard.
    """
    tenant_id_int = cast(int, current_user.tenant_id)
    _ensure_empresa_belongs_to_tenant(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
    )
    periodo_anio, periodo_mes = _resolve_common_period(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    aggregation_mode = "ytd" if anio is not None and mes is None else "month"

    q = db.query(
        func.sum(MedidaGeneral.energia_neta_facturada_kwh).label("m1_kwh"),
        func.sum(MedidaGeneral.energia_neta_facturada_m2_kwh).label("m2_kwh"),
        func.sum(MedidaGeneral.energia_neta_facturada_m7_kwh).label("m7_kwh"),
        func.sum(MedidaGeneral.energia_neta_facturada_m11_kwh).label("m11_kwh"),
        func.sum(MedidaGeneral.energia_neta_facturada_art15_kwh).label("art15_kwh"),
        func.sum(MedidaGeneral.perdidas_e_facturada_kwh).label("perdidas_m1_kwh"),
        func.sum(MedidaGeneral.perdidas_e_facturada_m2_kwh).label("perdidas_m2_kwh"),
        func.sum(MedidaGeneral.perdidas_e_facturada_m7_kwh).label("perdidas_m7_kwh"),
        func.sum(MedidaGeneral.perdidas_e_facturada_m11_kwh).label("perdidas_m11_kwh"),
        func.sum(MedidaGeneral.perdidas_e_facturada_art15_kwh).label(
            "perdidas_art15_kwh"
        ),
        func.sum(MedidaGeneral.energia_pf_final_kwh).label("pf_final_kwh"),
        func.sum(MedidaGeneral.energia_pf_m2_kwh).label("pf_m2_kwh"),
        func.sum(MedidaGeneral.energia_pf_m7_kwh).label("pf_m7_kwh"),
        func.sum(MedidaGeneral.energia_pf_m11_kwh).label("pf_m11_kwh"),
        func.sum(MedidaGeneral.energia_pf_art15_kwh).label("pf_art15_kwh"),
        func.avg(MedidaGeneral.perdidas_e_facturada_pct).label("perdidas_m1_pct"),
        func.avg(MedidaGeneral.perdidas_e_facturada_m2_pct).label("perdidas_m2_pct"),
        func.avg(MedidaGeneral.perdidas_e_facturada_m7_pct).label("perdidas_m7_pct"),
        func.avg(MedidaGeneral.perdidas_e_facturada_m11_pct).label("perdidas_m11_pct"),
        func.avg(MedidaGeneral.perdidas_e_facturada_art15_pct).label(
            "perdidas_art15_pct"
        ),
    ).filter(
        MedidaGeneral.tenant_id == tenant_id_int,
        MedidaGeneral.anio == periodo_anio,
    )
    if empresa_id is not None:
        q = q.filter(MedidaGeneral.empresa_id == empresa_id)
    if aggregation_mode == "ytd":
        q = q.filter(MedidaGeneral.mes <= periodo_mes)
    else:
        q = q.filter(MedidaGeneral.mes == periodo_mes)

    row = q.first()

    def _f(v: Any) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    m1_kwh = _f(getattr(row, "m1_kwh", None))
    m2_kwh = _f(getattr(row, "m2_kwh", None))
    m7_kwh = _f(getattr(row, "m7_kwh", None))
    m11_kwh = _f(getattr(row, "m11_kwh", None))
    art15_kwh = _f(getattr(row, "art15_kwh", None))

    perdidas_m1_kwh = _f(getattr(row, "perdidas_m1_kwh", None))
    perdidas_m2_kwh = _f(getattr(row, "perdidas_m2_kwh", None))
    perdidas_m7_kwh = _f(getattr(row, "perdidas_m7_kwh", None))
    perdidas_m11_kwh = _f(getattr(row, "perdidas_m11_kwh", None))
    perdidas_art15_kwh = _f(getattr(row, "perdidas_art15_kwh", None))

    pf_final_kwh = _f(getattr(row, "pf_final_kwh", None))
    pf_m2_kwh = _f(getattr(row, "pf_m2_kwh", None))
    pf_m7_kwh = _f(getattr(row, "pf_m7_kwh", None))
    pf_m11_kwh = _f(getattr(row, "pf_m11_kwh", None))
    pf_art15_kwh = _f(getattr(row, "pf_art15_kwh", None))

    perdidas_m1_pct = _f(getattr(row, "perdidas_m1_pct", None))
    perdidas_m2_pct = _f(getattr(row, "perdidas_m2_pct", None))
    perdidas_m7_pct = _f(getattr(row, "perdidas_m7_pct", None))
    perdidas_m11_pct = _f(getattr(row, "perdidas_m11_pct", None))
    perdidas_art15_pct = _f(getattr(row, "perdidas_art15_pct", None))

    def _diff(a: float | None, b: float | None) -> float | None:
        if a is None or b is None:
            return None
        return round(b - a, 4)

    return {
        "filters": {
            "tenant_id": tenant_id_int,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
        "common_period": {
            "anio": periodo_anio,
            "mes": periodo_mes,
        },
        "aggregation_mode": aggregation_mode,
        "ventanas": {
            "m1": {
                "kwh": m1_kwh,
                "perdidas_kwh": perdidas_m1_kwh,
                "perdidas_pct": perdidas_m1_pct,
                "pf_kwh": pf_final_kwh,
            },
            "m2": {
                "kwh": m2_kwh,
                "perdidas_kwh": perdidas_m2_kwh,
                "perdidas_pct": perdidas_m2_pct,
                "pf_kwh": pf_m2_kwh,
            },
            "m7": {
                "kwh": m7_kwh,
                "perdidas_kwh": perdidas_m7_kwh,
                "perdidas_pct": perdidas_m7_pct,
                "pf_kwh": pf_m7_kwh,
            },
            "m11": {
                "kwh": m11_kwh,
                "perdidas_kwh": perdidas_m11_kwh,
                "perdidas_pct": perdidas_m11_pct,
                "pf_kwh": pf_m11_kwh,
            },
            "art15": {
                "kwh": art15_kwh,
                "perdidas_kwh": perdidas_art15_kwh,
                "perdidas_pct": perdidas_art15_pct,
                "pf_kwh": pf_art15_kwh,
            },
        },
        "comparaciones": {
            "m1_vs_m2": _diff(perdidas_m1_pct, perdidas_m2_pct),
            "m2_vs_m7": _diff(perdidas_m2_pct, perdidas_m7_pct),
            "m7_vs_m11": _diff(perdidas_m7_pct, perdidas_m11_pct),
            "m11_vs_art15": _diff(perdidas_m11_pct, perdidas_art15_pct),
        },
    }