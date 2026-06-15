# app/erp/routes.py
"""
Endpoints REST del módulo ERP.

Todos los endpoints requieren autenticación (Bearer JWT) y respetan los
permisos multi-empresa del usuario.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.erp import schemas, services
from app.tenants.models import User

router = APIRouter(prefix="/erp", tags=["erp"])


@router.get("/ping")
def ping(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Comprobación de que el módulo ERP está montado."""
    return {"status": "ok", "modulo": "erp"}


# ---------------------------------------------------------------------------
# Titulares
# ---------------------------------------------------------------------------
@router.get("/titulares", response_model=list[schemas.ErpTitularOut])
def listar_titulares(
    empresa_id: int = Query(...),
    search: Optional[str] = Query(None),
    solo_activos: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista los titulares de una empresa (con filtro de texto y de activos)."""
    return services.listar_titulares(
        db, user, empresa_id, search=search, solo_activos=solo_activos
    )


@router.post(
    "/titulares",
    response_model=schemas.ErpTitularOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_titular(
    payload: schemas.ErpTitularCreate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Crea un titular en la empresa indicada."""
    return services.crear_titular(db, user, empresa_id, payload)


@router.get("/titulares/{titular_id}", response_model=schemas.ErpTitularOut)
def obtener_titular(
    titular_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Devuelve un titular por id."""
    try:
        return services.obtener_titular(db, user, titular_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/titulares/{titular_id}", response_model=schemas.ErpTitularOut)
def actualizar_titular(
    titular_id: int,
    payload: schemas.ErpTitularUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Actualiza los campos enviados de un titular."""
    try:
        return services.actualizar_titular(db, user, titular_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/titulares/{titular_id}", response_model=schemas.ErpTitularOut)
def desactivar_titular(
    titular_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Baja lógica de un titular (activo=False). No borra el registro."""
    try:
        return services.desactivar_titular(db, user, titular_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

# ===========================================================================
# Suministros (CUPS) — Paq E-2 (vertical suministro)
# ===========================================================================
from app.erp import services
from app.erp.schemas import (
    ErpSuministroCreate,
    ErpSuministroUpdate,
    ErpSuministroOut,
)


@router.get("/suministros", response_model=list[ErpSuministroOut])
def listar_suministros_endpoint(
    empresa_id: int = Query(...),
    search: Optional[str] = Query(None),
    solo_activos: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.listar_suministros(
        db, user, empresa_id, search=search, solo_activos=solo_activos
    )


@router.post(
    "/suministros",
    response_model=ErpSuministroOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_suministro_endpoint(
    payload: ErpSuministroCreate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.crear_suministro(db, user, empresa_id, payload)
    except services.DuplicateCupsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get("/suministros/{suministro_id}", response_model=ErpSuministroOut)
def obtener_suministro_endpoint(
    suministro_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.obtener_suministro(db, user, suministro_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/suministros/{suministro_id}", response_model=ErpSuministroOut)
def actualizar_suministro_endpoint(
    suministro_id: int,
    payload: ErpSuministroUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.actualizar_suministro(db, user, suministro_id, payload)
    except services.DuplicateCupsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/suministros/{suministro_id}", response_model=ErpSuministroOut)
def desactivar_suministro_endpoint(
    suministro_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.desactivar_suministro(db, user, suministro_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
