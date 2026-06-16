# app/erp/routes.py
"""
Endpoints REST del módulo ERP.

Titulares/suministros/contratos: requieren auth y respetan permisos
multi-empresa. Catálogos (tarifas, comercializadoras): globales.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.erp import schemas, services, services_contrato
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
    return services.listar_titulares(db, user, empresa_id, search=search, solo_activos=solo_activos)


@router.post("/titulares", response_model=schemas.ErpTitularOut, status_code=status.HTTP_201_CREATED)
def crear_titular(
    payload: schemas.ErpTitularCreate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.crear_titular(db, user, empresa_id, payload)


@router.get("/titulares/{titular_id}", response_model=schemas.ErpTitularOut)
def obtener_titular(
    titular_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
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
    try:
        return services.actualizar_titular(db, user, titular_id, payload)
    except services.ValidacionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/titulares/{titular_id}", response_model=schemas.ErpTitularOut)
def desactivar_titular(
    titular_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.desactivar_titular(db, user, titular_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ---------------------------------------------------------------------------
# Suministros (CUPS)
# ---------------------------------------------------------------------------
@router.get("/suministros", response_model=list[schemas.ErpSuministroOut])
def listar_suministros_endpoint(
    empresa_id: int = Query(...),
    search: Optional[str] = Query(None),
    solo_activos: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.listar_suministros(db, user, empresa_id, search=search, solo_activos=solo_activos)


@router.post("/suministros", response_model=schemas.ErpSuministroOut, status_code=status.HTTP_201_CREATED)
def crear_suministro_endpoint(
    payload: schemas.ErpSuministroCreate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.crear_suministro(db, user, empresa_id, payload)
    except services.DuplicateCupsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get("/suministros/{suministro_id}", response_model=schemas.ErpSuministroOut)
def obtener_suministro_endpoint(
    suministro_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.obtener_suministro(db, user, suministro_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/suministros/{suministro_id}", response_model=schemas.ErpSuministroOut)
def actualizar_suministro_endpoint(
    suministro_id: int,
    payload: schemas.ErpSuministroUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.actualizar_suministro(db, user, suministro_id, payload)
    except services.DuplicateCupsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except services.ValidacionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/suministros/{suministro_id}", response_model=schemas.ErpSuministroOut)
def desactivar_suministro_endpoint(
    suministro_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.desactivar_suministro(db, user, suministro_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ---------------------------------------------------------------------------
# Catálogos: tarifas (solo lectura) y comercializadoras (CRUD) — globales
# ---------------------------------------------------------------------------
@router.get("/tarifas", response_model=list[schemas.ErpTarifaOut])
def listar_tarifas_endpoint(
    solo_activas: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.listar_tarifas(db, solo_activas=solo_activas)


@router.get("/comercializadoras", response_model=list[schemas.ErpComercializadoraOut])
def listar_comercializadoras_endpoint(
    search: Optional[str] = Query(None),
    solo_activas: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services.listar_comercializadoras(db, search=search, solo_activas=solo_activas)


@router.post("/comercializadoras", response_model=schemas.ErpComercializadoraOut, status_code=status.HTTP_201_CREATED)
def crear_comercializadora_endpoint(
    payload: schemas.ErpComercializadoraCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.crear_comercializadora(db, payload)
    except services.DuplicateComercializadoraError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.get("/comercializadoras/{com_id}", response_model=schemas.ErpComercializadoraOut)
def obtener_comercializadora_endpoint(
    com_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.obtener_comercializadora(db, com_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/comercializadoras/{com_id}", response_model=schemas.ErpComercializadoraOut)
def actualizar_comercializadora_endpoint(
    com_id: int,
    payload: schemas.ErpComercializadoraUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.actualizar_comercializadora(db, com_id, payload)
    except services.DuplicateComercializadoraError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/comercializadoras/{com_id}", response_model=schemas.ErpComercializadoraOut)
def desactivar_comercializadora_endpoint(
    com_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services.desactivar_comercializadora(db, com_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ---------------------------------------------------------------------------
# Contratos (E-6b)
# ---------------------------------------------------------------------------
@router.get("/contratos", response_model=list[schemas.ErpContratoOut])
def listar_contratos_endpoint(
    empresa_id: int = Query(...),
    search: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    suministro_id: Optional[int] = Query(None),
    solo_activos: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return services_contrato.listar_contratos(
        db, user, empresa_id, search=search, estado=estado,
        suministro_id=suministro_id, solo_activos=solo_activos,
    )


@router.post("/contratos", response_model=schemas.ErpContratoOut, status_code=status.HTTP_201_CREATED)
def crear_contrato_endpoint(
    payload: schemas.ErpContratoCreate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services_contrato.crear_contrato(db, user, empresa_id, payload)
    except services_contrato.ContratoSuministroActivoError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except services_contrato.ContratoValidacionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/contratos/{contrato_id}", response_model=schemas.ErpContratoOut)
def obtener_contrato_endpoint(
    contrato_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services_contrato.obtener_contrato(db, user, contrato_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/contratos/{contrato_id}", response_model=schemas.ErpContratoOut)
def actualizar_contrato_endpoint(
    contrato_id: int,
    payload: schemas.ErpContratoUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services_contrato.actualizar_contrato(db, user, contrato_id, payload)
    except services_contrato.ContratoSuministroActivoError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except services_contrato.ContratoValidacionError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/contratos/{contrato_id}", response_model=schemas.ErpContratoOut)
def desactivar_contrato_endpoint(
    contrato_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return services_contrato.desactivar_contrato(db, user, contrato_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
