# app/comunicaciones/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.tenants.models import User
from app.comunicaciones import services
from app.comunicaciones.schemas import (
    DescargarPayload,
    DescargarResponse,
    FtpConfigCreate,
    FtpConfigRead,
    FtpConfigUpdate,
    FtpFichero,
    FtpSyncLogRead,
    TestResponse,
)

router = APIRouter(prefix="/ftp", tags=["comunicaciones"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))

def _is_superuser(user: User) -> bool:
    return bool(getattr(user, "is_superuser", False))

def _assert_not_viewer(user: User) -> None:
    if str(getattr(user, "rol", "")) == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

def _get_empresa_or_404(db: Session, empresa_id: int) -> Empresa:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return emp

def _assert_empresa_access(user: User, empresa: Empresa) -> None:
    if _is_superuser(user):
        return
    if int(getattr(empresa, "tenant_id")) != _tenant_id(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")
    try:
        rel = getattr(user, "empresas_permitidas", None) or []
        allowed = [int(getattr(e, "id")) for e in rel]
    except Exception:
        allowed = []
    if allowed and int(getattr(empresa, "id")) not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")


# ── Configuraciones ───────────────────────────────────────────────────────────

@router.get("/configs", response_model=List[FtpConfigRead])
def get_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    return services.list_configs(db, tenant_id=_tenant_id(current_user))


@router.post("/configs", response_model=FtpConfigRead, status_code=status.HTTP_201_CREATED)
def create_config(
    payload: FtpConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    empresa = _get_empresa_or_404(db, payload.empresa_id)
    _assert_empresa_access(current_user, empresa)
    try:
        return services.create_config(
            db,
            tenant_id=_tenant_id(current_user),
            empresa_id=payload.empresa_id,
            host=payload.host,
            puerto=payload.puerto,
            usuario=payload.usuario,
            password=payload.password,
            directorio_remoto=payload.directorio_remoto,
            activo=payload.activo,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.patch("/configs/{config_id}", response_model=FtpConfigRead)
def update_config(
    config_id: int,
    payload: FtpConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    try:
        return services.update_config(
            db,
            config_id=config_id,
            tenant_id=_tenant_id(current_user),
            host=payload.host,
            puerto=payload.puerto,
            usuario=payload.usuario,
            password=payload.password,
            directorio_remoto=payload.directorio_remoto,
            activo=payload.activo,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.delete("/configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_config(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    try:
        services.delete_config(db, config_id=config_id, tenant_id=_tenant_id(current_user))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


# ── Test conexión ─────────────────────────────────────────────────────────────

@router.post("/test/{config_id}", response_model=TestResponse)
def test_conexion(
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    ok, msg = services.test_conexion(db, config_id=config_id, tenant_id=_tenant_id(current_user))
    return TestResponse(ok=ok, message=msg)


# ── Explorador remoto ─────────────────────────────────────────────────────────

@router.get("/listar/{empresa_id}", response_model=List[FtpFichero])
def listar_ficheros(
    empresa_id: int,
    filtro: Optional[str] = Query(None, description="Filtrar por texto en el nombre del fichero"),
    limite: int = Query(1000, ge=1, le=5000, description="Máximo de ficheros a devolver"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(current_user, empresa)
    try:
        return services.listar_ficheros(
            db,
            empresa_id=empresa_id,
            tenant_id=_tenant_id(current_user),
            filtro=filtro,
            limite=limite,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Descarga ──────────────────────────────────────────────────────────────────

@router.post("/descargar/{empresa_id}", response_model=DescargarResponse)
def descargar_ficheros(
    empresa_id: int,
    payload: DescargarPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(current_user, empresa)
    if not payload.ficheros:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se indicaron ficheros a descargar")
    try:
        descargados, errores, detalle = services.descargar_ficheros(
            db,
            empresa_id=empresa_id,
            tenant_id=_tenant_id(current_user),
            nombres=payload.ficheros,
        )
        return DescargarResponse(descargados=descargados, errores=errores, detalle=detalle)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Historial ─────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=List[FtpSyncLogRead])
def get_logs(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    return services.list_logs(db, tenant_id=_tenant_id(current_user), limit=limit)
