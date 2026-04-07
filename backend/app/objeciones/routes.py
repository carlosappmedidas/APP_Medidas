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

class DeleteResponse(BaseModel):
    deleted: int

class FicheroStats(BaseModel):
    nombre_fichero: str
    created_at: Optional[datetime] = None
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_agrecl_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return services.update_agrecl_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/agrecl/{id}", response_model=DeleteResponse)
def delete_agrecl_one(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_agrecl(db, ids=[id], tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/agrecl/bulk-delete", response_model=DeleteResponse)
def bulk_delete_agrecl(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_agrecl(db, ids=payload.ids, tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/agrecl/generate")
def generate_agrecl(
    empresa_id: int = Query(...),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content = services.generate_reobagrecl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    base = nombre_fichero.replace("AOBAGRECL", "REOBAGRECL") if nombre_fichero else "REOBAGRECL_todos"
    filename = f"{base}.bz2"
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_incl_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return services.update_incl_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/incl/{id}", response_model=DeleteResponse)
def delete_incl_one(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_incl(db, ids=[id], tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/incl/bulk-delete", response_model=DeleteResponse)
def bulk_delete_incl(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_incl(db, ids=payload.ids, tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/incl/generate")
def generate_incl(
    empresa_id: int = Query(...),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content = services.generate_reobjeincl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    base = nombre_fichero.replace("OBJEINCL", "REOBJEINCL") if nombre_fichero else "REOBJEINCL_todos"
    filename = f"{base}.bz2"
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_cups_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return services.update_cups_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/cups/{id}", response_model=DeleteResponse)
def delete_cups_one(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_cups(db, ids=[id], tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/cups/bulk-delete", response_model=DeleteResponse)
def bulk_delete_cups(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_cups(db, ids=payload.ids, tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/cups/generate")
def generate_cups(
    empresa_id: int = Query(...),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content = services.generate_reobcups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    base = nombre_fichero.replace("AOBCUPS", "REOBCUPS") if nombre_fichero else "REOBCUPS_todos"
    filename = f"{base}.bz2"
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_cil_fichero(db, nombre_fichero=nombre_fichero, tenant_id=_effective_tenant(current_user))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return services.update_cil_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/cil/{id}", response_model=DeleteResponse)
def delete_cil_one(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_cil(db, ids=[id], tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/cil/bulk-delete", response_model=DeleteResponse)
def bulk_delete_cil(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = services.delete_cil(db, ids=payload.ids, tenant_id=_effective_tenant(current_user))
    return DeleteResponse(deleted=deleted)


@router.post("/cil/generate")
def generate_cil(
    empresa_id: int = Query(...),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content = services.generate_reobcil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    base = nombre_fichero.replace("AOBCIL", "REOBCIL") if nombre_fichero else "REOBCIL_todos"
    filename = f"{base}.bz2"
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})
