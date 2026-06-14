# app/stg/wsprime/routes.py
# pyright: reportMissingImports=false, reportArgumentType=false, reportGeneralTypeIssues=false
"""
Endpoints REST para WS-PRIME.

Rutas:
  POST   /stg/wsprime/config                      -> crear
  GET    /stg/wsprime/config/{concentrador_id}    -> leer
  PATCH  /stg/wsprime/config/{concentrador_id}    -> actualizar
  DELETE /stg/wsprime/config/{concentrador_id}    -> borrar
  POST   /stg/wsprime/test/{concentrador_id}      -> test conexion
  GET    /stg/wsprime/info/{concentrador_id}      -> info general
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.stg.wsprime import services
from app.stg.wsprime.schemas import (
    WsPrimeConfigCreate,
    WsPrimeConfigOut,
    WsPrimeConfigUpdate,
    WsPrimeInfoGeneral,
    WsPrimeTestResult,
)
from app.tenants.models import User


router = APIRouter(prefix="/stg/wsprime", tags=["stg-wsprime"])


# ============================================================
# CRUD config
# ============================================================
@router.post(
    "/config",
    response_model=WsPrimeConfigOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_config_endpoint(
    payload: WsPrimeConfigCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        cfg = services.crear_config(db, user, payload)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e
    return WsPrimeConfigOut.model_validate(cfg)


@router.get(
    "/config/{concentrador_id}",
    response_model=WsPrimeConfigOut,
)
def obtener_config_endpoint(
    concentrador_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        cfg = services.obtener_config(db, user, concentrador_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
        ) from e

    if cfg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Concentrador {concentrador_id} no tiene configuracion WS-PRIME",
        )
    return WsPrimeConfigOut.model_validate(cfg)


@router.patch(
    "/config/{concentrador_id}",
    response_model=WsPrimeConfigOut,
)
def actualizar_config_endpoint(
    concentrador_id: int,
    payload: WsPrimeConfigUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        cfg = services.actualizar_config(db, user, concentrador_id, payload)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
        ) from e
    return WsPrimeConfigOut.model_validate(cfg)


@router.delete(
    "/config/{concentrador_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def borrar_config_endpoint(
    concentrador_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        services.borrar_config(db, user, concentrador_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
        ) from e


# ============================================================
# Operaciones via adapter
# ============================================================
@router.post(
    "/test/{concentrador_id}",
    response_model=WsPrimeTestResult,
)
def test_conexion_endpoint(
    concentrador_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        resultado = services.test_conexion(db, user, concentrador_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
        ) from e
    return WsPrimeTestResult(**resultado)


@router.get(
    "/info/{concentrador_id}",
    response_model=WsPrimeInfoGeneral,
)
def info_general_endpoint(
    concentrador_id: int,
    meter_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        resultado = services.leer_info_general(
            db, user, concentrador_id, meter_id=meter_id
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
        ) from e
    return WsPrimeInfoGeneral(**resultado)