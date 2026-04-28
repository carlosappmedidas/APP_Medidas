# app/comunicaciones/scheduler.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false
"""
Scheduler de sincronización FTP automática.
Se integra con FastAPI via lifespan — arranca con la app y para con ella.
Comprueba cada minuto qué reglas tienen proxima_ejecucion <= ahora y las ejecuta.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

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


def _ejecutar_chequeo_fin_resolucion() -> None:
    """
    Job que corre cada día a las 23:30.
    Itera todos los tenants que tienen la automatización "fin_resolucion" activada
    y ejecuta el chequeo contra calendario_ree + BD de objeciones.

    A diferencia de FIN_RECEPCION:
      - No toca el SFTP (mira objeciones locales con aceptacion IS NULL).
      - La ventana es hacia ADELANTE (3 próximos días) — avisa ANTES del hito.
    """
    try:
        from app.core.db import SessionLocal
        from app.objeciones.automatizacion.models import ObjecionesAutomatizacion, TIPO_FIN_RESOLUCION
        from app.objeciones.automatizacion.services_job_resolucion import ejecutar_chequeo_fin_resolucion_tenant

        db = SessionLocal()
        try:
            tenants_con_auto = (
                db.query(ObjecionesAutomatizacion.tenant_id)
                .filter(
                    ObjecionesAutomatizacion.tipo   == TIPO_FIN_RESOLUCION,
                    ObjecionesAutomatizacion.activa == 1,
                )
                .all()
            )
            tenant_ids = sorted({int(row[0]) for row in tenants_con_auto})

            if not tenant_ids:
                logger.info("[obj_fin_resolucion_job] No hay tenants con la automatización activa. Nada que hacer.")
                return

            logger.info(f"[obj_fin_resolucion_job] Procesando {len(tenant_ids)} tenants: {tenant_ids}")

            for tid in tenant_ids:
                try:
                    resultado = ejecutar_chequeo_fin_resolucion_tenant(
                        db,
                        tenant_id    = tid,
                        current_user = None,
                        forzar       = False,
                    )
                    logger.info(
                        f"[obj_fin_resolucion_job] tenant={tid}: "
                        f"ok={resultado.get('ok')} "
                        f"alertas={resultado.get('alertas_creadas')} "
                        f"hitos={resultado.get('hitos_procesados')}"
                    )
                except Exception as e:
                    logger.error(f"[obj_fin_resolucion_job] Error en tenant={tid}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[obj_fin_resolucion_job] Error general: {e}")


def _ejecutar_busqueda_respuestas_ree() -> None:
    """
    Job que corre cada día a las 07:00.
    Busca respuestas REE (.ok / .bad) en el SFTP para los REOB enviados
    que aún no tienen estado_ree, iterando todos los tenants que tengan
    algún REOB pendiente.

    Además: registra el ultimo_run_at/ok/msg por tenant en la tabla
    objeciones_automatizaciones con tipo='buscar_respuestas_ree', para que
    la UI de Configuración pueda mostrar cuándo corrió por última vez.
    """
    try:
        from app.core.db import SessionLocal
        from app.objeciones.models import ReobGenerado
        from app.objeciones.services_respuestas_ree import buscar_respuestas_tenant
        from app.objeciones.automatizacion.models import TIPO_BUSCAR_RESPUESTAS_REE
        from app.objeciones.automatizacion.services_config import marcar_ultimo_run

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
                    # Resumen legible para la UI de Configuración.
                    ok_n      = int(resultado.get("encontrados_ok", 0) or 0)
                    bad_n     = int(resultado.get("encontrados_bad", 0) or 0)
                    sin_n     = int(resultado.get("sin_respuesta", 0) or 0)
                    err_n     = int(resultado.get("errores_empresa", 0) or 0)
                    proc_n    = int(resultado.get("procesados", 0) or 0)
                    mensaje = (
                        f"{proc_n} REOB revisados · {ok_n} OK · {bad_n} BAD · "
                        f"{sin_n} sin respuesta · {err_n} errores empresa."
                    )
                    marcar_ultimo_run(
                        db,
                        tenant_id = tid,
                        tipo      = TIPO_BUSCAR_RESPUESTAS_REE,
                        ok        = (err_n == 0),
                        mensaje   = mensaje,
                    )
                    logger.info(
                        f"[obj_buscar_respuestas_ree] tenant={tid}: "
                        f"procesados={proc_n} ok={ok_n} bad={bad_n} "
                        f"sin_resp={sin_n} errores_empresa={err_n}"
                    )
                except Exception as e:
                    logger.error(f"[obj_buscar_respuestas_ree] Error en tenant={tid}: {e}")
                    # Registrar también en config para que la UI vea el fallo.
                    try:
                        marcar_ultimo_run(
                            db,
                            tenant_id = tid,
                            tipo      = TIPO_BUSCAR_RESPUESTAS_REE,
                            ok        = False,
                            mensaje   = f"Error: {str(e)[:200]}",
                        )
                    except Exception:
                        pass
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[obj_buscar_respuestas_ree] Error general: {e}")


def _ejecutar_buscar_publicaciones_ree() -> None:
    """
    Job que corre cada día a las 22:00 (Europe/Madrid).
    Itera todos los tenants que tienen la automatización 'buscar_publicaciones_ree'
    activada y dispara el chequeo: mira el calendario REE para detectar hitos
    de publicación (M2/M7/M11/ART15) en los próximos 3 días, busca BALDs nuevos
    en SFTP, y crea alertas (NO descarga ni importa).

    Si un tenant no tiene la automatización activa → el propio servicio
    lo detecta y no hace nada.
    """
    try:
        from app.core.db import SessionLocal
        from app.measures.descarga.automatizacion.models import (
            PublicacionesAutomatizacion,
            TIPO_BUSCAR_PUBLICACIONES_REE,
        )
        from app.measures.descarga.automatizacion.services_job import (
            ejecutar_chequeo_publicaciones_tenant,
        )

        db = SessionLocal()
        try:
            tenants_con_auto = (
                db.query(PublicacionesAutomatizacion.tenant_id)
                .filter(
                    PublicacionesAutomatizacion.tipo   == TIPO_BUSCAR_PUBLICACIONES_REE,
                    PublicacionesAutomatizacion.activa == 1,
                )
                .all()
            )
            tenant_ids = sorted({int(row[0]) for row in tenants_con_auto})

            if not tenant_ids:
                logger.info("[pub_buscar_publicaciones_ree_job] No hay tenants con la automatización activa. Nada que hacer.")
                return

            logger.info(f"[pub_buscar_publicaciones_ree_job] Procesando {len(tenant_ids)} tenants: {tenant_ids}")

            for tid in tenant_ids:
                try:
                    resultado = ejecutar_chequeo_publicaciones_tenant(
                        db,
                        tenant_id    = tid,
                        current_user = None,
                        forzar       = False,
                    )
                    logger.info(
                        f"[pub_buscar_publicaciones_ree_job] tenant={tid}: "
                        f"ok={resultado.get('ok')} "
                        f"alertas={resultado.get('alertas_creadas')} "
                        f"hitos={resultado.get('hitos_procesados')}"
                    )
                except Exception as e:
                    logger.error(f"[pub_buscar_publicaciones_ree_job] Error en tenant={tid}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[pub_buscar_publicaciones_ree_job] Error general: {e}")


def _catchup_jobs_perdidos() -> None:
    """
    Recupera ejecuciones perdidas de los jobs de objeciones tras un reinicio
    de uvicorn. Cubre:
      - fin_recepcion  (cron 23:00)
      - fin_resolucion (cron 23:30)

    Problema que resuelve:
      APScheduler in-memory arranca "en blanco" tras cada reinicio. Si uvicorn
      estaba parado a la hora programada del cron, ese día NO se ejecuta el
      job — misfire_grace_time solo sirve si el scheduler ya tenía el trigger
      registrado y lo perdió por lag, no tras un reinicio completo.

    Estrategia (idéntica para ambos jobs):
      - Al arrancar, iterar tenants con la automatización activa.
      - Si (a) su ultimo_run_at fue hace > 20 horas (o nunca corrió) Y
           (b) ya pasó la hora programada del cron para hoy,
        entonces disparar el job ahora mismo para ese tenant.
      - El marcaje de ultimo_run_at evita ejecuciones duplicadas si uvicorn
        se reinicia varias veces el mismo día (el umbral de 20h lo cubre).

    Se ejecuta UNA sola vez al arrancar el scheduler (en start_scheduler).
    """
    try:
        from zoneinfo import ZoneInfo
        from app.core.db import SessionLocal
        from app.objeciones.automatizacion.models import (
            ObjecionesAutomatizacion,
            TIPO_FIN_RECEPCION,
            TIPO_FIN_RESOLUCION,
        )
        from app.objeciones.automatizacion.services_job import ejecutar_chequeo_fin_recepcion_tenant
        from app.objeciones.automatizacion.services_job_resolucion import ejecutar_chequeo_fin_resolucion_tenant

        madrid = ZoneInfo("Europe/Madrid")
        ahora_madrid = datetime.now(madrid)

        db = SessionLocal()
        try:
            # Definición de los jobs que soportan catch-up.
            # Cada entrada: (tipo, hora_cron_madrid, función, etiqueta_log)
            jobs_catchup = [
                (TIPO_FIN_RECEPCION,  23, ejecutar_chequeo_fin_recepcion_tenant,  "fin_recepcion"),
                (TIPO_FIN_RESOLUCION, 23, ejecutar_chequeo_fin_resolucion_tenant, "fin_resolucion"),
                # Nota: fin_resolucion corre a las 23:30, pero a efectos de catch-up
                # usamos 23 como umbral (si ya son las 23:00+ y el run fue hace >20h,
                # asumimos que toca ejecutar). Los 30 minutos de diferencia respecto
                # al cron real son inofensivos — el próximo reinicio lo cogerá.
            ]

            # Catch-up de publicaciones (cron 22:00). Importes diferidos para
            # no acoplar el scheduler a otro módulo si no hace falta cargarlo.
            # Calculamos `umbral_pub` localmente (igual que el bucle de
            # objeciones más abajo). Si el último run fue hace > 20h o nunca,
            # se considera ejecución perdida y se recupera.
            try:
                from app.measures.descarga.automatizacion.models import (
                    PublicacionesAutomatizacion,
                    TIPO_BUSCAR_PUBLICACIONES_REE,
                )
                from app.measures.descarga.automatizacion.services_job import (
                    ejecutar_chequeo_publicaciones_tenant,
                )

                umbral_pub = datetime.utcnow() - timedelta(hours=20)

                if ahora_madrid.hour < 22:
                    logger.info(
                        f"[Scheduler catchup] buscar_publicaciones_ree: hora actual {ahora_madrid:%H:%M} < "
                        f"22:00 Madrid — el cron correrá a su hora."
                    )
                else:
                    configs_pub = (
                        db.query(PublicacionesAutomatizacion)
                        .filter(
                            PublicacionesAutomatizacion.tipo   == TIPO_BUSCAR_PUBLICACIONES_REE,
                            PublicacionesAutomatizacion.activa == 1,
                        )
                        .all()
                    )
                    if not configs_pub:
                        logger.info("[Scheduler catchup] buscar_publicaciones_ree: no hay tenants con la automatización activa.")
                    for cfg in configs_pub:
                        tid = int(cfg.tenant_id)
                        ultimo = cfg.ultimo_run_at
                        necesita_catchup = (ultimo is None) or (ultimo < umbral_pub)
                        if not necesita_catchup:
                            logger.info(
                                f"[Scheduler catchup] buscar_publicaciones_ree tenant={tid}: último run {ultimo} OK, no hace falta recuperar."
                            )
                            continue
                        logger.warning(
                            f"[Scheduler catchup] buscar_publicaciones_ree tenant={tid}: ejecución perdida detectada "
                            f"(último run: {ultimo}). Disparando recuperación..."
                        )
                        try:
                            resultado = ejecutar_chequeo_publicaciones_tenant(
                                db,
                                tenant_id    = tid,
                                current_user = None,
                                forzar       = False,
                            )
                            logger.info(
                                f"[Scheduler catchup] buscar_publicaciones_ree tenant={tid}: recuperado — "
                                f"ok={resultado.get('ok')} alertas={resultado.get('alertas_creadas')}"
                            )
                        except Exception as e:
                            logger.error(f"[Scheduler catchup] Error recuperando buscar_publicaciones_ree tenant={tid}: {e}")
            except Exception as e:
                logger.error(f"[Scheduler catchup] Error general en bloque publicaciones: {e}")

            umbral = datetime.utcnow() - timedelta(hours=20)

            for tipo, hora_min, fn, etiqueta in jobs_catchup:
                # Si aún no toca la hora programada de hoy, saltar este job.
                if ahora_madrid.hour < hora_min:
                    logger.info(
                        f"[Scheduler catchup] {etiqueta}: hora actual {ahora_madrid:%H:%M} < "
                        f"{hora_min:02d}:00 Madrid — el cron correrá a su hora."
                    )
                    continue

                configs = (
                    db.query(ObjecionesAutomatizacion)
                    .filter(
                        ObjecionesAutomatizacion.tipo   == tipo,
                        ObjecionesAutomatizacion.activa == 1,
                    )
                    .all()
                )

                if not configs:
                    logger.info(f"[Scheduler catchup] {etiqueta}: no hay tenants con la automatización activa.")
                    continue

                for cfg in configs:
                    tid = int(cfg.tenant_id)
                    ultimo = cfg.ultimo_run_at
                    necesita_catchup = (ultimo is None) or (ultimo < umbral)

                    if not necesita_catchup:
                        logger.info(
                            f"[Scheduler catchup] {etiqueta} tenant={tid}: último run {ultimo} OK, no hace falta recuperar."
                        )
                        continue

                    logger.warning(
                        f"[Scheduler catchup] {etiqueta} tenant={tid}: ejecución perdida detectada "
                        f"(último run: {ultimo}). Disparando recuperación..."
                    )
                    try:
                        resultado = fn(
                            db,
                            tenant_id    = tid,
                            current_user = None,
                            forzar       = False,
                        )
                        logger.info(
                            f"[Scheduler catchup] {etiqueta} tenant={tid}: recuperado — "
                            f"ok={resultado.get('ok')} alertas={resultado.get('alertas_creadas')}"
                        )
                    except Exception as e:
                        logger.error(f"[Scheduler catchup] Error recuperando {etiqueta} tenant={tid}: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[Scheduler catchup] Error general: {e}")


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
    # Corre todos los días a las 23:00 (Europe/Madrid) y genera alertas para los
    # tenants con la automatización activada.
    # misfire_grace_time=21600 → si uvicorn estaba apagado a las 23:00, tiene
    # hasta 6 horas de gracia para recuperarse al arrancar y ejecutar el job.
    # coalesce=True → si se perdieron varios triggers, solo ejecuta 1 (no en bucle).
    _scheduler.add_job(
        _ejecutar_chequeo_fin_recepcion,
        trigger=CronTrigger(hour=23, minute=0),
        id="obj_fin_recepcion_job",
        name="Objeciones — chequeo FIN RECEPCIÓN (23:00 diario)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=21600,
        coalesce=True,
    )
    # Job diario para buscar respuestas .ok / .bad de REE en el SFTP sobre los
    # REOB enviados. Corre todos los días a las 07:00 (Europe/Madrid).
    # misfire_grace_time + coalesce: ver comentarios del job FIN RECEPCIÓN arriba.
    _scheduler.add_job(
        _ejecutar_busqueda_respuestas_ree,
        trigger=CronTrigger(hour=7, minute=0),
        id="obj_buscar_respuestas_ree_job",
        name="Objeciones — buscar respuestas REE (07:00 diario)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=21600,
        coalesce=True,
    )
    # Job diario para chequear hitos FIN RESOLUCIÓN OBJECIONES del calendario REE.
    # Corre todos los días a las 23:30 (Europe/Madrid) y genera alertas para los
    # tenants con la automatización activada. Mira HACIA ADELANTE (próximos 3 días)
    # al contrario que FIN RECEPCIÓN, porque es un aviso PREVENTIVO antes del hito.
    # misfire_grace_time + coalesce: ver comentarios del job FIN RECEPCIÓN arriba.
    _scheduler.add_job(
        _ejecutar_chequeo_fin_resolucion,
        trigger=CronTrigger(hour=23, minute=30),
        id="obj_fin_resolucion_job",
        name="Objeciones — chequeo FIN RESOLUCIÓN (23:30 diario)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=21600,
        coalesce=True,
    )

    # Job diario de Publicaciones REE — busca hitos en calendario REE
    # (M2/M7/M11/ART15) en los próximos 3 días y crea alertas si encuentra
    # BALDs nuevos en SFTP. NO descarga ni importa nada (eso es manual).
    # Hora elegida: 22:00 Madrid — separa carga del SFTP de los otros 3 jobs
    # de objeciones (07:00, 23:00, 23:30).
    _scheduler.add_job(
        _ejecutar_buscar_publicaciones_ree,
        trigger=CronTrigger(hour=22, minute=0),
        id="pub_buscar_publicaciones_ree_job",
        name="Publicaciones REE — buscar hitos publicados (22:00 diario)",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=21600,
        coalesce=True,
    )

    _scheduler.start()
    logger.info(
        "[Scheduler] Scheduler arrancado — FTP cada minuto + "
        "Objeciones FIN RECEPCIÓN 23:00 + FIN RESOLUCIÓN 23:30 + BUSCAR RESPUESTAS REE 07:00 + "
        "Publicaciones BUSCAR PUBLICACIONES REE 22:00"
    )

    # Catch-up: tras arrancar (posiblemente después de un reinicio), comprobar
    # si se perdió la ejecución del job FIN_RECEPCION de hoy y recuperarla.
    # Se ejecuta en un thread para no bloquear el arranque de uvicorn.
    import threading
    threading.Thread(target=_catchup_jobs_perdidos, daemon=True, name="SchedulerCatchup").start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        
