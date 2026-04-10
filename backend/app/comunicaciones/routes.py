# app/comunicaciones/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

import io
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
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
    FtpSyncRuleCreate,
    FtpSyncRuleRead,
    FtpSyncRuleUpdate,
    TestResponse,
)

router = APIRouter(prefix="/ftp", tags=["comunicaciones"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))

def _assert_not_viewer(user: User) -> None:
    if str(getattr(user, "rol", "")) == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


# ── Configuraciones ───────────────────────────────────────────────────────────

@router.get("/configs", response_model=List[FtpConfigRead])
def get_configs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    return services.list_configs(db, tenant_id=_tenant_id(current_user))


@router.post("/configs", response_model=FtpConfigRead, status_code=status.HTTP_201_CREATED)
def create_config(payload: FtpConfigCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        return services.create_config(db, tenant_id=_tenant_id(current_user), empresa_id=payload.empresa_id,
            nombre=payload.nombre, host=payload.host, puerto=payload.puerto, usuario=payload.usuario,
            password=payload.password, directorio_remoto=payload.directorio_remoto,
            usar_tls=payload.usar_tls, activo=payload.activo)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.patch("/configs/{config_id}", response_model=FtpConfigRead)
def update_config(config_id: int, payload: FtpConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        return services.update_config(db, config_id=config_id, tenant_id=_tenant_id(current_user),
            nombre=payload.nombre, host=payload.host, puerto=payload.puerto, usuario=payload.usuario,
            password=payload.password, directorio_remoto=payload.directorio_remoto,
            usar_tls=payload.usar_tls, activo=payload.activo)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.delete("/configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_config(config_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        services.delete_config(db, config_id=config_id, tenant_id=_tenant_id(current_user))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


# ── Test conexión ─────────────────────────────────────────────────────────────

@router.post("/test/{config_id}", response_model=TestResponse)
def test_conexion(config_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    ok, msg = services.test_conexion(db, config_id=config_id, tenant_id=_tenant_id(current_user))
    return TestResponse(ok=ok, message=msg)


# ── Explorador ────────────────────────────────────────────────────────────────

@router.get("/explorar/{config_id}")
def explorar_path(config_id: int, path: str = Query("/"), filtro_nombre: Optional[str] = Query(None),
                  filtro_mes: Optional[str] = Query(None), limite: int = Query(5000, ge=1, le=10000),
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Any:
    _assert_not_viewer(current_user)
    try:
        return services.listar_path(db, config_id=config_id, tenant_id=_tenant_id(current_user),
                                    path=path, filtro_nombre=filtro_nombre, filtro_mes=filtro_mes, limite=limite)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Descarga manual (al servidor) ────────────────────────────────────────────

class DescargarConPathPayload(BaseModel):
    path: str
    ficheros: List[str]


@router.post("/descargar/{config_id}", response_model=DescargarResponse)
def descargar_ficheros(config_id: int, payload: DescargarConPathPayload,
                       db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    if not payload.ficheros:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se indicaron ficheros")
    try:
        descargados, errores, detalle = services.descargar_ficheros(db, config_id=config_id,
            tenant_id=_tenant_id(current_user), path=payload.path, nombres=payload.ficheros)
        return DescargarResponse(descargados=descargados, errores=errores, detalle=detalle)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Descarga directa al navegador ────────────────────────────────────────────

@router.get("/descargar-archivo/{config_id}")
def descargar_archivo_navegador(config_id: int, path: str = Query(...), fichero: str = Query(...),
                                 registrar: bool = Query(True), db: Session = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        contenido = services.leer_fichero_ftp(db, config_id=config_id, tenant_id=_tenant_id(current_user),
                                               path=path, fichero=fichero, registrar=registrar)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e
    return StreamingResponse(io.BytesIO(contenido), media_type="application/octet-stream",
                             headers={"Content-Disposition": f'attachment; filename="{fichero}"'})


# ── Reglas de sync automática ─────────────────────────────────────────────────

@router.get("/rules", response_model=List[FtpSyncRuleRead])
def get_rules(config_id: Optional[int] = Query(None), db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    return services.list_rules(db, tenant_id=_tenant_id(current_user), config_id=config_id)


@router.post("/rules", response_model=FtpSyncRuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(payload: FtpSyncRuleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        return services.create_rule(db, tenant_id=_tenant_id(current_user), config_id=payload.config_id,
            nombre=payload.nombre, directorio=payload.directorio, patron_nombre=payload.patron_nombre,
            intervalo_horas=payload.intervalo_horas, activo=payload.activo, descargar_desde=payload.descargar_desde)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.patch("/rules/{rule_id}", response_model=FtpSyncRuleRead)
def update_rule(rule_id: int, payload: FtpSyncRuleUpdate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        return services.update_rule(db, rule_id=rule_id, tenant_id=_tenant_id(current_user),
            nombre=payload.nombre, directorio=payload.directorio, patron_nombre=payload.patron_nombre,
            intervalo_horas=payload.intervalo_horas, activo=payload.activo, descargar_desde=payload.descargar_desde)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        services.delete_rule(db, rule_id=rule_id, tenant_id=_tenant_id(current_user))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


@router.post("/rules/{rule_id}/ejecutar", response_model=DescargarResponse)
def ejecutar_regla_manual(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Ejecuta una regla ahora mismo sin esperar al scheduler."""
    _assert_not_viewer(current_user)
    try:
        descargados, errores, detalle = services.ejecutar_regla(db, rule_id=rule_id)
        return DescargarResponse(descargados=descargados, errores=errores, detalle=detalle)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Historial ─────────────────────────────────────────────────────────────────

@router.get("/logs/count")
def count_logs(
    origen: Optional[str] = Query(None, description="'manual' o 'auto'"),
    anio: Optional[int] = Query(None, description="Año para filtrar, ej: 2026"),
    mes: Optional[int] = Query(None, description="Mes para filtrar (1-12), ej: 1"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Devuelve el total real de registros en BD sin límite de visualización."""
    _assert_not_viewer(current_user)
    return {"count": services.count_logs(db, tenant_id=_tenant_id(current_user),
                                          origen=origen, anio=anio, mes=mes)}


@router.get("/logs", response_model=List[FtpSyncLogRead])
def get_logs(
    origen: Optional[str] = Query(None, description="'manual' o 'auto'"),
    limit: int = Query(500, ge=1, le=5000),
    anio: Optional[int] = Query(None, description="Año para filtrar, ej: 2026"),
    mes: Optional[int] = Query(None, description="Mes para filtrar (1-12), ej: 1"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    return services.list_logs(db, tenant_id=_tenant_id(current_user),
                               origen=origen, limit=limit, anio=anio, mes=mes)


# ── Borrado de logs ───────────────────────────────────────────────────────────

@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(log_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _assert_not_viewer(current_user)
    try:
        services.delete_log_by_id(db, log_id=log_id, tenant_id=_tenant_id(current_user))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


@router.delete("/logs", status_code=status.HTTP_200_OK)
def delete_logs(
    origen: Optional[str] = Query(None, description="'auto' | 'manual' | None = todos"),
    dias: Optional[int] = Query(None, description="Borrar registros con más de N días. None = borrar todos"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    count = services.delete_logs(db, tenant_id=_tenant_id(current_user), origen=origen, dias=dias)
    return {"deleted": count}


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Any:
    _assert_not_viewer(current_user)
    return services.get_dashboard(db, tenant_id=_tenant_id(current_user))
