# app/envios/automatizacion/routes_alertas.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Endpoints REST de alertas de envíos.

Endpoints:
  GET    /envios/alertas                          → listar alertas (filtros)
  GET    /envios/alertas/contador                 → contador para campanita
  POST   /envios/alertas/recalcular               → recalcular manualmente
  PATCH  /envios/alertas/{alert_id}/resolver      → marcar resuelta
  PATCH  /envios/alertas/{alert_id}/descartar     → marcar descartada
"""

from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.datetime_utils import ahora_madrid
from app.core.db import get_db
from app.empresas.models import Empresa
from app.envios.automatizacion.models import (
    ESTADO_ACTIVA,
    ESTADO_DESCARTADA,
    ESTADO_RESUELTA,
    EnvioAlerta,
)
from app.envios.automatizacion.schemas import (
    EnvioAlertaAccionResp,
    EnvioAlertaRead,
    RecalcularAlertasResp,
)
from app.envios.automatizacion.services_alertas import (
    recalcular_alertas_envios_tenant,
)


router = APIRouter(
    prefix="/envios/alertas",
    tags=["envios-alertas"],
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _tenant_id(user) -> int:
    tid = getattr(user, "tenant_id", None)
    if tid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario sin tenant.",
        )
    return int(tid)


def _user_id(user) -> int:
    uid = getattr(user, "id", None)
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario sin id.",
        )
    return int(uid)


def _serializar_alerta(alerta: EnvioAlerta, empresa: Empresa | None) -> EnvioAlertaRead:
    """Convierte un EnvioAlerta a su schema, añadiendo datos de empresa."""
    detalle: Any = None
    raw = getattr(alerta, "detalle_json", None)
    if raw:
        try:
            detalle = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            detalle = None

    return EnvioAlertaRead(
        id                 = int(alerta.id),  # type: ignore[arg-type]
        tenant_id          = int(alerta.tenant_id),  # type: ignore[arg-type]
        empresa_id         = int(alerta.empresa_id),  # type: ignore[arg-type]
        empresa_nombre     = (empresa.nombre if empresa is not None else None),  # type: ignore[arg-type]
        empresa_codigo_ree = (getattr(empresa, "codigo_ree", None) if empresa is not None else None),
        tipo               = getattr(alerta, "tipo"),
        m_clas             = getattr(alerta, "m_clas"),
        periodo            = getattr(alerta, "periodo"),
        plazo_fecha        = getattr(alerta, "plazo_fecha", None),
        num_pendientes     = int(getattr(alerta, "num_pendientes", 0) or 0),
        detalle            = detalle,
        severidad          = getattr(alerta, "severidad"),
        estado             = getattr(alerta, "estado"),
        resuelta_at        = getattr(alerta, "resuelta_at", None),
        resuelta_by        = getattr(alerta, "resuelta_by", None),
        created_at         = getattr(alerta, "created_at"),
        updated_at         = getattr(alerta, "updated_at"),
    )


# ─── GET listar ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[EnvioAlertaRead])
def listar_alertas(
    estado: Optional[str] = Query(None, description="activa | resuelta | descartada"),
    tipo: Optional[str]   = Query(None, description="plazo_proximo | plazo_vencido_bad | ..."),
    m_clas: Optional[str] = Query(None, description="M1 | M2 | M7"),
    empresa_id: Optional[int] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Lista alertas del tenant, ordenadas por: severidad (critical primero) →
    activa primero → fecha más reciente.
    """
    tid = _tenant_id(current_user)

    q = db.query(EnvioAlerta).filter(EnvioAlerta.tenant_id == tid)
    if estado:
        q = q.filter(EnvioAlerta.estado == estado)
    if tipo:
        q = q.filter(EnvioAlerta.tipo == tipo)
    if m_clas:
        q = q.filter(EnvioAlerta.m_clas == m_clas)
    if empresa_id is not None:
        q = q.filter(EnvioAlerta.empresa_id == empresa_id)

    alertas = q.order_by(
        EnvioAlerta.estado.asc(),       # activa < descartada < resuelta alfabéticamente — afortunado
        EnvioAlerta.severidad.desc(),   # critical > warning > info alfabéticamente desc
        EnvioAlerta.created_at.desc(),
    ).limit(limit).all()

    if not alertas:
        return []

    # Cargar empresas en bloque
    empresa_ids = {int(a.empresa_id) for a in alertas}  # type: ignore[arg-type]
    empresas_dict: dict[int, Empresa] = {
        int(e.id): e  # type: ignore[arg-type]
        for e in db.query(Empresa).filter(Empresa.id.in_(empresa_ids)).all()
    }

    return [
        _serializar_alerta(a, empresas_dict.get(int(a.empresa_id)))  # type: ignore[arg-type]
        for a in alertas
    ]


# ─── GET contador (campanita 🔔) ─────────────────────────────────────────────

@router.get("/contador")
def contador_alertas(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Devuelve solo el conteo de alertas ACTIVAS por severidad.
    Ligero — pensado para la campanita global.
    """
    tid = _tenant_id(current_user)

    base = db.query(EnvioAlerta).filter(
        EnvioAlerta.tenant_id == tid,
        EnvioAlerta.estado == ESTADO_ACTIVA,
    )
    total = base.count()
    critical = base.filter(EnvioAlerta.severidad == "critical").count()
    warning  = base.filter(EnvioAlerta.severidad == "warning").count()
    info     = base.filter(EnvioAlerta.severidad == "info").count()

    return {
        "total": total,
        "critical": critical,
        "warning": warning,
        "info": info,
    }


# ─── POST recalcular ────────────────────────────────────────────────────────

@router.post("/recalcular", response_model=RecalcularAlertasResp)
def recalcular_alertas(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Recalcula manualmente las alertas de plazos (1, 2 y 3) del tenant.
    Útil para forzar refresh desde el frontend sin esperar al cron.

    NO regenera alertas tipo respuesta_ree (las gestiona el job de respuestas).
    """
    tid = _tenant_id(current_user)
    resultado = recalcular_alertas_envios_tenant(db, tenant_id=tid)
    return RecalcularAlertasResp(**resultado)


# ─── PATCH resolver ─────────────────────────────────────────────────────────

@router.patch("/{alert_id}/resolver", response_model=EnvioAlertaAccionResp)
def resolver_alerta(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Marca una alerta como resuelta (manual)."""
    tid = _tenant_id(current_user)
    uid = _user_id(current_user)

    alerta = db.query(EnvioAlerta).filter(
        EnvioAlerta.id == alert_id,
        EnvioAlerta.tenant_id == tid,
    ).first()
    if alerta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alerta {alert_id} no encontrada.",
        )

    alerta.estado      = ESTADO_RESUELTA  # type: ignore[assignment]
    alerta.resuelta_at = ahora_madrid()  # type: ignore[assignment]
    alerta.resuelta_by = uid  # type: ignore[assignment]
    db.commit()
    db.refresh(alerta)

    return EnvioAlertaAccionResp(
        id=int(alerta.id),  # type: ignore[arg-type]
        estado=ESTADO_RESUELTA,  # type: ignore[arg-type]
        resuelta_at=getattr(alerta, "resuelta_at"),
        resuelta_by=getattr(alerta, "resuelta_by"),
    )


# ─── PATCH descartar ────────────────────────────────────────────────────────

@router.patch("/{alert_id}/descartar", response_model=EnvioAlertaAccionResp)
def descartar_alerta(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Marca una alerta como descartada (no se reactivará en futuros recalcs)."""
    tid = _tenant_id(current_user)
    uid = _user_id(current_user)

    alerta = db.query(EnvioAlerta).filter(
        EnvioAlerta.id == alert_id,
        EnvioAlerta.tenant_id == tid,
    ).first()
    if alerta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alerta {alert_id} no encontrada.",
        )

    alerta.estado      = ESTADO_DESCARTADA  # type: ignore[assignment]
    alerta.resuelta_at = ahora_madrid()  # type: ignore[assignment]
    alerta.resuelta_by = uid  # type: ignore[assignment]
    db.commit()
    db.refresh(alerta)

    return EnvioAlertaAccionResp(
        id=int(alerta.id),  # type: ignore[arg-type]
        estado=ESTADO_DESCARTADA,  # type: ignore[arg-type]
        resuelta_at=getattr(alerta, "resuelta_at"),
        resuelta_by=getattr(alerta, "resuelta_by"),
    )