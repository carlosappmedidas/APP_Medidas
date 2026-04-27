# app/perdidas/routes.py
# pyright: reportMissingImports=false, reportArgumentType=false, reportCallIssue=false

from __future__ import annotations

from datetime import date
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.comunicaciones.models import FtpConfig
from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.permissions import assert_empresa_access, get_allowed_empresa_ids
from app.tenants.models import User
from app.perdidas import services
from app.perdidas.models import Concentrador
from app.perdidas.schemas import (
    ConcentradorCreate,
    ConcentradorRead,
    ConcentradorUpdate,
    ConcentradorDescubierto,
    PerdidaDiariaRead,
    PerdidaMensualRead,
    ProcesarS02Request,
    ProcesarS02Response,
)

router = APIRouter(prefix="/perdidas", tags=["perdidas"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))


def _assert_not_viewer(user: User) -> None:
    if str(getattr(user, "rol", "")) == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


# ── Concentradores — CRUD ─────────────────────────────────────────────────────

@router.get("/concentradores", response_model=List[ConcentradorRead])
def get_concentradores(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    if empresa_id is not None:
        assert_empresa_access(db, current_user, empresa_id)
    return services.list_concentradores(
        db,
        tenant_id=_tenant_id(current_user),
        allowed_empresa_ids=get_allowed_empresa_ids(db, current_user),
        empresa_id=empresa_id,
    )


@router.post("/concentradores", response_model=ConcentradorRead, status_code=status.HTTP_201_CREATED)
def create_concentrador(
    payload: ConcentradorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    assert_empresa_access(db, current_user, payload.empresa_id)
    try:
        return services.create_concentrador(
            db,
            tenant_id=_tenant_id(current_user),
            empresa_id=payload.empresa_id,
            nombre_ct=payload.nombre_ct,
            id_concentrador=payload.id_concentrador,
            id_supervisor=payload.id_supervisor,
            magn_supervisor=payload.magn_supervisor,
            directorio_ftp=payload.directorio_ftp,
            ftp_config_id=payload.ftp_config_id,
            activo=payload.activo,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.patch("/concentradores/{concentrador_id}", response_model=ConcentradorRead)
def update_concentrador(
    concentrador_id: int,
    payload: ConcentradorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)
    # Cargar concentrador primero para validar acceso a su empresa
    concentrador = (
        db.query(Concentrador)
        .filter(Concentrador.id == concentrador_id, Concentrador.tenant_id == tid)
        .first()
    )
    if concentrador is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Concentrador id={concentrador_id} no encontrado")
    assert_empresa_access(db, current_user, int(concentrador.empresa_id))
    try:
        return services.update_concentrador(
            db,
            concentrador_id=concentrador_id,
            tenant_id=tid,
            nombre_ct=payload.nombre_ct,
            id_supervisor=payload.id_supervisor,
            magn_supervisor=payload.magn_supervisor,
            directorio_ftp=payload.directorio_ftp,
            ftp_config_id=payload.ftp_config_id,
            activo=payload.activo,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.delete("/concentradores/{concentrador_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_concentrador(
    concentrador_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)
    # Cargar concentrador primero para validar acceso a su empresa
    concentrador = (
        db.query(Concentrador)
        .filter(Concentrador.id == concentrador_id, Concentrador.tenant_id == tid)
        .first()
    )
    if concentrador is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Concentrador id={concentrador_id} no encontrado")
    assert_empresa_access(db, current_user, int(concentrador.empresa_id))
    try:
        services.delete_concentrador(db, concentrador_id=concentrador_id, tenant_id=tid)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


# ── Descubrimiento automático ─────────────────────────────────────────────────

@router.get("/concentradores/descubrir", response_model=List[ConcentradorDescubierto])
def descubrir_concentradores(
    ftp_config_id: int = Query(..., description="ID de la conexión FTP a escanear"),
    directorio: str = Query(..., description="Directorio FTP donde buscar S02, ej: /202604/"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)
    # Cargar FtpConfig primero para validar acceso a su empresa
    ftp_config = (
        db.query(FtpConfig)
        .filter(FtpConfig.id == ftp_config_id, FtpConfig.tenant_id == tid)
        .first()
    )
    if ftp_config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"FtpConfig id={ftp_config_id} no encontrada")
    assert_empresa_access(db, current_user, int(ftp_config.empresa_id))
    try:
        return services.descubrir_concentradores(
            db,
            tenant_id=tid,
            ftp_config_id=ftp_config_id,
            directorio=directorio,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Análisis de un S02 concreto ───────────────────────────────────────────────

@router.get("/concentradores/analizar")
def analizar_concentrador(
    ftp_config_id: int = Query(...),
    directorio: str = Query(...),
    fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Descarga y parsea un fichero S02 concreto del FTP para extraer
    id_supervisor, magn_supervisor y num_contadores.
    """
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)
    # Cargar FtpConfig primero para validar acceso a su empresa
    ftp_config = (
        db.query(FtpConfig)
        .filter(FtpConfig.id == ftp_config_id, FtpConfig.tenant_id == tid)
        .first()
    )
    if ftp_config is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"FtpConfig id={ftp_config_id} no encontrada")
    assert_empresa_access(db, current_user, int(ftp_config.empresa_id))
    try:
        return services.analizar_s02_ftp(
            db,
            tenant_id=tid,
            ftp_config_id=ftp_config_id,
            directorio=directorio,
            fichero=fichero,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error FTP: {str(e)[:200]}") from e


# ── Procesamiento S02 ─────────────────────────────────────────────────────────

@router.post("/procesar", response_model=ProcesarS02Response)
def procesar_s02(
    payload: ProcesarS02Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Procesa los ficheros S02 descargados y calcula pérdidas.
    Si ya existe un registro para esa fecha → sobreescribe.
    """
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)
    # Si vienen concentrador_ids explícitos, validar acceso a la empresa de cada uno
    if payload.concentrador_ids:
        concentradores = (
            db.query(Concentrador)
            .filter(
                Concentrador.id.in_(payload.concentrador_ids),
                Concentrador.tenant_id == tid,
            )
            .all()
        )
        ids_encontrados = {int(c.id) for c in concentradores}
        ids_faltantes = [cid for cid in payload.concentrador_ids if cid not in ids_encontrados]
        if ids_faltantes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Concentradores no encontrados: {ids_faltantes}",
            )
        empresas_implicadas = {int(c.empresa_id) for c in concentradores}
        for emp_id in empresas_implicadas:
            assert_empresa_access(db, current_user, emp_id)
    procesados, errores, omitidos, detalle = services.procesar_s02(
        db,
        tenant_id=tid,
        allowed_empresa_ids=get_allowed_empresa_ids(db, current_user),
        concentrador_ids=payload.concentrador_ids,
        fecha_desde=payload.fecha_desde,
        fecha_hasta=payload.fecha_hasta,
    )
    return ProcesarS02Response(
        procesados=procesados,
        errores=errores,
        omitidos=omitidos,
        detalle=detalle,
    )


# ── Pérdidas diarias ──────────────────────────────────────────────────────────

@router.get("/diarias", response_model=List[PerdidaDiariaRead])
def get_perdidas_diarias(
    empresa_id: Optional[int] = Query(None),
    concentrador_id: Optional[int] = Query(None),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    if empresa_id is not None:
        assert_empresa_access(db, current_user, empresa_id)
    return services.list_perdidas_diarias(
        db,
        tenant_id=_tenant_id(current_user),
        allowed_empresa_ids=get_allowed_empresa_ids(db, current_user),
        empresa_id=empresa_id,
        concentrador_id=concentrador_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        limit=limit,
    )


# ── Pérdidas mensuales ────────────────────────────────────────────────────────

@router.get("/mensuales", response_model=List[PerdidaMensualRead])
def get_perdidas_mensuales(
    empresa_id: Optional[int] = Query(None),
    concentrador_id: Optional[int] = Query(None),
    anio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_not_viewer(current_user)
    if empresa_id is not None:
        assert_empresa_access(db, current_user, empresa_id)
    return services.list_perdidas_mensuales(
        db,
        tenant_id=_tenant_id(current_user),
        allowed_empresa_ids=get_allowed_empresa_ids(db, current_user),
        empresa_id=empresa_id,
        concentrador_id=concentrador_id,
        anio=anio,
    )
