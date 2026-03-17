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

    row = query.order_by(general_periods.c.anio.desc(), general_periods.c.mes.desc()).first()

    if row is None:
        return None

    return int(row[0]), int(row[1])


def _find_previous_ytd_same_month_last_year(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
    current_anio: int,
    current_mes: int,
) -> tuple[int, int] | None:
    previous_anio = current_anio - 1

    general_exists = (
        _apply_scope_filters(
            db.query(MedidaGeneral.id),
            MedidaGeneral,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=previous_anio,
            mes=current_mes,
        ).first()
        is not None
    )

    ps_exists = (
        _apply_scope_filters(
            db.query(MedidaPS.id),
            MedidaPS,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=previous_anio,
            mes=current_mes,
        ).first()
        is not None
    )

    if not general_exists or not ps_exists:
        return None

    return previous_anio, current_mes


def _sum_dashboard_values(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int | None,
    anio: int,
    mes: int,
    aggregation_mode: str,
) -> tuple[float, float, float]:
    general_query_kwh = db.query(func.sum(MedidaGeneral.energia_neta_facturada_kwh)).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.anio == anio,
    )
    general_query_perdidas = db.query(func.sum(MedidaGeneral.perdidas_e_facturada_kwh)).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.anio == anio,
    )
    ps_query_eur = db.query(func.sum(MedidaPS.importe_total_eur)).filter(
        MedidaPS.tenant_id == tenant_id,
        MedidaPS.anio == anio,
    )

    if empresa_id is not None:
        general_query_kwh = general_query_kwh.filter(MedidaGeneral.empresa_id == empresa_id)
        general_query_perdidas = general_query_perdidas.filter(MedidaGeneral.empresa_id == empresa_id)
        ps_query_eur = ps_query_eur.filter(MedidaPS.empresa_id == empresa_id)

    if aggregation_mode == "ytd":
        general_query_kwh = general_query_kwh.filter(MedidaGeneral.mes <= mes)
        general_query_perdidas = general_query_perdidas.filter(MedidaGeneral.mes <= mes)
        ps_query_eur = ps_query_eur.filter(MedidaPS.mes <= mes)
    else:
        general_query_kwh = general_query_kwh.filter(MedidaGeneral.mes == mes)
        general_query_perdidas = general_query_perdidas.filter(MedidaGeneral.mes == mes)
        ps_query_eur = ps_query_eur.filter(MedidaPS.mes == mes)

    energia_neta_facturada_kwh = cast(float | None, general_query_kwh.scalar())
    perdidas_e_facturada_kwh = cast(float | None, general_query_perdidas.scalar())
    importe_total_eur = cast(float | None, ps_query_eur.scalar())

    return (
        float(energia_neta_facturada_kwh or 0.0),
        float(perdidas_e_facturada_kwh or 0.0),
        float(importe_total_eur or 0.0),
    )


def _absolute_change(current: float, previous: float) -> float:
    return current - previous


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

    energia_neta_facturada_kwh, perdidas_e_facturada_kwh, importe_total_eur = _sum_dashboard_values(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        anio=periodo_anio,
        mes=periodo_mes,
        aggregation_mode=aggregation_mode,
    )

    if aggregation_mode == "ytd":
        previous_period = _find_previous_ytd_same_month_last_year(
            db,
            tenant_id=tenant_id_int,
            empresa_id=empresa_id,
            current_anio=periodo_anio,
            current_mes=periodo_mes,
        )
    else:
        previous_period = _find_previous_common_period(
            db,
            tenant_id=tenant_id_int,
            empresa_id=empresa_id,
            current_anio=periodo_anio,
            current_mes=periodo_mes,
            same_year_only=False,
        )

    energia_variation_kwh_delta: float | None = None
    energia_variation_eur_delta: float | None = None
    perdidas_variation_kwh_delta: float | None = None

    if previous_period is not None:
        previous_anio, previous_mes = previous_period

        (
            previous_energia_kwh,
            previous_perdidas_kwh,
            previous_importe_eur,
        ) = _sum_dashboard_values(
            db,
            tenant_id=tenant_id_int,
            empresa_id=empresa_id,
            anio=previous_anio,
            mes=previous_mes,
            aggregation_mode=aggregation_mode,
        )

        energia_variation_kwh_delta = _absolute_change(
            energia_neta_facturada_kwh,
            previous_energia_kwh,
        )
        energia_variation_eur_delta = _absolute_change(
            importe_total_eur,
            previous_importe_eur,
        )
        perdidas_variation_kwh_delta = _absolute_change(
            perdidas_e_facturada_kwh,
            previous_perdidas_kwh,
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