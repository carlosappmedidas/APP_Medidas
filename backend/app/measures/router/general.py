from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_active_superuser, get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.measures.m1_models import M1PeriodContribution
from app.measures.models import MedidaGeneral, MedidaPS
from app.measures.ps_detail_models import PSPeriodDetail
from app.measures.ps_models import PSPeriodContribution
from app.measures.router.utils import (
    build_empresa_codigo,
    paginate,
    sanitize_medida,
)
from app.tenants.models import User

router = APIRouter(prefix="/general", tags=["medidas"])


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


def _parse_int_list_param(value: str | None) -> list[int]:
    if not value:
        return []
    result: list[int] = []
    for part in value.split(","):
        s = part.strip()
        if not s:
            continue
        try:
            result.append(int(s))
        except ValueError:
            continue
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
    mg_q = db.query(MedidaGeneral).filter(MedidaGeneral.file_id.in_(file_ids_select))
    mp_q = db.query(MedidaPS).filter(MedidaPS.file_id.in_(file_ids_select))
    ingestion_q = db.query(IngestionFile).filter(IngestionFile.id.in_(file_ids_select))

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
    deleted_mp = mp_q.delete(synchronize_session=False)
    deleted_mg = mg_q.delete(synchronize_session=False)
    deleted_ingestion = ingestion_q.delete(synchronize_session=False)

    return {
        "deleted_m1_period_contributions": int(deleted_m1 or 0),
        "deleted_ps_period_detail": int(deleted_ps_detail or 0),
        "deleted_ps_period_contributions": int(deleted_ps_contrib or 0),
        "deleted_medidas_ps": int(deleted_mp or 0),
        "deleted_medidas_general": int(deleted_mg or 0),
        "deleted_ingestion_files": int(deleted_ingestion or 0),
    }


@router.get("/")
def listar_medidas_generales(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    tenant_id = int(cast(int, current_user.tenant_id))
    allowed_empresa_ids = _allowed_empresa_ids(db, current_user)

    if not allowed_empresa_ids:
        return []

    query = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
        .filter(
            MedidaGeneral.tenant_id == tenant_id,
            Empresa.tenant_id == tenant_id,
            MedidaGeneral.empresa_id.in_(allowed_empresa_ids),
            Empresa.id.in_(allowed_empresa_ids),
        )
        .order_by(
            MedidaGeneral.anio.desc(),
            MedidaGeneral.mes.desc(),
            MedidaGeneral.empresa_id.asc(),
        )
    )

    filas = query.all()

    resultado: list[dict[str, Any]] = []
    for mg, empresa in filas:
        item = sanitize_medida(mg)
        item["empresa_codigo"] = build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.get("/all")
def listar_medidas_generales_todos_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> list[dict[str, Any]]:
    _ = current_user

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

    resultado: list[dict[str, Any]] = []
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
) -> dict[str, Any]:
    _ = current_user

    query = db.query(MedidaGeneral)

    if tenant_id is not None:
        query = query.filter(MedidaGeneral.tenant_id == tenant_id)
    if empresa_id is not None:
        query = query.filter(MedidaGeneral.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(MedidaGeneral.anio == anio)
    if mes is not None:
        query = query.filter(MedidaGeneral.mes == mes)

    file_ids_subq = (
        query.filter(MedidaGeneral.file_id.isnot(None))
        .with_entities(MedidaGeneral.file_id)
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
        "mode": "deep",
        "filters": {
            "tenant_id": tenant_id,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
        **result,
    }


class DeleteIdsPayload(BaseModel):
    ids: list[int]


@router.delete("/all/ids")
def borrar_medidas_generales_todos_tenants_por_ids(
    payload: DeleteIdsPayload = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> dict[str, Any]:
    _ = current_user

    ids = [int(x) for x in (payload.ids or []) if int(x) > 0]
    if not ids:
        return {"deleted": 0, "ids": [], "mode": "deep"}

    file_ids_subq = (
        db.query(MedidaGeneral.file_id)
        .filter(
            MedidaGeneral.id.in_(ids),
            MedidaGeneral.file_id.isnot(None),
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
        "ids": ids,
        "mode": "deep",
        **result,
    }


@router.get("/filters")
def medidas_general_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    tenant_id = int(cast(int, current_user.tenant_id))
    allowed_empresa_ids = _allowed_empresa_ids(db, current_user)

    if not allowed_empresa_ids:
        return {"empresas": [], "anios": [], "meses": []}

    empresas_rows = (
        db.query(Empresa)
        .join(MedidaGeneral, MedidaGeneral.empresa_id == Empresa.id)
        .filter(
            Empresa.tenant_id == tenant_id,
            MedidaGeneral.tenant_id == tenant_id,
            Empresa.id.in_(allowed_empresa_ids),
            MedidaGeneral.empresa_id.in_(allowed_empresa_ids),
        )
        .distinct()
        .order_by(Empresa.id.asc())
        .all()
    )

    empresas = [
        {
            "id": cast(int, getattr(e, "id")),
            "codigo": build_empresa_codigo(e),
            "nombre": cast(str, getattr(e, "nombre", "")) or f"Empresa {getattr(e, 'id')}",
        }
        for e in empresas_rows
    ]

    anios = [
        int(r[0])
        for r in (
            db.query(MedidaGeneral.anio)
            .filter(
                MedidaGeneral.tenant_id == tenant_id,
                MedidaGeneral.empresa_id.in_(allowed_empresa_ids),
            )
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
            .filter(
                MedidaGeneral.tenant_id == tenant_id,
                MedidaGeneral.empresa_id.in_(allowed_empresa_ids),
            )
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
) -> dict[str, Any]:
    _ = current_user

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
            "nombre": cast(str, getattr(e, "nombre", "")) or f"Empresa {getattr(e, 'id')}",
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
    empresa_ids: str | None = Query(default=None),
    anios: str | None = Query(default=None),
    meses: str | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    tenant_id = int(cast(int, current_user.tenant_id))
    allowed_empresa_ids = _allowed_empresa_ids(db, current_user)

    if not allowed_empresa_ids:
        return {
            "items": [],
            "page": 0,
            "page_size": page_size,
            "total": 0,
            "total_pages": 1,
        }

    empresa_ids_list = _merge_single_and_multi(single_value=empresa_id, multi_value=empresa_ids)
    anios_list = _merge_single_and_multi(single_value=anio, multi_value=anios)
    meses_list = _merge_single_and_multi(single_value=mes, multi_value=meses)

    if empresa_ids_list:
        empresa_ids_list = [eid for eid in empresa_ids_list if eid in allowed_empresa_ids]
        if not empresa_ids_list:
            return {
                "items": [],
                "page": 0,
                "page_size": page_size,
                "total": 0,
                "total_pages": 1,
            }

    base = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
        .filter(
            MedidaGeneral.tenant_id == tenant_id,
            Empresa.tenant_id == tenant_id,
            MedidaGeneral.empresa_id.in_(allowed_empresa_ids),
            Empresa.id.in_(allowed_empresa_ids),
        )
    )

    if empresa_ids_list:
        base = base.filter(MedidaGeneral.empresa_id.in_(empresa_ids_list))
    if anios_list:
        base = base.filter(MedidaGeneral.anio.in_(anios_list))
    if meses_list:
        base = base.filter(MedidaGeneral.mes.in_(meses_list))

    total = db.query(func.count(MedidaGeneral.id)).filter(
        MedidaGeneral.tenant_id == tenant_id,
        MedidaGeneral.empresa_id.in_(allowed_empresa_ids),
    )
    if empresa_ids_list:
        total = total.filter(MedidaGeneral.empresa_id.in_(empresa_ids_list))
    if anios_list:
        total = total.filter(MedidaGeneral.anio.in_(anios_list))
    if meses_list:
        total = total.filter(MedidaGeneral.mes.in_(meses_list))

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

    items: list[dict[str, Any]] = []
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
    tenant_ids: str | None = Query(default=None),
    empresa_ids: str | None = Query(default=None),
    anios: str | None = Query(default=None),
    meses: str | None = Query(default=None),
    page: int = Query(default=0, ge=0),
    page_size: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    _ = current_user

    tenant_ids_list = _merge_single_and_multi(single_value=tenant_id, multi_value=tenant_ids)
    empresa_ids_list = _merge_single_and_multi(single_value=empresa_id, multi_value=empresa_ids)
    anios_list = _merge_single_and_multi(single_value=anio, multi_value=anios)
    meses_list = _merge_single_and_multi(single_value=mes, multi_value=meses)

    base = db.query(MedidaGeneral, Empresa).join(Empresa, MedidaGeneral.empresa_id == Empresa.id)

    if tenant_ids_list:
        base = base.filter(
            MedidaGeneral.tenant_id.in_(tenant_ids_list),
            Empresa.tenant_id.in_(tenant_ids_list),
        )
    if empresa_ids_list:
        base = base.filter(MedidaGeneral.empresa_id.in_(empresa_ids_list))
    if anios_list:
        base = base.filter(MedidaGeneral.anio.in_(anios_list))
    if meses_list:
        base = base.filter(MedidaGeneral.mes.in_(meses_list))

    total_q = db.query(func.count(MedidaGeneral.id))
    if tenant_ids_list:
        total_q = total_q.filter(MedidaGeneral.tenant_id.in_(tenant_ids_list))
    if empresa_ids_list:
        total_q = total_q.filter(MedidaGeneral.empresa_id.in_(empresa_ids_list))
    if anios_list:
        total_q = total_q.filter(MedidaGeneral.anio.in_(anios_list))
    if meses_list:
        total_q = total_q.filter(MedidaGeneral.mes.in_(meses_list))

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

    items: list[dict[str, Any]] = []
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