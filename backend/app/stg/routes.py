# app/stg/routes.py
# pyright: reportMissingImports=false
"""
Endpoints REST del módulo STG.

Todos los endpoints requieren autenticación (Bearer JWT) y respetan los
permisos multi-empresa del usuario.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.stg import schemas, services
from app.stg.models import (
    ConexionStgEmpresa,
    StgConcentrador,
    Cups,
    FicheroRecibido,
    SolicitudFichero,
)
from app.tenants.models import User


router = APIRouter(prefix="/stg", tags=["stg"])


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get("/dashboard/summary", response_model=schemas.DashboardSummary)
def get_dashboard_summary(
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.get_dashboard_summary(db, user, empresa_id)


# ---------------------------------------------------------------------------
# CUPS
# ---------------------------------------------------------------------------
@router.get("/cups", response_model=schemas.CupsList)
def listar_cups(
    empresa_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.listar_cups(
        db, user, empresa_id=empresa_id, estado=estado,
        search=search, page=page, page_size=page_size,
    )


@router.get("/cups/{cups_id}", response_model=schemas.CupsRead)
def obtener_cups(
    cups_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(Cups).filter(Cups.id == cups_id).first()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "CUPS no encontrado")
    from app.core.permissions import assert_empresa_access
    assert_empresa_access(db, user, c.empresa_id)
    return {
        "id": c.id,
        "empresa_id": c.empresa_id,
        "cups": c.cups,
        "concentrador_id": c.concentrador_id,
        "concentrador_codigo_ct": (
            c.concentrador.codigo_ct if c.concentrador else None
        ),
        "numero_contador": c.numero_contador,
        "fabricante_contador": c.fabricante_contador,
        "modelo_contador": c.modelo_contador,
        "tarifa": c.tarifa,
        "tension_suministro": c.tension_suministro,
        "tipo_punto_medida": c.tipo_punto_medida,
        "direccion": c.direccion,
        "municipio": c.municipio,
        "provincia": c.provincia,
        "cp": c.cp,
        "latitud": c.latitud,
        "longitud": c.longitud,
        "autoconsumo": c.autoconsumo,
        "fecha_alta": c.fecha_alta,
        "fecha_baja": c.fecha_baja,
        "comercializadora_actual": c.comercializadora_actual,
        "ultimo_contacto": c.ultimo_contacto,
        "estado_comunicacion": c.estado_comunicacion,
        "activo": c.activo,
    }


# ---------------------------------------------------------------------------
# Concentradores
# ---------------------------------------------------------------------------
@router.get("/concentradores", response_model=schemas.ConcentradorList)
def listar_concentradores(
    empresa_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.listar_concentradores(
        db, user, empresa_id=empresa_id, estado=estado,
        page=page, page_size=page_size,
    )


@router.get("/concentradores/{concentrador_id}", response_model=schemas.ConcentradorRead)
def obtener_concentrador(
    concentrador_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = db.query(StgConcentrador).filter(StgConcentrador.id == concentrador_id).first()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Concentrador no encontrado")
    from app.core.permissions import assert_empresa_access
    assert_empresa_access(db, user, c.empresa_id)
    return c


# ---------------------------------------------------------------------------
# Solicitudes
# ---------------------------------------------------------------------------
@router.get("/solicitudes", response_model=schemas.SolicitudFicheroList)
def listar_solicitudes(
    empresa_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.listar_solicitudes(
        db, user, empresa_id=empresa_id, estado=estado,
        page=page, page_size=page_size,
    )


@router.post("/solicitudes", response_model=schemas.SolicitudFicheroRead, status_code=201)
def crear_solicitud(
    payload: schemas.SolicitudFicheroCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sol = services.crear_solicitud(db, user, payload.model_dump())
    return {
        "id": sol.id,
        "empresa_id": sol.empresa_id,
        "cups_id": sol.cups_id,
        "cups_codigo": sol.cups.cups if sol.cups else None,
        "concentrador_id": sol.concentrador_id,
        "concentrador_codigo_ct": (
            sol.concentrador.codigo_ct if sol.concentrador else None
        ),
        "tipo_fichero": sol.tipo_fichero,
        "fecha_desde": sol.fecha_desde,
        "fecha_hasta": sol.fecha_hasta,
        "prioridad": sol.prioridad,
        "estado": sol.estado,
        "solicitado_por": sol.solicitado_por,
        "mensaje_error": sol.mensaje_error,
        "fecha_envio": sol.fecha_envio,
        "fecha_recepcion": sol.fecha_recepcion,
        "created_at": sol.created_at,
    }


# ---------------------------------------------------------------------------
# Configuración de conexión por empresa
# ---------------------------------------------------------------------------
@router.get("/conexion", response_model=Optional[schemas.ConexionStgEmpresaRead])
def get_conexion(
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conf = services.get_conexion_empresa(db, user, empresa_id)
    return conf


@router.post("/conexion", response_model=schemas.ConexionStgEmpresaRead)
def upsert_conexion(
    payload: schemas.ConexionStgEmpresaCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.upsert_conexion_empresa(db, user, payload.model_dump())


@router.post("/conexion/test", response_model=schemas.ConexionTestResult)
def test_conexion(
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.probar_conexion(db, user, empresa_id)


# ---------------------------------------------------------------------------
# SFTP — endpoints solo lectura (Paquete 3)
# ---------------------------------------------------------------------------
@router.get("/sftp/listar", response_model=schemas.SftpListadoResponse)
def listar_ficheros_sftp(
    empresa_id: int = Query(...),
    filtro: Optional[str] = Query(None, description="Substring opcional para filtrar nombres"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Lista los ficheros disponibles en la carpeta_recepcion del SFTP de la empresa.

    Solo aplica si la conexión es de tipo 'sftp'. Para otros tipos devuelve
    un listado vacío.
    """
    return services.listar_ficheros_sftp(db, user, empresa_id, filtro_patron=filtro)


# ---------------------------------------------------------------------------
# Descarga real de ficheros (Paquete 5)
# ---------------------------------------------------------------------------
@router.post("/descargar", response_model=schemas.DescargaResponse)
def descargar_ficheros(
    empresa_id: int = Query(...),
    limite: int = Query(5, ge=1, le=1000, description="Máximo a descargar por petición"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Descarga ficheros NUEVOS (que no estén ya en BD) desde el STG remoto
    a `backend/storage/stg/empresa_<id>/<año-mes>/` (o lo que indique
    la env var STG_STORAGE_PATH).

    Filtra duplicados por (empresa_id, nombre_original).
    Extrae metadata del nombre (id_contador, tipo_mensaje, timestamp).

    Aplica a conexiones de tipo 'sftp' o 'ftp'.
    """
    try:
        return services.descargar_ficheros_nuevos(db, user, empresa_id, limite=limite)
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
