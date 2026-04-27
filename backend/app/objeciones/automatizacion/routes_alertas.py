# app/objeciones/automatizacion/routes_alertas.py
# pyright: reportMissingImports=false, reportArgumentType=false, reportCallIssue=false

"""
Endpoints de gestión de alertas de objeciones.

  GET   /objeciones/alertas           (lista con filtros)
  GET   /objeciones/alertas/resumen   (resumen compacto para el banner)
  POST  /objeciones/alertas/{id}/descartar
  POST  /objeciones/alertas/{id}/resolver
"""

from __future__ import annotations

import json
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.permissions import assert_empresa_access, get_allowed_empresa_ids
from app.empresas.models import Empresa
from app.objeciones.automatizacion.models import ObjecionesAlerta
from app.objeciones.automatizacion.schemas import (
    AlertaRead,
    AlertasResumen,
)
from app.objeciones.automatizacion.services_alertas import (
    contar_alertas_activas,
    descartar_alerta,
    listar_alertas,
    resolver_alerta,
)


router = APIRouter(
    prefix="/objeciones/alertas",
    tags=["objeciones-alertas"],
)


def _tenant_id(user) -> int:
    tid = getattr(user, "tenant_id", None)
    if tid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario sin tenant.",
        )
    return int(tid)


def _user_id(user) -> Optional[int]:
    uid = getattr(user, "id", None)
    return int(uid) if uid is not None else None


def _mapa_empresas(db: Session, *, tenant_id: int) -> Dict[int, Empresa]:
    """Devuelve {empresa_id: Empresa} del tenant para enriquecer los resultados."""
    empresas = db.query(Empresa).filter(Empresa.tenant_id == tenant_id).all()
    return {int(getattr(e, "id")): e for e in empresas}


def _serializar_alerta(alerta, mapa_empresas: Dict[int, Empresa]) -> AlertaRead:
    # Parse del detalle_json si está presente.
    detalle = None
    raw = getattr(alerta, "detalle_json", None)
    if raw:
        try:
            detalle = json.loads(raw)
            if not isinstance(detalle, list):
                detalle = None
        except Exception:
            detalle = None

    # Enriquecer con empresa_nombre + codigo_ree.
    emp = mapa_empresas.get(int(getattr(alerta, "empresa_id")))
    empresa_nombre     = getattr(emp, "nombre", None) if emp else None
    empresa_codigo_ree = getattr(emp, "codigo_ree", None) if emp else None

    return AlertaRead(
        id                 = int(getattr(alerta, "id")),
        tenant_id          = int(getattr(alerta, "tenant_id")),
        empresa_id         = int(getattr(alerta, "empresa_id")),
        tipo               = str(getattr(alerta, "tipo")),
        periodo            = str(getattr(alerta, "periodo")),
        fecha_hito         = getattr(alerta, "fecha_hito", None),
        num_pendientes     = int(getattr(alerta, "num_pendientes", 0) or 0),
        severidad          = str(getattr(alerta, "severidad", "warning")),
        estado             = str(getattr(alerta, "estado", "activa")),
        detalle            = detalle,
        resuelta_at        = getattr(alerta, "resuelta_at", None),
        resuelta_by        = getattr(alerta, "resuelta_by", None),
        created_at         = getattr(alerta, "created_at", None),
        updated_at         = getattr(alerta, "updated_at", None),
        empresa_nombre     = empresa_nombre,
        empresa_codigo_ree = empresa_codigo_ree,
    )


# ── GET lista ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[AlertaRead])
def get_alertas(
    estado:     Optional[str] = Query(default=None, description="'activa' | 'resuelta' | 'descartada'"),
    empresa_id: Optional[int] = Query(default=None),
    periodo:    Optional[str] = Query(default=None, description="YYYYMM"),
    tipo:       Optional[str] = Query(default=None, description="'fin_recepcion' por ahora"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Lista alertas del tenant con filtros opcionales."""
    tid = _tenant_id(current_user)
    if empresa_id is not None:
        assert_empresa_access(db, current_user, empresa_id)
    alertas = listar_alertas(
        db,
        tenant_id           = tid,
        allowed_empresa_ids = get_allowed_empresa_ids(db, current_user),
        estado              = estado,
        empresa_id          = empresa_id,
        periodo             = periodo,
        tipo                = tipo,
    )
    mapa = _mapa_empresas(db, tenant_id=tid)
    return [_serializar_alerta(a, mapa) for a in alertas]


# ── GET resumen (para el banner del Dashboard) ────────────────────────────────

@router.get("/resumen", response_model=AlertasResumen)
def get_resumen(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Resumen compacto de las alertas activas del tenant."""
    resumen = contar_alertas_activas(
        db,
        tenant_id           = _tenant_id(current_user),
        allowed_empresa_ids = get_allowed_empresa_ids(db, current_user),
    )
    return AlertasResumen(**resumen)


# ── POST descartar ────────────────────────────────────────────────────────────

@router.post("/{alert_id}/descartar", response_model=AlertaRead)
def descartar_endpoint(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Marca una alerta como 'descartada'."""
    tid = _tenant_id(current_user)
    # Cargar la alerta primero para validar acceso a su empresa
    alerta_existente = (
        db.query(ObjecionesAlerta)
        .filter(
            ObjecionesAlerta.id        == alert_id,
            ObjecionesAlerta.tenant_id == tid,
        )
        .first()
    )
    if alerta_existente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alerta {alert_id} no encontrada.")
    assert_empresa_access(db, current_user, int(alerta_existente.empresa_id))
    try:
        alerta = descartar_alerta(
            db,
            alert_id  = alert_id,
            tenant_id = tid,
            user_id   = _user_id(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    mapa = _mapa_empresas(db, tenant_id=tid)
    return _serializar_alerta(alerta, mapa)


# ── POST resolver ─────────────────────────────────────────────────────────────

@router.post("/{alert_id}/resolver", response_model=AlertaRead)
def resolver_endpoint(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Marca una alerta como 'resuelta'."""
    tid = _tenant_id(current_user)
    # Cargar la alerta primero para validar acceso a su empresa
    alerta_existente = (
        db.query(ObjecionesAlerta)
        .filter(
            ObjecionesAlerta.id        == alert_id,
            ObjecionesAlerta.tenant_id == tid,
        )
        .first()
    )
    if alerta_existente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Alerta {alert_id} no encontrada.")
    assert_empresa_access(db, current_user, int(alerta_existente.empresa_id))
    try:
        alerta = resolver_alerta(
            db,
            alert_id  = alert_id,
            tenant_id = tid,
            user_id   = _user_id(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    mapa = _mapa_empresas(db, tenant_id=tid)
    return _serializar_alerta(alerta, mapa)