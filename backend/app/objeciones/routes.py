# app/objeciones/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.tenants.models import User

from app.objeciones.schemas import (
    ImportResponse,
    ObjecionAGRECLRead,
    ObjecionCILRead,
    ObjecionCUPSRead,
    ObjecionINCLRead,
    RespuestaUpdate,
)
from app.objeciones import services

router = APIRouter(prefix="/objeciones", tags=["objeciones"])


# ── Schemas locales ───────────────────────────────────────────────────────────

class BulkDeletePayload(BaseModel):
    ids: List[int]
    empresa_id: int

class DeleteResponse(BaseModel):
    deleted: int

class FicheroStats(BaseModel):
    nombre_fichero: str
    created_at: Optional[datetime] = None
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    enviado_sftp_at: Optional[datetime] = None

class DashTipo(BaseModel):
    tipo: str
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int

class DashEmpresa(BaseModel):
    empresa_id: int
    empresa_nombre: str
    empresa_codigo_ree: Optional[str] = None
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int

class DashResponse(BaseModel):
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    por_tipo: List[DashTipo]
    por_empresa: List[DashEmpresa]


# ── Helpers de acceso ─────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))

def _is_superuser(user: User) -> bool:
    return bool(getattr(user, "is_superuser", False))

def _allowed_empresa_ids(user: User) -> List[int]:
    try:
        rel = getattr(user, "empresas_permitidas", None) or []
        return [int(getattr(e, "id")) for e in rel]
    except Exception:
        return []

def _get_empresa_or_404(db: Session, empresa_id: int) -> Empresa:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return empresa

def _assert_empresa_access(*, user: User, empresa: Empresa) -> None:
    if _is_superuser(user):
        return
    if int(getattr(empresa, "tenant_id")) != _tenant_id(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")
    allowed = _allowed_empresa_ids(user)
    if allowed and int(getattr(empresa, "id")) not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")

def _effective_tenant(user: User) -> int:
    return _tenant_id(user)

def _validar_nombre(nombre: str, tipo_ruta: str, empresa: Empresa) -> None:
    codigo_ree = str(getattr(empresa, "codigo_ree") or "").strip() or None
    error = services.validar_nombre_fichero(nombre, tipo_ruta, codigo_ree)
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

def _get_empresa_id_verificado(db: Session, empresa_id: int, user: User) -> int:
    """Obtiene y verifica acceso a empresa. Devuelve empresa_id."""
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=user, empresa=empresa)
    return empresa_id


# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD GLOBAL
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard", response_model=DashResponse)
def get_dashboard(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.objeciones.models import ObjecionAGRECL, ObjecionINCL, ObjecionCUPS, ObjecionCIL

    # Si se filtra por empresa, verificar acceso
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)

    tenant_id = _effective_tenant(current_user)

    MODELOS = [
        ("AOBAGRECL", ObjecionAGRECL),
        ("OBJEINCL",  ObjecionINCL),
        ("AOBCUPS",   ObjecionCUPS),
        ("AOBCIL",    ObjecionCIL),
    ]

    total_global = pendientes_global = aceptadas_global = rechazadas_global = 0
    por_tipo: List[DashTipo] = []
    por_empresa_dict: dict = {}

    for tipo_label, model in MODELOS:
        q = db.query(model).filter(model.tenant_id == tenant_id)
        if empresa_id:
            q = q.filter(model.empresa_id == empresa_id)
        rows = q.all()

        t_total = t_pend = t_ok = t_err = 0
        for r in rows:
            t_total += 1
            ac = getattr(r, "aceptacion") or ""
            if ac == "S":
                t_ok += 1
            elif ac == "N":
                t_err += 1
            else:
                t_pend += 1

            eid = int(getattr(r, "empresa_id"))
            if eid not in por_empresa_dict:
                emp = db.query(Empresa).filter(Empresa.id == eid).first()
                por_empresa_dict[eid] = {
                    "empresa_id": eid,
                    "empresa_nombre": getattr(emp, "nombre", "") if emp else f"Empresa {eid}",
                    "empresa_codigo_ree": getattr(emp, "codigo_ree", None) if emp else None,
                    "total": 0, "pendientes": 0, "aceptadas": 0, "rechazadas": 0,
                }
            d = por_empresa_dict[eid]
            d["total"] += 1
            if ac == "S":
                d["aceptadas"] += 1
            elif ac == "N":
                d["rechazadas"] += 1
            else:
                d["pendientes"] += 1

        if t_total > 0:
            por_tipo.append(DashTipo(
                tipo=tipo_label, total=t_total,
                pendientes=t_pend, aceptadas=t_ok, rechazadas=t_err,
            ))

        total_global      += t_total
        pendientes_global += t_pend
        aceptadas_global  += t_ok
        rechazadas_global += t_err

    por_empresa = [DashEmpresa(**v) for v in por_empresa_dict.values()]

    return DashResponse(
        total=total_global,
        pendientes=pendientes_global,
        aceptadas=aceptadas_global,
        rechazadas=rechazadas_global,
        por_tipo=por_tipo,
        por_empresa=por_empresa,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# AOBAGRECL
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/agrecl/import", response_model=ImportResponse)
async def import_agrecl(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "agrecl", empresa)
    content = await file.read()
    n = services.import_agrecl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="AOBAGRECL", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/agrecl/ficheros", response_model=List[FicheroStats])
def get_ficheros_agrecl(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_agrecl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/agrecl/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_agrecl(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_agrecl_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.get("/agrecl", response_model=List[ObjecionAGRECLRead])
def get_agrecl(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_agrecl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/agrecl/{id}", response_model=ObjecionAGRECLRead)
def patch_agrecl(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_agrecl_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/agrecl/{id}", response_model=DeleteResponse)
def delete_agrecl_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_agrecl(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/agrecl/bulk-delete", response_model=DeleteResponse)
def bulk_delete_agrecl(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_agrecl(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/agrecl/generate")
def generate_agrecl(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobagrecl_zip(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.post("/agrecl/generate-one")
def generate_agrecl_one(
    empresa_id: int = Query(...),
    objecion_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        content, filename = services.generate_reobagrecl_one(db, tenant_id=_effective_tenant(current_user), empresa_id=eid, objecion_id=objecion_id, nombre_fichero=nombre_fichero)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════════════
# OBJEINCL
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/incl/import", response_model=ImportResponse)
async def import_incl(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "incl", empresa)
    content = await file.read()
    n = services.import_incl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="OBJEINCL", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/incl/ficheros", response_model=List[FicheroStats])
def get_ficheros_incl(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_incl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/incl/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_incl(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_incl_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.get("/incl", response_model=List[ObjecionINCLRead])
def get_incl(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_incl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/incl/{id}", response_model=ObjecionINCLRead)
def patch_incl(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_incl_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/incl/{id}", response_model=DeleteResponse)
def delete_incl_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_incl(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/incl/bulk-delete", response_model=DeleteResponse)
def bulk_delete_incl(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_incl(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/incl/generate")
def generate_incl(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobjeincl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════════════
# AOBCUPS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/cups/import", response_model=ImportResponse)
async def import_cups(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "cups", empresa)
    content = await file.read()
    n = services.import_cups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="AOBCUPS", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/cups/ficheros", response_model=List[FicheroStats])
def get_ficheros_cups(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_cups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/cups/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_cups(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cups_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.get("/cups", response_model=List[ObjecionCUPSRead])
def get_cups(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_cups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/cups/{id}", response_model=ObjecionCUPSRead)
def patch_cups(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_cups_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/cups/{id}", response_model=DeleteResponse)
def delete_cups_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cups(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/cups/bulk-delete", response_model=DeleteResponse)
def bulk_delete_cups(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_cups(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/cups/generate")
def generate_cups(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobcups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════════════
# AOBCIL
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/cil/import", response_model=ImportResponse)
async def import_cil(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "cil", empresa)
    content = await file.read()
    n = services.import_cil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="AOBCIL", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/cil/ficheros", response_model=List[FicheroStats])
def get_ficheros_cil(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_cil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/cil/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_cil(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cil_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.get("/cil", response_model=List[ObjecionCILRead])
def get_cil(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_cil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/cil/{id}", response_model=ObjecionCILRead)
def patch_cil(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_cil_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/cil/{id}", response_model=DeleteResponse)
def delete_cil_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cil(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/cil/bulk-delete", response_model=DeleteResponse)
def bulk_delete_cil(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_cil(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)

# ═══════════════════════════════════════════════════════════════════════════════
# ENVÍO SFTP (todos los tipos)
# ═══════════════════════════════════════════════════════════════════════════════

class ReobGeneradoRead(BaseModel):
    id: int
    tipo: str
    nombre_fichero_aob: str
    nombre_fichero_reob: str
    empresa_id: int
    comercializadora: Optional[str] = None
    aaaamm: Optional[str] = None
    num_registros: Optional[int] = None
    generado_at: Optional[datetime] = None
    enviado_sftp_at: Optional[datetime] = None
    config_sftp_id: Optional[int] = None

    class Config:
        from_attributes = True

@router.get("/reob-generados", response_model=List[ReobGeneradoRead])
def get_reob_generados(
    empresa_id: Optional[int] = Query(None),
    tipo: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.objeciones.models import ReobGenerado
    tenant_id = _effective_tenant(current_user)
    if empresa_id:
        _get_empresa_id_verificado(db, empresa_id, current_user)
    q = db.query(ReobGenerado).filter(ReobGenerado.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ReobGenerado.empresa_id == empresa_id)
    if tipo:
        q = q.filter(ReobGenerado.tipo == tipo)
    return q.order_by(ReobGenerado.enviado_sftp_at.desc()).all()


class ToggleSftpResponse(BaseModel):
    nombre_fichero: str
    enviado_sftp_at: Optional[datetime] = None

class ToggleSftpPayload(BaseModel):
    empresa_id: int
    nombre_fichero: str

@router.patch("/toggle-sftp/{tipo}", response_model=ToggleSftpResponse)
def toggle_sftp(
    tipo: str,
    payload: ToggleSftpPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alterna manualmente el estado enviado_sftp_at de un fichero."""
    TIPOS_VALIDOS = {"agrecl", "incl", "cups", "cil"}
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tipo '{tipo}' no válido")
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    try:
        nuevo_valor = services.toggle_enviado_sftp(
            db,
            tipo=tipo,
            tenant_id=_effective_tenant(current_user),
            empresa_id=eid,
            nombre_fichero=payload.nombre_fichero,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ToggleSftpResponse(nombre_fichero=payload.nombre_fichero, enviado_sftp_at=nuevo_valor)


class EnviarSftpPayload(BaseModel):
    empresa_id: int
    nombre_fichero: str
    config_id: int
    directorio_destino: str

class EnviarSftpResponse(BaseModel):
    ok: bool
    filename: str
    config_id: int
    directorio_destino: str

@router.post("/{tipo}/enviar-sftp", response_model=EnviarSftpResponse)
def enviar_sftp(
    tipo: str,
    payload: EnviarSftpPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera el REOB y lo sube al SFTP del concentrador secundario."""
    TIPOS_VALIDOS = {"agrecl", "incl", "cups", "cil"}
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tipo '{tipo}' no válido")
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    try:
        filename = services.enviar_al_sftp(
            db,
            tipo=tipo,
            tenant_id=_effective_tenant(current_user),
            empresa_id=eid,
            nombre_fichero=payload.nombre_fichero,
            config_id=payload.config_id,
            directorio_destino=payload.directorio_destino,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error SFTP: {str(exc)[:300]}") from exc
    return EnviarSftpResponse(
        ok=True,
        filename=filename,
        config_id=payload.config_id,
        directorio_destino=payload.directorio_destino,
    )


@router.post("/cil/generate")
def generate_cil(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobcil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})