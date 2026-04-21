# app/objeciones/automatizacion/routes_config.py
# pyright: reportMissingImports=false

"""
Endpoints de configuración de la automatización de objeciones.

  GET   /objeciones/automatizacion/config
  PATCH /objeciones/automatizacion/config
  POST  /objeciones/automatizacion/revisar-ahora
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.objeciones.automatizacion.models import TIPO_FIN_RECEPCION
from app.objeciones.automatizacion.schemas import (
    AutomatizacionConfigPatch,
    AutomatizacionConfigRead,
    RevisarAhoraResponse,
)
from app.objeciones.automatizacion.services_config import (
    get_or_create_config,
    patch_config,
)
from app.objeciones.automatizacion.services_job import (
    ejecutar_chequeo_fin_recepcion_tenant,
)


router = APIRouter(
    prefix="/objeciones/automatizacion",
    tags=["objeciones-automatizacion"],
)


def _tenant_id(user) -> int:
    tid = getattr(user, "tenant_id", None)
    if tid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario sin tenant.",
        )
    return int(tid)


def _serializar_config(cfg) -> AutomatizacionConfigRead:
    """Convierte el modelo a schema, aplicando la conversión 0/1 → bool."""
    return AutomatizacionConfigRead(
        tenant_id      = int(getattr(cfg, "tenant_id")),
        tipo           = str(getattr(cfg, "tipo")),
        activa         = bool(int(getattr(cfg, "activa", 0) or 0)),
        ultimo_run_at  = getattr(cfg, "ultimo_run_at", None),
        ultimo_run_ok  = bool(int(getattr(cfg, "ultimo_run_ok"))) if getattr(cfg, "ultimo_run_ok", None) is not None else None,
        ultimo_run_msg = getattr(cfg, "ultimo_run_msg", None),
    )


# ── GET config ────────────────────────────────────────────────────────────────

@router.get("/config", response_model=AutomatizacionConfigRead)
def get_config(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Devuelve la configuración de la automatización FIN_RECEPCION del tenant."""
    cfg = get_or_create_config(
        db,
        tenant_id = _tenant_id(current_user),
        tipo      = TIPO_FIN_RECEPCION,
    )
    return _serializar_config(cfg)


# ── PATCH config ──────────────────────────────────────────────────────────────

@router.patch("/config", response_model=AutomatizacionConfigRead)
def patch_config_endpoint(
    payload: AutomatizacionConfigPatch,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Actualiza la configuración. Por ahora solo se puede cambiar `activa`.
    """
    cfg = patch_config(
        db,
        tenant_id = _tenant_id(current_user),
        tipo      = TIPO_FIN_RECEPCION,
        activa    = payload.activa,
    )
    return _serializar_config(cfg)


# ── POST revisar-ahora ────────────────────────────────────────────────────────

@router.post("/revisar-ahora", response_model=RevisarAhoraResponse)
def revisar_ahora_endpoint(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Ejecuta el chequeo FIN_RECEPCION en este momento.
    Salta la comprobación de "activa" — el usuario lo está forzando
    explícitamente desde la UI de Configuración.
    """
    resultado = ejecutar_chequeo_fin_recepcion_tenant(
        db,
        tenant_id    = _tenant_id(current_user),
        current_user = current_user,
        forzar       = True,
    )
    return RevisarAhoraResponse(
        ok               = bool(resultado.get("ok", False)),
        mensaje          = str(resultado.get("mensaje", "")),
        alertas_creadas  = int(resultado.get("alertas_creadas", 0)),
        hitos_procesados = int(resultado.get("hitos_procesados", 0)),
    )