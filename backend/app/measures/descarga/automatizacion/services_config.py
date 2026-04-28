# app/measures/descarga/automatizacion/services_config.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false

"""
Servicio de configuración de la automatización de publicaciones por tenant.

Funciones públicas:
  - get_or_create_config:   devuelve la config del tenant (la crea si no existe).
  - patch_config:           actualiza el flag `activa`.
  - marcar_ultimo_run:      llamado por el job al terminar.
  - get_all_configs:        devuelve TODAS las configs en un dict por tipo.

Patrón clonado de app/objeciones/automatizacion/services_config.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.measures.descarga.automatizacion.models import (
    PublicacionesAutomatizacion,
    TIPO_BUSCAR_PUBLICACIONES_REE,
)


# Default de `activa` al crear una fila nueva. Por ahora, todos los tipos
# arrancan desactivados — el usuario debe activarlos explícitamente desde la
# pantalla de Configuración (opt-in).
_DEFAULTS_ACTIVA = {
    TIPO_BUSCAR_PUBLICACIONES_REE: 0,
}


def get_or_create_config(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_BUSCAR_PUBLICACIONES_REE,
) -> PublicacionesAutomatizacion:
    """
    Devuelve la config para (tenant_id, tipo).
    Si no existe la crea con `activa` por defecto según `_DEFAULTS_ACTIVA`.
    """
    default_activa = _DEFAULTS_ACTIVA.get(tipo, 0)

    cfg = (
        db.query(PublicacionesAutomatizacion)
        .filter(
            PublicacionesAutomatizacion.tenant_id == tenant_id,
            PublicacionesAutomatizacion.tipo      == tipo,
        )
        .first()
    )
    if cfg is None:
        cfg = PublicacionesAutomatizacion(
            tenant_id = tenant_id,
            tipo      = tipo,
            activa    = default_activa,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def patch_config(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_BUSCAR_PUBLICACIONES_REE,
    activa: Optional[bool] = None,
) -> PublicacionesAutomatizacion:
    """Actualiza `activa` (otros campos se podrían añadir aquí en el futuro)."""
    cfg = get_or_create_config(db, tenant_id=tenant_id, tipo=tipo)
    if activa is not None:
        cfg.activa = 1 if activa else 0  # type: ignore[assignment]
    db.commit()
    db.refresh(cfg)
    return cfg


def marcar_ultimo_run(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_BUSCAR_PUBLICACIONES_REE,
    ok: bool,
    mensaje: str,
) -> PublicacionesAutomatizacion:
    """Llamado por el job al terminar — actualiza ultimo_run_*."""
    cfg = get_or_create_config(db, tenant_id=tenant_id, tipo=tipo)
    cfg.ultimo_run_at  = datetime.utcnow()  # type: ignore[assignment]
    cfg.ultimo_run_ok  = 1 if ok else 0     # type: ignore[assignment]
    cfg.ultimo_run_msg = mensaje            # type: ignore[assignment]
    db.commit()
    db.refresh(cfg)
    return cfg


def get_all_configs(
    db: Session,
    *,
    tenant_id: int,
) -> dict:
    """
    Devuelve TODAS las configs del tenant en un dict — pensado para el endpoint
    GET /measures/descarga/automatizacion/config.

    Si alguna no existe, se crea on-the-fly con sus defaults.
    """
    return {
        "buscar_publicaciones_ree": get_or_create_config(
            db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_PUBLICACIONES_REE,
        ),
    }