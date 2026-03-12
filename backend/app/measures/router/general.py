from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, Query, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.db import get_db
from app.core.auth import get_current_user, get_current_active_superuser
from app.measures.models import MedidaGeneral
from app.empresas.models import Empresa
from app.tenants.models import User

from app.measures.router.utils import (
    sanitize_medida,
    build_empresa_codigo,
    paginate,
)

router = APIRouter(prefix="/general", tags=["medidas"])


@router.get("/")
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
        item = sanitize_medida(mg)
        item["empresa_codigo"] = build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.get("/all")
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
        item = sanitize_medida(mg)
        item["empresa_codigo"] = build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.delete("/all")
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


class DeleteIdsPayload(BaseModel):
    ids: list[int]


@router.delete("/all/ids")
def borrar_medidas_generales_todos_tenants_por_ids(
    payload: DeleteIdsPayload = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Borra medidas_general por IDs (modo Sistema).
    Solo superusuario.
    """
    ids = [int(x) for x in (payload.ids or []) if int(x) > 0]
    if not ids:
        return {"deleted": 0, "ids": []}

    deleted_rows = (
        db.query(MedidaGeneral)
        .filter(MedidaGeneral.id.in_(ids))
        .delete(synchronize_session=False)
    )
    db.commit()

    return {"deleted": deleted_rows, "ids": ids}


@router.get("/filters")
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
        {"id": cast(int, getattr(e, "id")), "codigo": build_empresa_codigo(e)}
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


@router.get("/all/filters")
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
            "codigo": build_empresa_codigo(e),
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


@router.get("/page")
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

    total = db.query(func.count(MedidaGeneral.id)).filter(MedidaGeneral.tenant_id == tenant_id)
    if empresa_id is not None:
        total = total.filter(MedidaGeneral.empresa_id == empresa_id)
    if anio is not None:
        total = total.filter(MedidaGeneral.anio == anio)
    if mes is not None:
        total = total.filter(MedidaGeneral.mes == mes)

    total_int = int(total.scalar() or 0)
    pg = paginate(total_int, page, page_size)

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
        item = sanitize_medida(mg)
        item["empresa_codigo"] = build_empresa_codigo(empresa)
        items.append(item)

    return {
        "items": items,
        "page": pg["page"],
        "page_size": pg["page_size"],
        "total": pg["total"],
        "total_pages": pg["total_pages"],
    }


@router.get("/all/page")
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
    base = db.query(MedidaGeneral, Empresa).join(Empresa, MedidaGeneral.empresa_id == Empresa.id)

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
    pg = paginate(total_int, page, page_size)

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
        item = sanitize_medida(mg)
        item["empresa_codigo"] = build_empresa_codigo(empresa)
        items.append(item)

    return {
        "items": items,
        "page": pg["page"],
        "page_size": pg["page_size"],
        "total": pg["total"],
        "total_pages": pg["total_pages"],
    }