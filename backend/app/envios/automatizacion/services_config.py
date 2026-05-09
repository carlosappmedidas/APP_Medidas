# app/envios/automatizacion/services_config.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Servicio de configuración de la automatización de búsqueda de respuestas REE.

Funciones públicas:
  - get_or_create_config:   devuelve la config del tenant (la crea si no existe).
  - patch_config:           actualiza el flag `activa`.
  - marcar_ultimo_run:      llamado por el job al terminar.
  - get_all_configs:        devuelve TODAS las configs en un dict por tipo.

Patrón clonado de app/measures/descarga/automatizacion/services_config.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.envios.automatizacion.models import (
    EnviosAutomatizacion,
    TIPO_BUSCAR_RESPUESTAS_ENVIOS,
)


# Default de `activa` al crear una fila nueva. Por ahora todos arrancan
# desactivados — el usuario debe activarlos explícitamente.
_DEFAULTS_ACTIVA: Dict[str, int] = {
    TIPO_BUSCAR_RESPUESTAS_ENVIOS: 0,
}


def get_or_create_config(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_BUSCAR_RESPUESTAS_ENVIOS,
) -> EnviosAutomatizacion:
    """
    Devuelve la config para (tenant_id, tipo).
    Si no existe la crea con `activa` por defecto según `_DEFAULTS_ACTIVA`.
    """
    default_activa = _DEFAULTS_ACTIVA.get(tipo, 0)

    cfg = (
        db.query(EnviosAutomatizacion)
        .filter(
            EnviosAutomatizacion.tenant_id == tenant_id,
            EnviosAutomatizacion.tipo      == tipo,
        )
        .first()
    )
    if cfg is None:
        cfg = EnviosAutomatizacion(
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
    tipo: str = TIPO_BUSCAR_RESPUESTAS_ENVIOS,
    activa: Optional[bool] = None,
) -> EnviosAutomatizacion:
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
    tipo: str = TIPO_BUSCAR_RESPUESTAS_ENVIOS,
    ok: bool,
    mensaje: str,
) -> EnviosAutomatizacion:
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
) -> Dict[str, EnviosAutomatizacion]:
    """Devuelve un dict {tipo: config} con TODAS las configs del tenant."""
    return {
        TIPO_BUSCAR_RESPUESTAS_ENVIOS: get_or_create_config(
            db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_RESPUESTAS_ENVIOS,
        ),
    }