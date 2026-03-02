from __future__ import annotations

from decimal import Decimal
import math
import re
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.db import get_db
from app.core.auth import get_current_user, get_current_active_superuser
from app.measures.models import MedidaGeneral, MedidaPS
from app.empresas.models import Empresa
from app.tenants.models import User

router = APIRouter(prefix="/medidas", tags=["medidas"])


def _sanitize_value(value: Any):
    """
    Convierte NaN / infinitos en 0.0 para que sean JSON-compatibles.
    Deja el resto tal cual.
    """
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
    """
    Convierte un objeto MedidaGeneral o MedidaPS a dict, eliminando el estado interno
    de SQLAlchemy y saneando NaN/inf en todos los campos numéricos.
    """
    data = {k: v for k, v in medida_obj.__dict__.items() if not k.startswith("_")}

    for k, v in list(data.items()):
        data[k] = _sanitize_value(v)

    return data


def _build_empresa_codigo(empresa: Empresa) -> str | None:
    """
    Construye el código corto tipo 0277 / 0336 a partir de
    codigo_cnmc / codigo_ree / id.
    """
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

    # tarifa desconocida: no filtramos (no rompemos)
    return query


# ---------- MEDIDAS GENERAL (EXISTENTE) ----------


@router.get("/general/")
def listar_medidas_generales(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve las filas de medidas_general del tenant actual, ordenadas
    del mes más reciente al más antiguo.

    Además:
      - sanea cualquier NaN/Infinity para que el JSON sea válido.
      - añade empresa_codigo (ej. 0277, 0336...) a partir de Empresa.codigo_cnmc/codigo_ree.
    """
    query = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
        .filter(
            MedidaGeneral.tenant_id == current_user.tenant_id,
            Empresa.tenant_id == current_user.tenant_id,
        )
        .order_by(MedidaGeneral.anio.desc(), MedidaGeneral.mes.desc())
    )

    filas = query.all()

    resultado: list[dict] = []
    for mg, empresa in filas:
        item = _sanitize_medida(mg)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.get("/general/all")
def listar_medidas_generales_todos_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Devuelve TODAS las filas de medidas_general de TODOS los tenants.
    Solo puede llamarlo un superusuario de plataforma.

    Aplica el mismo saneado (NaN/Infinity) y el mismo cálculo de empresa_codigo.
    """
    query = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
        .order_by(
            MedidaGeneral.tenant_id.asc(),
            MedidaGeneral.anio.desc(),
            MedidaGeneral.mes.desc(),
        )
    )

    filas = query.all()

    resultado: list[dict] = []
    for mg, empresa in filas:
        item = _sanitize_medida(mg)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.delete("/general/all")
def borrar_medidas_generales_todos_tenants(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
):
    """
    Borra medidas_general de TODOS los tenants o filtrando por:
      - tenant_id (opcional)
      - empresa_id (opcional)
      - anio (opcional)
      - mes (opcional)

    Si no se pasa ningún filtro, borra TODAS las medidas de la BBDD.
    Solo puede llamarlo un superusuario de plataforma.
    """
    query = db.query(MedidaGeneral)

    if tenant_id is not None:
        query = query.filter(MedidaGeneral.tenant_id == tenant_id)

    if empresa_id is not None:
        query = query.filter(MedidaGeneral.empresa_id == empresa_id)

    if anio is not None:
        query = query.filter(MedidaGeneral.anio == anio)

    if mes is not None:
        query = query.filter(MedidaGeneral.mes == mes)

    deleted_rows = query.delete(synchronize_session=False)
    db.commit()

    return {
        "deleted": deleted_rows,
        "filters": {
            "tenant_id": tenant_id,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
    }


# ---------- MEDIDAS PS (EXISTENTE) ----------


@router.get("/ps/")
def listar_medidas_ps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve las filas de medidas_ps del tenant actual, ordenadas
    del mes más reciente al más antiguo.

    Añade empresa_codigo igual que en medidas_general.
    """
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


@router.get("/ps/all")
def listar_medidas_ps_todos_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Devuelve TODAS las filas de medidas_ps de TODOS los tenants.
    Solo puede llamarlo un superusuario de plataforma.
    """
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


# =========================================================
# ✅ NUEVO (PRO): FILTER OPTIONS (dropdowns completos)
# =========================================================


@router.get("/general/filters")
def medidas_general_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve opciones completas para filtros (tenant actual):
      - empresas: [{id, codigo}]
      - anios: [..]
      - meses: [..]
    """
    tenant_id = current_user.tenant_id

    # Empresas que tengan medidas_general
    empresas_rows = (
        db.query(Empresa)
        .join(MedidaGeneral, MedidaGeneral.empresa_id == Empresa.id)
        .filter(
            Empresa.tenant_id == tenant_id,
            MedidaGeneral.tenant_id == tenant_id,
        )
        .distinct()
        .order_by(Empresa.id.asc())
        .all()
    )

    empresas = [
        {"id": cast(int, getattr(e, "id")), "codigo": _build_empresa_codigo(e)}
        for e in empresas_rows
    ]

    anios = [
        int(r[0])
        for r in (
            db.query(MedidaGeneral.anio)
            .filter(MedidaGeneral.tenant_id == tenant_id)
            .distinct()
            .order_by(MedidaGeneral.anio.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    meses = [
        int(r[0])
        for r in (
            db.query(MedidaGeneral.mes)
            .filter(MedidaGeneral.tenant_id == tenant_id)
            .distinct()
            .order_by(MedidaGeneral.mes.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    return {"empresas": empresas, "anios": anios, "meses": meses}


@router.get("/general/all/filters")
def medidas_general_filters_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Opciones de filtros para Sistema (todos los tenants).
    """
    empresas_rows = (
        db.query(Empresa)
        .join(MedidaGeneral, MedidaGeneral.empresa_id == Empresa.id)
        .distinct()
        .order_by(Empresa.tenant_id.asc(), Empresa.id.asc())
        .all()
    )

    empresas = [
        {
            "id": cast(int, getattr(e, "id")),
            "codigo": _build_empresa_codigo(e),
            "tenant_id": cast(int, getattr(e, "tenant_id")),
        }
        for e in empresas_rows
    ]

    anios = [
        int(r[0])
        for r in (
            db.query(MedidaGeneral.anio)
            .distinct()
            .order_by(MedidaGeneral.anio.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    meses = [
        int(r[0])
        for r in (
            db.query(MedidaGeneral.mes)
            .distinct()
            .order_by(MedidaGeneral.mes.asc())
            .all()
        )
        if r and r[0] is not None
    ]

    return {"empresas": empresas, "anios": anios, "meses": meses}


@router.get("/ps/filters")
def medidas_ps_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve opciones completas para filtros PS (tenant actual):
      - empresas: [{id, codigo}]
      - anios: [..]
      - meses: [..]
      - tarifas: ["20td","30td",...]
    """
    tenant_id = current_user.tenant_id

    empresas_rows = (
        db.query(Empresa)
        .join(MedidaPS, MedidaPS.empresa_id == Empresa.id)
        .filter(
            Empresa.tenant_id == tenant_id,
            MedidaPS.tenant_id == tenant_id,
        )
        .distinct()
        .order_by(Empresa.id.asc())
        .all()
    )

    empresas = [
        {"id": cast(int, getattr(e, "id")), "codigo": _build_empresa_codigo(e)}
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

    # tarifas disponibles (miramos existencia de cualquier campo no null por bloque)
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


@router.get("/ps/all/filters")
def medidas_ps_filters_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Opciones filtros PS para Sistema (todos los tenants).
    """
    empresas_rows = (
        db.query(Empresa)
        .join(MedidaPS, MedidaPS.empresa_id == Empresa.id)
        .distinct()
        .order_by(Empresa.tenant_id.asc(), Empresa.id.asc())
        .all()
    )

    empresas = [
        {
            "id": cast(int, getattr(e, "id")),
            "codigo": _build_empresa_codigo(e),
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

    # Tarifas globales (best-effort)
    tarifas: list[str] = []
    def _has_any_global(col1, col2, col3) -> bool:
        q = db.query(func.count(MedidaPS.id)).filter((col1.isnot(None)) | (col2.isnot(None)) | (col3.isnot(None)))
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


# =========================================================
# ✅ NUEVO (PRO): PAGINACIÓN REAL
# =========================================================


@router.get("/general/page")
def listar_medidas_generales_page(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    empresa_id: int | None = Query(default=None),
    anio: int | None = Query(default=None),
    mes: int | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
):
    """
    Paginación real para medidas_general (tenant actual).
    Respuesta:
      { items, page, page_size, total, total_pages }
    """
    tenant_id = current_user.tenant_id

    base = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
        .filter(
            MedidaGeneral.tenant_id == tenant_id,
            Empresa.tenant_id == tenant_id,
        )
    )

    if empresa_id is not None:
        base = base.filter(MedidaGeneral.empresa_id == empresa_id)
    if anio is not None:
        base = base.filter(MedidaGeneral.anio == anio)
    if mes is not None:
        base = base.filter(MedidaGeneral.mes == mes)

    # total
    total = (
        db.query(func.count(MedidaGeneral.id))
        .filter(MedidaGeneral.tenant_id == tenant_id)
    )
    if empresa_id is not None:
        total = total.filter(MedidaGeneral.empresa_id == empresa_id)
    if anio is not None:
        total = total.filter(MedidaGeneral.anio == anio)
    if mes is not None:
        total = total.filter(MedidaGeneral.mes == mes)

    total_int = int(total.scalar() or 0)
    pg = _paginate(total_int, page, page_size)

    filas = (
        base.order_by(
            MedidaGeneral.anio.desc(),
            MedidaGeneral.mes.desc(),
            MedidaGeneral.empresa_id.asc(),
        )
        .offset(pg["offset"])
        .limit(pg["limit"])
        .all()
    )

    items: list[dict] = []
    for mg, empresa in filas:
        item = _sanitize_medida(mg)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        items.append(item)

    return {
        "items": items,
        "page": pg["page"],
        "page_size": pg["page_size"],
        "total": pg["total"],
        "total_pages": pg["total_pages"],
    }


@router.get("/general/all/page")
def listar_medidas_generales_all_page(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
    tenant_id: int | None = Query(default=None),
    empresa_id: int | None = Query(default=None),
    anio: int | None = Query(default=None),
    mes: int | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
):
    """
    Paginación real para medidas_general (todos los tenants) - SOLO superuser.
    """
    base = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
    )

    if tenant_id is not None:
        base = base.filter(MedidaGeneral.tenant_id == tenant_id, Empresa.tenant_id == tenant_id)
    if empresa_id is not None:
        base = base.filter(MedidaGeneral.empresa_id == empresa_id)
    if anio is not None:
        base = base.filter(MedidaGeneral.anio == anio)
    if mes is not None:
        base = base.filter(MedidaGeneral.mes == mes)

    total_q = db.query(func.count(MedidaGeneral.id))
    if tenant_id is not None:
        total_q = total_q.filter(MedidaGeneral.tenant_id == tenant_id)
    if empresa_id is not None:
        total_q = total_q.filter(MedidaGeneral.empresa_id == empresa_id)
    if anio is not None:
        total_q = total_q.filter(MedidaGeneral.anio == anio)
    if mes is not None:
        total_q = total_q.filter(MedidaGeneral.mes == mes)

    total_int = int(total_q.scalar() or 0)
    pg = _paginate(total_int, page, page_size)

    filas = (
        base.order_by(
            MedidaGeneral.anio.desc(),
            MedidaGeneral.mes.desc(),
            MedidaGeneral.tenant_id.asc(),
            MedidaGeneral.empresa_id.asc(),
        )
        .offset(pg["offset"])
        .limit(pg["limit"])
        .all()
    )

    items: list[dict] = []
    for mg, empresa in filas:
        item = _sanitize_medida(mg)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        items.append(item)

    return {
        "items": items,
        "page": pg["page"],
        "page_size": pg["page_size"],
        "total": pg["total"],
        "total_pages": pg["total_pages"],
    }


@router.get("/ps/page")
def listar_medidas_ps_page(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    empresa_id: int | None = Query(default=None),
    anio: int | None = Query(default=None),
    mes: int | None = Query(default=None),
    tarifa: str | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
):
    """
    Paginación real para medidas_ps (tenant actual).
    """
    tenant_id = current_user.tenant_id

    base = (
        db.query(MedidaPS, Empresa)
        .join(Empresa, MedidaPS.empresa_id == Empresa.id)
        .filter(
            MedidaPS.tenant_id == tenant_id,
            Empresa.tenant_id == tenant_id,
        )
    )

    if empresa_id is not None:
        base = base.filter(MedidaPS.empresa_id == empresa_id)
    if anio is not None:
        base = base.filter(MedidaPS.anio == anio)
    if mes is not None:
        base = base.filter(MedidaPS.mes == mes)
    if tarifa:
        base = _ps_tarifa_filter(base, tarifa)

    # total (misma lógica de filtros)
    total_q = db.query(func.count(MedidaPS.id)).filter(MedidaPS.tenant_id == tenant_id)
    if empresa_id is not None:
        total_q = total_q.filter(MedidaPS.empresa_id == empresa_id)
    if anio is not None:
        total_q = total_q.filter(MedidaPS.anio == anio)
    if mes is not None:
        total_q = total_q.filter(MedidaPS.mes == mes)
    if tarifa:
        total_q = _ps_tarifa_filter(total_q, tarifa)  # funciona porque devuelve query con filter()

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


@router.get("/ps/all/page")
def listar_medidas_ps_all_page(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
    tenant_id: int | None = Query(default=None),
    empresa_id: int | None = Query(default=None),
    anio: int | None = Query(default=None),
    mes: int | None = Query(default=None),
    tarifa: str | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
):
    """
    Paginación real para medidas_ps (todos los tenants) - SOLO superuser.
    """
    base = (
        db.query(MedidaPS, Empresa)
        .join(Empresa, MedidaPS.empresa_id == Empresa.id)
    )

    if tenant_id is not None:
        base = base.filter(MedidaPS.tenant_id == tenant_id, Empresa.tenant_id == tenant_id)
    if empresa_id is not None:
        base = base.filter(MedidaPS.empresa_id == empresa_id)
    if anio is not None:
        base = base.filter(MedidaPS.anio == anio)
    if mes is not None:
        base = base.filter(MedidaPS.mes == mes)
    if tarifa:
        base = _ps_tarifa_filter(base, tarifa)

    total_q = db.query(func.count(MedidaPS.id))
    if tenant_id is not None:
        total_q = total_q.filter(MedidaPS.tenant_id == tenant_id)
    if empresa_id is not None:
        total_q = total_q.filter(MedidaPS.empresa_id == empresa_id)
    if anio is not None:
        total_q = total_q.filter(MedidaPS.anio == anio)
    if mes is not None:
        total_q = total_q.filter(MedidaPS.mes == mes)
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