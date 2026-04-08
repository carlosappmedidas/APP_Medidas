# app/comunicaciones/scheduler.py
# pyright: reportMissingImports=false
"""
Scheduler de sincronización FTP automática.
Se integra con FastAPI via lifespan — arranca con la app y para con ella.
Comprueba cada minuto qué reglas tienen proxima_ejecucion <= ahora y las ejecuta.
"""

from __future__ import annotations

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _ejecutar_reglas_pendientes() -> None:
    """Job que corre cada minuto y ejecuta las reglas cuya proxima_ejecucion ya pasó."""
    try:
        from app.core.db import SessionLocal
        from app.comunicaciones.models import FtpSyncRule
        from app.comunicaciones import services

        db = SessionLocal()
        try:
            ahora = datetime.utcnow()
            reglas = (
                db.query(FtpSyncRule)
                .filter(
                    FtpSyncRule.activo.is_(True),
                    FtpSyncRule.proxima_ejecucion <= ahora,
                )
                .all()
            )
            for regla in reglas:
                try:
                    logger.info(f"[Scheduler] Ejecutando regla id={regla.id} — {regla.nombre or regla.directorio}")
                    descargados, errores, detalle = services.ejecutar_regla(db, rule_id=int(regla.id))
                    logger.info(f"[Scheduler] Regla id={regla.id} completada — {descargados} descargados, {errores} errores")
                except Exception as e:
                    logger.error(f"[Scheduler] Error en regla id={regla.id}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[Scheduler] Error general: {e}")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _ejecutar_reglas_pendientes,
        trigger=IntervalTrigger(minutes=1),
        id="ftp_sync_job",
        name="FTP Sync — comprueba reglas pendientes",
        replace_existing=True,
        max_instances=1,  # evita solapamientos
    )
    _scheduler.start()
    logger.info("[Scheduler] FTP Scheduler arrancado — comprueba reglas cada minuto")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] FTP Scheduler detenido")
