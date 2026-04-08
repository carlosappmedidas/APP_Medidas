# app/comunicaciones/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.tenants.models import User
from app.comunicaciones import services
from app.comunicaciones.schemas import (
    DescargarResponse,
    FtpConfigCreate,
    FtpConfigRead,
    FtpConfigUpdate,
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
    try:
        return services.create_config(
            db,
            tenant_id=_tenant_id(current_user),
            empresa_id=payload.empresa_id,
            nombre=payload.nombre,
            host=payload.host,
            puerto=payload.puerto,
            usuario=payload.usuario,
            password=payload.password,
            directorio_remoto=payload.directorio_remoto,
            usar_tls=payload.usar_tls,
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
            nombre=payload.nombre,
            host=payload.host,
            puerto=payload.puerto,
            usuario=payload.usuario,
            password=payload.password,
            directorio_remoto=payload.directorio_remoto,
            usar_tls=payload.usar_tls,
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


# ── Explorador — listar path por config_id ────────────────────────────────────

@router.get("/explorar/{config_id}")
def explorar_path(
    config_id: int,
    path: str = Query("/", description="Path remoto a listar"),
    filtro_nombre: Optional[str] = Query(None, description="Filtrar por texto en el nombre del fichero"),
    filtro_mes: Optional[str] = Query(None, description="Filtrar por mes en formato YYYY-MM (ej: 2026-04)"),
    limite: int = Query(5000, ge=1, le=10000, description="Máximo ficheros a devolver"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _assert_not_viewer(current_user)
    try:
        return services.listar_path(
            db,
            config_id=config_id,
            tenant_id=_tenant_id(current_user),
            path=path,
            filtro_nombre=filtro_nombre,
            filtro_mes=filtro_mes,
            limite=limite,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Descarga por config_id ────────────────────────────────────────────────────

class DescargarConPathPayload(BaseModel):
    path: str
    ficheros: List[str]


@router.post("/descargar/{config_id}", response_model=DescargarResponse)
def descargar_ficheros(
    config_id: int,
    payload: DescargarConPathPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    if not payload.ficheros:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se indicaron ficheros")
    try:
        descargados, errores, detalle = services.descargar_ficheros(
            db,
            config_id=config_id,
            tenant_id=_tenant_id(current_user),
            path=payload.path,
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
