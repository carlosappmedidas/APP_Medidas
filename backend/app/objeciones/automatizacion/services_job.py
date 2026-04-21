# app/objeciones/automatizacion/services_job.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Job principal del submódulo Automatización de objeciones.

Función pública:
  - ejecutar_chequeo_fin_recepcion_tenant:
      Revisa los hitos FIN_RECEPCION_OBJECIONES del calendario REE
      de los últimos 3 días (D+1 a D+3). Para cada (empresa × periodo),
      hace buscar_ftp y detecta AOBs nuevos/actualizables.
      Crea o actualiza alertas por cada combinación detectada.

Esta función SE LLAMA desde 2 sitios:
  1. El cron del scheduler (job "obj_fin_recepcion_job" a las 23:00).
  2. El endpoint manual POST /objeciones/automatizacion/revisar-ahora.

Diferencias:
  - Cuando se llama desde el cron respeta "activa" de la config
    (no hace nada si está desactivada).
  - Cuando se llama manualmente, salta esa comprobación
    (controlado por el flag `forzar`).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.calendario_ree.models import ReeCalendarEvent
from app.objeciones.automatizacion.models import TIPO_FIN_RECEPCION
from app.objeciones.automatizacion.services_alertas import upsert_alerta
from app.objeciones.automatizacion.services_config import (
    get_or_create_config,
    marcar_ultimo_run,
)

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

# Meses en español → número. Se usa para parsear "mes_afectado" del calendario
# (ej. "Julio 2025" → (2025, 7)).
_MESES_ES_A_NUM: Dict[str, int] = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _parsear_mes_afectado(mes_afectado: Optional[str]) -> Optional[Tuple[int, int, str]]:
    """
    Convierte "Julio 2025" → (2025, 7, "202507").
    Devuelve None si no se puede parsear.
    """
    if not mes_afectado:
        return None
    partes = str(mes_afectado).strip().split()
    if len(partes) != 2:
        return None
    nombre_mes = partes[0].lower()
    anio_str = partes[1]
    mes_num = _MESES_ES_A_NUM.get(nombre_mes)
    if mes_num is None or not anio_str.isdigit() or len(anio_str) != 4:
        return None
    anio = int(anio_str)
    periodo_yyyymm = f"{anio:04d}{mes_num:02d}"
    return anio, mes_num, periodo_yyyymm


def _hitos_fin_recepcion_ultimos_dias(
    db: Session,
    *,
    tenant_id: int,
    dias_atras: int = 3,
) -> List[ReeCalendarEvent]:
    """
    Busca eventos de calendario_ree cuyo `evento` coincida con
    "FIN RECEPCIÓN OBJECIONES" y cuya fecha esté en los últimos `dias_atras`
    días (desde ayer hacia atrás: [hoy-dias_atras, hoy-1]).

    Filtramos por el texto exacto "FIN RECEPCIÓN OBJECIONES" para NO capturar
    "FIN RECEPCIÓN AUTO-OBJECIONES", que es un evento distinto.
    """
    hoy = date.today()
    fecha_desde = hoy - timedelta(days=dias_atras)
    fecha_hasta = hoy - timedelta(days=1)

    eventos = (
        db.query(ReeCalendarEvent)
        .filter(
            ReeCalendarEvent.tenant_id == tenant_id,
            ReeCalendarEvent.evento    == "FIN RECEPCIÓN OBJECIONES",
            ReeCalendarEvent.fecha     >= fecha_desde,
            ReeCalendarEvent.fecha     <= fecha_hasta,
        )
        .all()
    )
    return eventos


# ═════════════════════════════════════════════════════════════════════════════
# JOB PRINCIPAL
# ═════════════════════════════════════════════════════════════════════════════

def ejecutar_chequeo_fin_recepcion_tenant(
    db: Session,
    *,
    tenant_id: int,
    current_user=None,
    forzar: bool = False,
) -> dict:
    """
    Ejecuta el chequeo FIN RECEPCIÓN OBJECIONES para un tenant.

    Parámetros:
        tenant_id:    tenant a procesar.
        current_user: usuario (solo necesario cuando se llama desde un endpoint).
                      El job del scheduler pasa None — en ese caso se usa un
                      "usuario sintético" con permisos totales del tenant.
        forzar:       si True, salta el check de "activa" en la config.
                      Lo usa el endpoint manual "Revisar ahora".

    Devuelve un resumen:
      {
        "ok":                 True/False,
        "mensaje":            texto legible,
        "alertas_creadas":    N,
        "hitos_procesados":   N,
      }

    El resumen también se persiste en config.ultimo_run_* para que la UI
    lo pueda mostrar en la tarjeta de Configuración.
    """
    cfg = get_or_create_config(db, tenant_id=tenant_id, tipo=TIPO_FIN_RECEPCION)

    # Si no se está forzando y la automatización está desactivada → no hacer nada.
    if not forzar and int(cfg.activa or 0) == 0:
        msg = "Automatización desactivada — chequeo omitido."
        logger.info(f"[obj_fin_recepcion] tenant={tenant_id}: {msg}")
        return {"ok": True, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    # Import diferido para evitar import circular con descarga/services.
    from app.objeciones.descarga.services import buscar_ftp

    hitos = _hitos_fin_recepcion_ultimos_dias(db, tenant_id=tenant_id, dias_atras=3)

    if not hitos:
        msg = "No hay hitos FIN RECEPCIÓN OBJECIONES en los últimos 3 días."
        marcar_ultimo_run(db, tenant_id=tenant_id, ok=True, mensaje=msg)
        logger.info(f"[obj_fin_recepcion] tenant={tenant_id}: {msg}")
        return {"ok": True, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    # ─── Usuario sintético para buscar_ftp cuando lo llama el scheduler ──────
    # buscar_ftp espera `current_user` con `is_superuser` y `empresa_ids_permitidas`.
    # Cuando lo invoca el cron no tenemos usuario real → usamos un stub.
    if current_user is None:
        class _CronUser:
            is_superuser = False
            empresa_ids_permitidas: list = []      # [] → acceso a todas las empresas del tenant
            tenant_id_attr = tenant_id
        current_user = _CronUser()

    alertas_creadas = 0
    hitos_procesados = 0
    errores: List[str] = []

    for hito in hitos:
        parsed = _parsear_mes_afectado(getattr(hito, "mes_afectado", None))
        if parsed is None:
            errores.append(f"No se pudo parsear mes_afectado='{hito.mes_afectado}' (hito id={hito.id})")
            continue

        anio, mes_num, periodo_yyyymm = parsed
        periodo_dashed = f"{anio:04d}-{mes_num:02d}"  # formato aceptado por buscar_ftp

        try:
            # Buscar AOBs en SFTP para ese periodo (todas las empresas accesibles).
            resultados = buscar_ftp(
                db,
                tenant_id    = tenant_id,
                current_user = current_user,
                empresa_ids  = None,              # None → todas las accesibles
                periodo      = periodo_dashed,
                nombre_filtro= None,
                fecha_desde  = None,
                fecha_hasta  = None,
            )
        except Exception as exc:
            msg_err = f"Error buscando SFTP para periodo {periodo_yyyymm}: {exc}"
            logger.error(f"[obj_fin_recepcion] tenant={tenant_id}: {msg_err}")
            errores.append(msg_err)
            continue

        hitos_procesados += 1

        # Agrupar pendientes por empresa.
        pendientes_por_empresa: Dict[int, List[dict]] = {}
        for r in (resultados or []):
            if r.get("estado") not in ("nuevo", "actualizable"):
                continue
            eid = int(r.get("empresa_id") or 0)
            if eid <= 0:
                continue
            pendientes_por_empresa.setdefault(eid, []).append(r)

        # Para cada empresa con pendientes → upsert de alerta.
        for empresa_id, pendientes in pendientes_por_empresa.items():
            if not pendientes:
                continue
            detalle = [
                {
                    "nombre":  p.get("nombre"),
                    "tipo":    p.get("tipo"),
                    "estado":  p.get("estado"),
                    "version": p.get("version"),
                    "fecha_sftp": p.get("fecha_sftp"),
                }
                for p in pendientes
            ]
            try:
                fecha_hito_dt = datetime.combine(hito.fecha, datetime.min.time()) if hito.fecha else None
                upsert_alerta(
                    db,
                    tenant_id      = tenant_id,
                    empresa_id     = empresa_id,
                    tipo           = TIPO_FIN_RECEPCION,
                    periodo        = periodo_yyyymm,
                    fecha_hito     = fecha_hito_dt,
                    num_pendientes = len(pendientes),
                    detalle        = detalle,
                    severidad      = "warning",
                )
                alertas_creadas += 1
            except Exception as exc:
                msg_err = f"Error guardando alerta empresa={empresa_id} periodo={periodo_yyyymm}: {exc}"
                logger.error(f"[obj_fin_recepcion] tenant={tenant_id}: {msg_err}")
                errores.append(msg_err)

    # ─── Construir mensaje final ─────────────────────────────────────────────
    if errores:
        ok = False
        mensaje = (
            f"{alertas_creadas} alertas generadas en {hitos_procesados} hitos. "
            f"{len(errores)} errores: {errores[0][:120]}"
        )
    else:
        ok = True
        mensaje = (
            f"{alertas_creadas} alertas generadas en {hitos_procesados} hitos."
            if hitos_procesados > 0
            else "Hitos encontrados pero no pudieron procesarse."
        )

    marcar_ultimo_run(db, tenant_id=tenant_id, ok=ok, mensaje=mensaje)
    logger.info(f"[obj_fin_recepcion] tenant={tenant_id}: {mensaje}")

    return {
        "ok":                ok,
        "mensaje":           mensaje,
        "alertas_creadas":   alertas_creadas,
        "hitos_procesados":  hitos_procesados,
    }