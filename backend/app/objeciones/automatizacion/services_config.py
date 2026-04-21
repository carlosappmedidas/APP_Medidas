# app/objeciones/automatizacion/services_config.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false

"""
Servicio de configuración de la automatización de objeciones por tenant.

Funciones:
  - get_or_create_config:   devuelve la config del tenant (crea una si no existe).
  - patch_config:           actualiza campos como "activa".
  - marcar_ultimo_run:      llamado por el job al terminar su ejecución.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.objeciones.automatizacion.models import (
    ObjecionesAutomatizacion,
    TIPO_FIN_RECEPCION,
)


def get_or_create_config(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_FIN_RECEPCION,
) -> ObjecionesAutomatizacion:
    """
    Devuelve la config de automatización para (tenant_id, tipo).
    Si no existe, la crea con activa=0 (desactivada por defecto).
    """
    cfg = (
        db.query(ObjecionesAutomatizacion)
        .filter(
            ObjecionesAutomatizacion.tenant_id == tenant_id,
            ObjecionesAutomatizacion.tipo      == tipo,
        )
        .first()
    )
    if cfg is None:
        cfg = ObjecionesAutomatizacion(
            tenant_id = tenant_id,
            tipo      = tipo,
            activa    = 0,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def patch_config(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_FIN_RECEPCION,
    activa: Optional[bool] = None,
) -> ObjecionesAutomatizacion:
    """
    Actualiza campos de la config. Por ahora solo `activa`.
    """
    cfg = get_or_create_config(db, tenant_id=tenant_id, tipo=tipo)
    if activa is not None:
        cfg.activa = 1 if activa else 0   # type: ignore[assignment]
    db.commit()
    db.refresh(cfg)
    return cfg


def marcar_ultimo_run(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_FIN_RECEPCION,
    ok: bool,
    mensaje: str,
) -> ObjecionesAutomatizacion:
    """
    Llamado por el job al terminar. Actualiza:
      - ultimo_run_at  = ahora
      - ultimo_run_ok  = 1 si ok, 0 si no
      - ultimo_run_msg = mensaje
    """
    cfg = get_or_create_config(db, tenant_id=tenant_id, tipo=tipo)
    cfg.ultimo_run_at  = datetime.utcnow()   # type: ignore[assignment]
    cfg.ultimo_run_ok  = 1 if ok else 0       # type: ignore[assignment]
    cfg.ultimo_run_msg = mensaje              # type: ignore[assignment]
    db.commit()
    db.refresh(cfg)
    return cfg