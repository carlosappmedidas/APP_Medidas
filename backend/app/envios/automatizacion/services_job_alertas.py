# app/envios/automatizacion/services_job_alertas.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Job que recalcula alertas de envíos para todos los tenants con la
automatización activa.

Este módulo es invocado por el scheduler (APScheduler en
app/comunicaciones/scheduler.py) y por el endpoint "Revisar ahora".

Función pública:
  - revisar_alertas_envios_all_tenants(SessionLocal): recorre tenants y ejecuta
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.envios.automatizacion.models import (
    EnviosAutomatizacion,
    TIPO_REVISAR_ALERTAS_ENVIOS,
)
from app.envios.automatizacion.services_alertas import (
    recalcular_alertas_envios_tenant,
)
from app.envios.automatizacion.services_config import marcar_ultimo_run


logger = logging.getLogger(__name__)


def _ejecutar_revisar_alertas_tenant(db: Session, *, tenant_id: int) -> dict[str, Any]:
    """Ejecuta el recálculo y registra el ultimo_run en la config."""
    try:
        resultado = recalcular_alertas_envios_tenant(db, tenant_id=tenant_id)
        mensaje = (
            f"{resultado['creadas']} creadas, "
            f"{resultado['actualizadas']} actualizadas, "
            f"{resultado['auto_resueltas']} auto-resueltas"
        )
        marcar_ultimo_run(
            db,
            tenant_id=tenant_id,
            tipo=TIPO_REVISAR_ALERTAS_ENVIOS,
            ok=True,
            mensaje=mensaje,
        )
        logger.info(
            "Alertas envios tenant=%s OK: %s",
            tenant_id, mensaje,
        )
        return resultado
    except Exception as e:  # pylint: disable=broad-except
        msg = str(e)[:200]
        marcar_ultimo_run(
            db,
            tenant_id=tenant_id,
            tipo=TIPO_REVISAR_ALERTAS_ENVIOS,
            ok=False,
            mensaje=msg,
        )
        logger.exception(
            "Alertas envios tenant=%s FAILED: %s",
            tenant_id, msg,
        )
        return {"error": msg}


def revisar_alertas_envios_all_tenants(SessionLocal) -> None:
    """
    Función llamada por el scheduler.

    Recorre TODOS los tenants que tengan la automatización
    `revisar_alertas_envios` ACTIVA y ejecuta el recálculo.
    """
    db: Session = SessionLocal()
    try:
        # Buscar configs activas para este tipo
        configs = (
            db.query(EnviosAutomatizacion)
            .filter(
                EnviosAutomatizacion.tipo == TIPO_REVISAR_ALERTAS_ENVIOS,
                EnviosAutomatizacion.activa == 1,
            )
            .all()
        )

        if not configs:
            logger.info("revisar_alertas_envios: sin tenants con la automatización activa.")
            return

        logger.info(
            "revisar_alertas_envios: ejecutando para %d tenants...",
            len(configs),
        )

        for cfg in configs:
            tenant_id = int(cfg.tenant_id)  # type: ignore[arg-type]
            _ejecutar_revisar_alertas_tenant(db, tenant_id=tenant_id)

    finally:
        db.close()