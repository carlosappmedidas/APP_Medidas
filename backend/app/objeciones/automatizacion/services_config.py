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


# Valor por defecto de `activa` cuando creamos una fila nueva por primera vez.
# buscar_respuestas_ree arranca activa (ya estaba funcionando en prod antes de
# exponerlo en la UI de Configuración). Los demás arrancan desactivados —
# requieren opt-in explícito del usuario.
_ACTIVA_POR_DEFECTO: dict = {
    TIPO_FIN_RECEPCION:         0,
    # Los valores de los tipos adicionales se importan dinámicamente más abajo
    # para evitar un ciclo de import con models.py al momento de la definición.
}


def get_or_create_config(
    db: Session,
    *,
    tenant_id: int,
    tipo: str = TIPO_FIN_RECEPCION,
) -> ObjecionesAutomatizacion:
    """
    Devuelve la config de automatización para (tenant_id, tipo).
    Si no existe, la crea con un valor de `activa` por defecto que depende
    del tipo (ver `_ACTIVA_POR_DEFECTO`). En general:
      - fin_recepcion / fin_resolucion: activa=0 (opt-in del usuario).
      - buscar_respuestas_ree:          activa=1 (ya funcionaba así en prod).
    """
    # Resolver el default por tipo. Se resuelve aquí (no en la constante global)
    # para usar los valores actuales de TIPO_* sin riesgo de imports parciales.
    from app.objeciones.automatizacion.models import (
        TIPO_FIN_RESOLUCION,
        TIPO_BUSCAR_RESPUESTAS_REE,
    )
    defaults = {
        TIPO_FIN_RECEPCION:         0,
        TIPO_FIN_RESOLUCION:        0,
        TIPO_BUSCAR_RESPUESTAS_REE: 1,
    }
    default_activa = defaults.get(tipo, 0)

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


def get_all_configs(
    db: Session,
    *,
    tenant_id: int,
) -> dict:
    """
    Devuelve las 3 configuraciones de automatización del tenant en un dict
    con las 3 claves: 'fin_recepcion', 'fin_resolucion', 'buscar_respuestas_ree'.

    Si alguna no existe en BD, se crea on-the-fly con sus defaults
    (ver `get_or_create_config`).

    Pensado para el endpoint GET /objeciones/automatizacion/config que ahora
    devuelve las 3 configs de golpe.
    """
    from app.objeciones.automatizacion.models import (
        TIPO_FIN_RESOLUCION,
        TIPO_BUSCAR_RESPUESTAS_REE,
    )
    return {
        "fin_recepcion":         get_or_create_config(db, tenant_id=tenant_id, tipo=TIPO_FIN_RECEPCION),
        "fin_resolucion":        get_or_create_config(db, tenant_id=tenant_id, tipo=TIPO_FIN_RESOLUCION),
        "buscar_respuestas_ree": get_or_create_config(db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_RESPUESTAS_REE),
    }