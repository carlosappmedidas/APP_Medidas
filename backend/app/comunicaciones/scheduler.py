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
from apscheduler.triggers.cron import CronTrigger
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
                    descargados, errores, detalle = services.ejecutar_regla(db, rule_id=int(regla.id))  # type: ignore[arg-type]                    logger.info(f"[Scheduler] Regla id={regla.id} completada — {descargados} descargados, {errores} errores")
                except Exception as e:
                    logger.error(f"[Scheduler] Error en regla id={regla.id}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[Scheduler] Error general: {e}")

def _ejecutar_chequeo_fin_recepcion() -> None:
    """
    Job que corre cada día a las 23:00.
    Itera todos los tenants que tienen la automatización "fin_recepcion" activada
    y ejecuta el chequeo contra SFTP + calendario_ree.

    Si un tenant no tiene la automatización activa → el propio servicio
    lo detecta y no hace nada (salvo marcar ultimo_run).
    """
    try:
        from app.core.db import SessionLocal
        from app.objeciones.automatizacion.models import ObjecionesAutomatizacion, TIPO_FIN_RECEPCION
        from app.objeciones.automatizacion.services_job import ejecutar_chequeo_fin_recepcion_tenant

        db = SessionLocal()
        try:
            # Tenants con fila de automatización de tipo "fin_recepcion" y activa=1
            tenants_con_auto = (
                db.query(ObjecionesAutomatizacion.tenant_id)
                .filter(
                    ObjecionesAutomatizacion.tipo   == TIPO_FIN_RECEPCION,
                    ObjecionesAutomatizacion.activa == 1,
                )
                .all()
            )
            tenant_ids = sorted({int(row[0]) for row in tenants_con_auto})

            if not tenant_ids:
                logger.info("[obj_fin_recepcion_job] No hay tenants con la automatización activa. Nada que hacer.")
                return

            logger.info(f"[obj_fin_recepcion_job] Procesando {len(tenant_ids)} tenants: {tenant_ids}")

            for tid in tenant_ids:
                try:
                    resultado = ejecutar_chequeo_fin_recepcion_tenant(
                        db,
                        tenant_id    = tid,
                        current_user = None,   # usuario sintético
                        forzar       = False,  # respeta "activa"
                    )
                    logger.info(
                        f"[obj_fin_recepcion_job] tenant={tid}: "
                        f"ok={resultado.get('ok')} "
                        f"alertas={resultado.get('alertas_creadas')} "
                        f"hitos={resultado.get('hitos_procesados')}"
                    )
                except Exception as e:
                    logger.error(f"[obj_fin_recepcion_job] Error en tenant={tid}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[obj_fin_recepcion_job] Error general: {e}")


def _ejecutar_busqueda_respuestas_ree() -> None:
    """
    Job que corre cada día a las 07:00.
    Busca respuestas REE (.ok / .bad) en el SFTP para los REOB enviados
    que aún no tienen estado_ree, iterando todos los tenants que tengan
    algún REOB pendiente.
    """
    try:
        from app.core.db import SessionLocal
        from app.objeciones.models import ReobGenerado
        from app.objeciones.services_respuestas_ree import buscar_respuestas_tenant

        db = SessionLocal()
        try:
            # Tenants que tienen al menos 1 REOB enviado pendiente de respuesta.
            # Evita despertar SFTPs de tenants sin trabajo que hacer.
            tenant_ids_rows = (
                db.query(ReobGenerado.tenant_id)
                .filter(
                    ReobGenerado.enviado_sftp_at.isnot(None),
                    ReobGenerado.estado_ree.is_(None),
                )
                .distinct()
                .all()
            )
            tenant_ids = sorted({int(row[0]) for row in tenant_ids_rows})

            if not tenant_ids:
                logger.info("[obj_buscar_respuestas_ree] No hay REOBs pendientes. Nada que hacer.")
                return

            logger.info(f"[obj_buscar_respuestas_ree] Procesando {len(tenant_ids)} tenants: {tenant_ids}")

            for tid in tenant_ids:
                try:
                    resultado = buscar_respuestas_tenant(
                        db,
                        tenant_id    = tid,
                        current_user = None,   # usuario sintético: scope = tenant completo
                    )
                    logger.info(
                        f"[obj_buscar_respuestas_ree] tenant={tid}: "
                        f"procesados={resultado.get('procesados')} "
                        f"ok={resultado.get('encontrados_ok')} "
                        f"bad={resultado.get('encontrados_bad')} "
                        f"sin_resp={resultado.get('sin_respuesta')} "
                        f"errores_empresa={resultado.get('errores_empresa')}"
                    )
                except Exception as e:
                    logger.error(f"[obj_buscar_respuestas_ree] Error en tenant={tid}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[obj_buscar_respuestas_ree] Error general: {e}")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return
    _scheduler = BackgroundScheduler(timezone="Europe/Madrid")
    _scheduler.add_job(
        _ejecutar_reglas_pendientes,
        trigger=IntervalTrigger(minutes=1),
        id="ftp_sync_job",
        name="FTP Sync — comprueba reglas pendientes",
        replace_existing=True,
        max_instances=1,  # evita solapamientos
    )
    # Job diario para chequear hitos FIN RECEPCIÓN OBJECIONES del calendario REE.
    # Corre todos los días a las 23:00 UTC y genera alertas para los tenants
    # con la automatización activada.
    _scheduler.add_job(
        _ejecutar_chequeo_fin_recepcion,
        trigger=CronTrigger(hour=23, minute=0),
        id="obj_fin_recepcion_job",
        name="Objeciones — chequeo FIN RECEPCIÓN (23:00 diario)",
        replace_existing=True,
        max_instances=1,
    )
    # Job diario para buscar respuestas .ok / .bad de REE en el SFTP sobre los
    # REOB enviados. Corre todos los días a las 07:00 (Europe/Madrid).
    _scheduler.add_job(
        _ejecutar_busqueda_respuestas_ree,
        trigger=CronTrigger(hour=7, minute=0),
        id="obj_buscar_respuestas_ree_job",
        name="Objeciones — buscar respuestas REE (07:00 diario)",
        replace_existing=True,
        max_instances=1,
    )
    _scheduler.start()
    logger.info("[Scheduler] Scheduler arrancado — FTP cada minuto + Objeciones FIN RECEPCIÓN diario 23:00")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] FTP Scheduler detenido")
