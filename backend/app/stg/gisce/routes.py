# app/stg/gisce/routes.py
# pyright: reportMissingImports=false
"""Endpoints REST del importador GISCE-ERP (Paquete 8f-3a)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.tenants.models import User

from . import services
from .schemas import GisceConfigIn, GisceConfigOut, GisceTestResult


router = APIRouter(prefix="/stg/gisce", tags=["stg-gisce"])


def _check_empresa_acceso(user: User, empresa_id: int) -> None:
    permitidas = getattr(user, "empresa_ids_permitidas", None)
    # Lista vacia o None = acceso a todas las empresas
    if permitidas and empresa_id not in permitidas:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"No tienes acceso a la empresa {empresa_id}",
        )


@router.get("/config", response_model=Optional[GisceConfigOut])
def get_config(
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Devuelve la config GISCE de la empresa, o null si no hay ninguna."""
    _check_empresa_acceso(user, empresa_id)
    return services.leer_config(db, empresa_id)


@router.put("/config", response_model=GisceConfigOut)
def put_config(
    payload: GisceConfigIn,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Crea o actualiza la config GISCE. Password cifrado con Fernet."""
    _check_empresa_acceso(user, empresa_id)
    tenant_id = getattr(user, "tenant_id", None)
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario sin tenant_id",
        )
    return services.guardar_config(db, tenant_id, empresa_id, payload)


@router.post("/test", response_model=GisceTestResult)
def post_test(
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Prueba la conexion XML-RPC. Actualiza estado/ultimo_error en BD."""
    _check_empresa_acceso(user, empresa_id)
    return services.probar_conexion(db, empresa_id)
