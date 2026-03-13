from __future__ import annotations

from decimal import Decimal
import math
import re
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, Query, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from app.core.db import get_db
from app.core.auth import get_current_user, get_current_active_superuser
from app.measures.models import MedidaPS, MedidaGeneral
from app.measures.m1_models import M1PeriodContribution
from app.measures.ps_models import PSPeriodContribution
from app.measures.ps_detail_models import PSPeriodDetail
from app.ingestion.models import IngestionFile
from app.empresas.models import Empresa
from app.tenants.models import User

router = APIRouter(prefix="/ps", tags=["medidas_ps"])


class DeleteIdsPayload(BaseModel):
    ids: list[int]


def _parse_int_list_param(value: str | None) -> list[int]:
    if not value:
        return []

    result: list[int] = []
    for part in value.split(","):
        s = part.strip()
        if not s:
            continue
        try:
            n = int(s)
        except ValueError:
            continue
        result.append(n)

    return list(dict.fromkeys(result))


def _merge_single_and_multi(
    *,
    single_value: int | None,
    multi_value: str | None,
) -> list[int]:
    values = _parse_int_list_param(multi_value)
    if single_value is not None and single_value not in values:
        values.append(single_value)
    return values


def _sanitize_value(value: Any):
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return 0.0
        return value

    if isinstance(value, Decimal):
        if value.is_nan() or value in (Decimal("Infinity"), Decimal("-Infinity")):
            return Decimal("0")
        return value

    return value


def _sanitize_medida(medida_obj: Any) -> dict:
    data = {k: v for k, v in medida_obj.__dict__.items() if not k.startswith("_")}

    for k, v in list(data.items()):
        data[k] = _sanitize_value(v)

    return data


def _build_empresa_codigo(empresa: Empresa) -> str | None:
    codigo_cnmc = cast(Optional[str], getattr(empresa, "codigo_cnmc", None))
    codigo_ree = cast(Optional[str], getattr(empresa, "codigo_ree", None))

    raw: str = codigo_cnmc or codigo_ree or str(getattr(empresa, "id"))

    m = re.search(r"(\d{3,4})", raw)
    if m:
        codigo_corto = m.group(1)
        if len(codigo_corto) == 3:
            codigo_corto = f"0{codigo_corto}"
        return codigo_corto

    return raw


def _paginate(total: int, page: int, page_size: int) -> dict:
    page_size_safe = max(1, min(int(page_size), 500))
    page_safe = max(0, int(page))

    total_pages = max(1, math.ceil(total / page_size_safe)) if total > 0 else 1
    if page_safe > total_pages - 1:
        page_safe = total_pages - 1

    return {
        "page": page_safe,
        "page_size": page_size_safe,
        "total": int(total),
        "total_pages": int(total_pages),
        "offset": int(page_safe * page_size_safe),
        "limit": int(page_size_safe),
    }


def _ps_tarifa_filter(query, tarifa: str):
    t = (tarifa or "").lower().strip()
    if not t:
        return query

    if t == "20td":
        return query.filter(
            (MedidaPS.energia_tarifa_20td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_20td.isnot(None))
            | (MedidaPS.importe_tarifa_20td_eur.isnot(None))
        )
    if t == "30td":
        return query.filter(
            (MedidaPS.energia_tarifa_30td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_30td.isnot(None))
            | (MedidaPS.importe_tarifa_30td_eur.isnot(None))
        )
    if t == "30tdve":
        return query.filter(
            (MedidaPS.energia_tarifa_30tdve_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_30tdve.isnot(None))
            | (MedidaPS.importe_tarifa_30tdve_eur.isnot(None))
        )
    if t == "61td":
        return query.filter(
            (MedidaPS.energia_tarifa_61td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_61td.isnot(None))
            | (MedidaPS.importe_tarifa_61td_eur.isnot(None))
        )
    if t == "62td":
        return query.filter(
            (MedidaPS.energia_tarifa_62td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_62td.isnot(None))
            | (MedidaPS.importe_tarifa_62td_eur.isnot(None))
        )
    if t == "63td":
        return query.filter(
            (MedidaPS.energia_tarifa_63td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_63td.isnot(None))
            | (MedidaPS.importe_tarifa_63td_eur.isnot(None))
        )
    if t == "64td":
        return query.filter(
            (MedidaPS.energia_tarifa_64td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_64td.isnot(None))
            | (MedidaPS.importe_tarifa_64td_eur.isnot(None))
        )

    return query


def _deep_delete_by_file_ids(
    db: Session,
    *,
    tenant_id: int | None,
    file_ids_select: Any,
) -> dict[str, int]:
    m1_q = db.query(M1PeriodContribution).filter(
        M1PeriodContribution.ingestion_file_id.in_(file_ids_select)
    )
    ps_detail_q = db.query(PSPeriodDetail).filter(
        PSPeriodDetail.ingestion_file_id.in_(file_ids_select)
    )
    ps_contrib_q = db.query(PSPeriodContribution).filter(
        PSPeriodContribution.ingestion_file_id.in_(file_ids_select)
    )
    mg_q = db.query(MedidaGeneral).filter(
        MedidaGeneral.file_id.in_(file_ids_select)
    )
    mp_q = db.query(MedidaPS).filter(
        MedidaPS.file_id.in_(file_ids_select)
    )
    ingestion_q = db.query(IngestionFile).filter(
        IngestionFile.id.in_(file_ids_select)
    )

    if tenant_id is not None:
        m1_q = m1_q.filter(M1PeriodContribution.tenant_id == tenant_id)
        ps_detail_q = ps_detail_q.filter(PSPeriodDetail.tenant_id == tenant_id)
        ps_contrib_q = ps_contrib_q.filter(PSPeriodContribution.tenant_id == tenant_id)
        mg_q = mg_q.filter(MedidaGeneral.tenant_id == tenant_id)
        mp_q = mp_q.filter(MedidaPS.tenant_id == tenant_id)
        ingestion_q = ingestion_q.filter(IngestionFile.tenant_id == tenant_id)

    deleted_m1 = m1_q.delete(synchronize_session=False)
    deleted_ps_detail = ps_detail_q.delete(synchronize_session=False)
    deleted_ps_contrib = ps_contrib_q.delete(synchronize_session=False)
    deleted_mg = mg_q.delete(synchronize_session=False)
    deleted_mp = mp_q.delete(synchronize_session=False)
    deleted_ingestion = ingestion_q.delete(synchronize_session=False)

    return {
        "deleted_m1_period_contributions": int(deleted_m1 or 0),
        "deleted_ps_period_detail": int(deleted_ps_detail or 0),
        "deleted_ps_period_contributions": int(deleted_ps_contrib or 0),
        "deleted_medidas_general": int(deleted_mg or 0),
        "deleted_medidas_ps": int(deleted_mp or 0),
        "deleted_ingestion_files": int(deleted_ingestion or 0),
    }


@router.get("/")
def listar_medidas_ps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(MedidaPS, Empresa)
        .join(Empresa, MedidaPS.empresa_id == Empresa.id)
        .filter(
            MedidaPS.tenant_id == current_user.tenant_id,
            Empresa.tenant_id == current_user.tenant_id,
        )
        .order_by(MedidaPS.anio.desc(), MedidaPS.mes.desc())
    )

    filas = query.all()

    resultado: list[dict] = []
    for mp, empresa in filas:
        item = _sanitize_medida(mp)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.get("/all")
def listar_medidas_ps_todos_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    query = (
        db.query(MedidaPS, Empresa)
        .join(Empresa, MedidaPS.empresa_id == Empresa.id)
        .order_by(
            MedidaPS.tenant_id.asc(),
            MedidaPS.anio.desc(),
            MedidaPS.mes.desc(),
        )
    )

    filas = query.all()

    resultado: list[dict] = []
    for mp, empresa in filas:
        item = _sanitize_medida(mp)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.delete("/all")
def borrar_medidas_ps_todos_tenants(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
    payload: DeleteIdsPayload | None = Body(default=None),
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
    tarifa: str | None = None,
):
    query = db.query(MedidaPS)

    if payload is not None and isinstance(payload.ids, list) and len(payload.ids) > 0:
        file_ids_subq = (
            db.query(MedidaPS.file_id)
            .filter(
                MedidaPS.id.in_(payload.ids),
                MedidaPS.file_id.isnot(None),
            )
            .distinct()
            .subquery()
        )
        file_ids_select = select(file_ids_subq.c.file_id)

        result = _deep_delete_by_file_ids(
            db,
            tenant_id=None,
            file_ids_select=cast(Any, file_ids_select),
        )
        db.commit()

        return {
            "mode": "deep_ids",
            "ids": payload.ids,
            **result,
        }

    if tenant_id is not None:
        query = query.filter(MedidaPS.tenant_id == tenant_id)
    if empresa_id is not None:
        query = query.filter(MedidaPS.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(MedidaPS.anio == anio)
    if mes is not None:
        query = query.filter(MedidaPS.mes == mes)
    if tarifa:
        query = _ps_tarifa_filter(query, tarifa)

    file_ids_subq = (
        query.filter(MedidaPS.file_id.isnot(None))
        .with_entities(MedidaPS.file_id)
        .distinct()
        .subquery()
    )
    file_ids_select = select(file_ids_subq.c.file_id)

    result = _deep_delete_by_file_ids(
        db,
        tenant_id=tenant_id,
        file_ids_select=cast(Any, file_ids_select),
    )
    db.commit()

    return {
        "mode": "deep_filters",
        "filters": {
            "tenant_id": tenant_id,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
            "tarifa": tarifa,
        },
        **result,
    }


@router.get("/filters")
def medidas_ps_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = current_user.tenant_id

    empresas_rows = (
        db.query(Empresa)
        .join(MedidaPS, MedidaPS.empresa_id == Empresa.id)
        .filter(
            Empresa.tenant_id == tenant_id,
            MedidaPS.tenant_id == tenant_id,
        )
        .distinct()
        .order_by(Empresa.nombre.asc(), Empresa.id.asc())
        .all()
    )

    empresas = [
        {
            "id": cast(int, getattr(e, "id")),
            "codigo": _build_empresa_codigo(e),
            "nombre": cast(Optional[str], getattr(e, "nombre", None)),
        }
        for e in empresas_rows
    ]

    anios = [
        int(r[0])
        for r in (
            db.query(MedidaPS.anio)
            .filter(MedidaPS.tenant_id == tenant_id)
            .distinct()
            .order_by(MedidaPS.anio.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    meses = [
        int(r[0])
        for r in (
            db.query(MedidaPS.mes)
            .filter(MedidaPS.tenant_id == tenant_id)
            .distinct()
            .order_by(MedidaPS.mes.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    tarifas: list[str] = []

    def _has_any(col1, col2, col3) -> bool:
        q = (
            db.query(func.count(MedidaPS.id))
            .filter(MedidaPS.tenant_id == tenant_id)
            .filter((col1.isnot(None)) | (col2.isnot(None)) | (col3.isnot(None)))
        )
        return (q.scalar() or 0) > 0

    if _has_any(MedidaPS.energia_tarifa_20td_kwh, MedidaPS.cups_tarifa_20td, MedidaPS.importe_tarifa_20td_eur):
        tarifas.append("20td")
    if _has_any(MedidaPS.energia_tarifa_30td_kwh, MedidaPS.cups_tarifa_30td, MedidaPS.importe_tarifa_30td_eur):
        tarifas.append("30td")
    if _has_any(MedidaPS.energia_tarifa_30tdve_kwh, MedidaPS.cups_tarifa_30tdve, MedidaPS.importe_tarifa_30tdve_eur):
        tarifas.append("30tdve")
    if _has_any(MedidaPS.energia_tarifa_61td_kwh, MedidaPS.cups_tarifa_61td, MedidaPS.importe_tarifa_61td_eur):
        tarifas.append("61td")
    if _has_any(MedidaPS.energia_tarifa_62td_kwh, MedidaPS.cups_tarifa_62td, MedidaPS.importe_tarifa_62td_eur):
        tarifas.append("62td")
    if _has_any(MedidaPS.energia_tarifa_63td_kwh, MedidaPS.cups_tarifa_63td, MedidaPS.importe_tarifa_63td_eur):
        tarifas.append("63td")
    if _has_any(MedidaPS.energia_tarifa_64td_kwh, MedidaPS.cups_tarifa_64td, MedidaPS.importe_tarifa_64td_eur):
        tarifas.append("64td")

    return {"empresas": empresas, "anios": anios, "meses": meses, "tarifas": tarifas}


@router.get("/all/filters")
def medidas_ps_filters_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    empresas_rows = (
        db.query(Empresa)
        .join(MedidaPS, MedidaPS.empresa_id == Empresa.id)
        .distinct()
        .order_by(Empresa.tenant_id.asc(), Empresa.nombre.asc(), Empresa.id.asc())
        .all()
    )

    empresas = [
        {
            "id": cast(int, getattr(e, "id")),
            "codigo": _build_empresa_codigo(e),
            "nombre": cast(Optional[str], getattr(e, "nombre", None)),
            "tenant_id": cast(int, getattr(e, "tenant_id")),
        }
        for e in empresas_rows
    ]

    anios = [
        int(r[0])
        for r in (
            db.query(MedidaPS.anio)
            .distinct()
            .order_by(MedidaPS.anio.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    meses = [
        int(r[0])
        for r in (
            db.query(MedidaPS.mes)
            .distinct()
            .order_by(MedidaPS.mes.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    tarifas: list[str] = []

    def _has_any_global(col1, col2, col3) -> bool:
        q = db.query(func.count(MedidaPS.id)).filter(
            (col1.isnot(None)) | (col2.isnot(None)) | (col3.isnot(None))
        )
        return (q.scalar() or 0) > 0

    if _has_any_global(MedidaPS.energia_tarifa_20td_kwh, MedidaPS.cups_tarifa_20td, MedidaPS.importe_tarifa_20td_eur):
        tarifas.append("20td")
    if _has_any_global(MedidaPS.energia_tarifa_30td_kwh, MedidaPS.cups_tarifa_30td, MedidaPS.importe_tarifa_30td_eur):
        tarifas.append("30td")
    if _has_any_global(MedidaPS.energia_tarifa_30tdve_kwh, MedidaPS.cups_tarifa_30tdve, MedidaPS.importe_tarifa_30tdve_eur):
        tarifas.append("30tdve")
    if _has_any_global(MedidaPS.energia_tarifa_61td_kwh, MedidaPS.cups_tarifa_61td, MedidaPS.importe_tarifa_61td_eur):
        tarifas.append("61td")
    if _has_any_global(MedidaPS.energia_tarifa_62td_kwh, MedidaPS.cups_tarifa_62td, MedidaPS.importe_tarifa_62td_eur):
        tarifas.append("62td")
    if _has_any_global(MedidaPS.energia_tarifa_63td_kwh, MedidaPS.cups_tarifa_63td, MedidaPS.importe_tarifa_63td_eur):
        tarifas.append("63td")
    if _has_any_global(MedidaPS.energia_tarifa_64td_kwh, MedidaPS.cups_tarifa_64td, MedidaPS.importe_tarifa_64td_eur):
        tarifas.append("64td")

    return {"empresas": empresas, "anios": anios, "meses": meses, "tarifas": tarifas}


@router.get("/page")
def listar_medidas_ps_page(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    empresa_id: int | None = Query(default=None),
    anio: int | None = Query(default=None),
    mes: int | None = Query(default=None),
    tarifa: str | None = Query(default=None),
    empresa_ids: str | None = Query(default=None),
    anios: str | None = Query(default=None),
    meses: str | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
):
    tenant_id = current_user.tenant_id

    empresa_ids_list = _merge_single_and_multi(single_value=empresa_id, multi_value=empresa_ids)
    anios_list = _merge_single_and_multi(single_value=anio, multi_value=anios)
    meses_list = _merge_single_and_multi(single_value=mes, multi_value=meses)

    base = (
        db.query(MedidaPS, Empresa)
        .join(Empresa, MedidaPS.empresa_id == Empresa.id)
        .filter(
            MedidaPS.tenant_id == tenant_id,
            Empresa.tenant_id == tenant_id,
        )
    )

    if empresa_ids_list:
        base = base.filter(MedidaPS.empresa_id.in_(empresa_ids_list))
    if anios_list:
        base = base.filter(MedidaPS.anio.in_(anios_list))
    if meses_list:
        base = base.filter(MedidaPS.mes.in_(meses_list))
    if tarifa:
        base = _ps_tarifa_filter(base, tarifa)

    total_q = db.query(func.count(MedidaPS.id)).filter(MedidaPS.tenant_id == tenant_id)
    if empresa_ids_list:
        total_q = total_q.filter(MedidaPS.empresa_id.in_(empresa_ids_list))
    if anios_list:
        total_q = total_q.filter(MedidaPS.anio.in_(anios_list))
    if meses_list:
        total_q = total_q.filter(MedidaPS.mes.in_(meses_list))
    if tarifa:
        total_q = _ps_tarifa_filter(total_q, tarifa)

    total_int = int(total_q.scalar() or 0)
    pg = _paginate(total_int, page, page_size)

    filas = (
        base.order_by(
            MedidaPS.anio.desc(),
            MedidaPS.mes.desc(),
            MedidaPS.empresa_id.asc(),
        )
        .offset(pg["offset"])
        .limit(pg["limit"])
        .all()
    )

    items: list[dict] = []
    for mp, empresa in filas:
        item = _sanitize_medida(mp)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        items.append(item)

    return {
        "items": items,
        "page": pg["page"],
        "page_size": pg["page_size"],
        "total": pg["total"],
        "total_pages": pg["total_pages"],
    }


@router.get("/all/page")
def listar_medidas_ps_all_page(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
    tenant_id: int | None = Query(default=None),
    empresa_id: int | None = Query(default=None),
    anio: int | None = Query(default=None),
    mes: int | None = Query(default=None),
    tarifa: str | None = Query(default=None),
    tenant_ids: str | None = Query(default=None),
    empresa_ids: str | None = Query(default=None),
    anios: str | None = Query(default=None),
    meses: str | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
):
    tenant_ids_list = _merge_single_and_multi(single_value=tenant_id, multi_value=tenant_ids)
    empresa_ids_list = _merge_single_and_multi(single_value=empresa_id, multi_value=empresa_ids)
    anios_list = _merge_single_and_multi(single_value=anio, multi_value=anios)
    meses_list = _merge_single_and_multi(single_value=mes, multi_value=meses)

    base = db.query(MedidaPS, Empresa).join(Empresa, MedidaPS.empresa_id == Empresa.id)

    if tenant_ids_list:
        base = base.filter(
            MedidaPS.tenant_id.in_(tenant_ids_list),
            Empresa.tenant_id.in_(tenant_ids_list),
        )
    if empresa_ids_list:
        base = base.filter(MedidaPS.empresa_id.in_(empresa_ids_list))
    if anios_list:
        base = base.filter(MedidaPS.anio.in_(anios_list))
    if meses_list:
        base = base.filter(MedidaPS.mes.in_(meses_list))
    if tarifa:
        base = _ps_tarifa_filter(base, tarifa)

    total_q = db.query(func.count(MedidaPS.id))
    if tenant_ids_list:
        total_q = total_q.filter(MedidaPS.tenant_id.in_(tenant_ids_list))
    if empresa_ids_list:
        total_q = total_q.filter(MedidaPS.empresa_id.in_(empresa_ids_list))
    if anios_list:
        total_q = total_q.filter(MedidaPS.anio.in_(anios_list))
    if meses_list:
        total_q = total_q.filter(MedidaPS.mes.in_(meses_list))
    if tarifa:
        total_q = _ps_tarifa_filter(total_q, tarifa)

    total_int = int(total_q.scalar() or 0)
    pg = _paginate(total_int, page, page_size)

    filas = (
        base.order_by(
            MedidaPS.anio.desc(),
            MedidaPS.mes.desc(),
            MedidaPS.tenant_id.asc(),
            MedidaPS.empresa_id.asc(),
        )
        .offset(pg["offset"])
        .limit(pg["limit"])
        .all()
    )

    items: list[dict] = []
    for mp, empresa in filas:
        item = _sanitize_medida(mp)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        items.append(item)

    return {
        "items": items,
        "page": pg["page"],
        "page_size": pg["page_size"],
        "total": pg["total"],
        "total_pages": pg["total_pages"],
    }