# app/objeciones/automatizacion/services_job_resolucion.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Job FIN_RESOLUCION del submódulo Automatización de objeciones.

Función pública:
  - ejecutar_chequeo_fin_resolucion_tenant:
      Revisa los hitos FIN RESOLUCIÓN OBJECIONES del calendario REE
      de los PRÓXIMOS 3 días (D, D+1, D+2). Para cada (empresa × periodo)
      cuenta las objeciones en BD cuyo campo `aceptacion` es NULL (pendientes
      de responder). Si hay pendientes, crea o actualiza una alerta.

Diferencias CLAVE con FIN_RECEPCION:
  - Mira HACIA ADELANTE (preventivo) en vez de hacia atrás.
  - NO toca el SFTP. Solo consulta la BD local (4 tablas de objeciones).
  - La alerta avisa de "queda poco y hay X sin responder".

Esta función se llama desde 2 sitios:
  1. El cron del scheduler (job "obj_fin_resolucion_job" a las 23:30).
  2. El endpoint manual POST /objeciones/automatizacion/revisar-ahora/fin_resolucion.

Comportamiento del flag `forzar`:
  - Cuando se llama desde el cron respeta "activa" de la config
    (no hace nada si está desactivada).
  - Cuando se llama manualmente, salta esa comprobación (forzar=True).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.calendario_ree.models import ReeCalendarEvent
from app.empresas.models import Empresa
from app.objeciones.automatizacion.models import TIPO_FIN_RESOLUCION
from app.objeciones.automatizacion.services_alertas import upsert_alerta
from app.objeciones.automatizacion.services_config import (
    get_or_create_config,
    marcar_ultimo_run,
)

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

# Meses en español → número. Idéntico al de services_job.py — usado para
# parsear "mes_afectado" del calendario (ej. "Julio 2025" → (2025, 7)).
_MESES_ES_A_NUM: Dict[str, int] = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _parsear_mes_afectado(mes_afectado: Optional[str]) -> Optional[Tuple[int, int, str, str]]:
    """
    Convierte "Julio 2025" → (2025, 7, "202507", "2025/07").
    Devuelve None si no se puede parsear.

    El último elemento "2025/07" es el formato en el que está guardado el campo
    `periodo` en las tablas de objeciones — se usa para cruzar contra BD.
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
    periodo_slash  = f"{anio:04d}/{mes_num:02d}"
    return anio, mes_num, periodo_yyyymm, periodo_slash


def _hitos_fin_resolucion_proximos_dias(
    db: Session,
    *,
    tenant_id: int,
    dias_adelante: int = 3,
) -> List[ReeCalendarEvent]:
    """
    Busca eventos de calendario_ree cuyo `evento` coincida con
    "FIN RESOLUCIÓN OBJECIONES" y cuya fecha esté en los PRÓXIMOS `dias_adelante`
    días (desde HOY hacia adelante: [hoy, hoy+dias_adelante-1]).

    Razón de la ventana hacia adelante:
      FIN RESOLUCIÓN es la fecha LÍMITE para responder. Queremos avisar
      ANTES de que llegue, para que el usuario tenga tiempo de reaccionar.
      Si la fecha ya pasó, no re-alertamos (evita ruido).
    """
    hoy = date.today()
    fecha_desde = hoy
    fecha_hasta = hoy + timedelta(days=dias_adelante - 1)

    eventos = (
        db.query(ReeCalendarEvent)
        .filter(
            ReeCalendarEvent.tenant_id == tenant_id,
            ReeCalendarEvent.evento    == "FIN RESOLUCIÓN OBJECIONES",
            ReeCalendarEvent.fecha     >= fecha_desde,
            ReeCalendarEvent.fecha     <= fecha_hasta,
        )
        .all()
    )
    return eventos


def _contar_pendientes_por_empresa(
    db: Session,
    *,
    tenant_id: int,
    periodo_slash: str,
) -> Dict[int, int]:
    """
    Cuenta las objeciones con aceptacion IS NULL agrupadas por empresa_id
    para un periodo dado, sumando todos los tipos (AGRECL + INCL + CUPS + CIL).

    Devuelve: {empresa_id: num_pendientes}
    Empresas sin pendientes NO se incluyen en el dict.
    """
    # Import diferido para evitar cualquier ciclo con el resto del módulo.
    from app.objeciones.models import (
        ObjecionAGRECL,
        ObjecionINCL,
        ObjecionCUPS,
        ObjecionCIL,
    )

    resultado: Dict[int, int] = {}

    for model in (ObjecionAGRECL, ObjecionINCL, ObjecionCUPS, ObjecionCIL):
        # Objeciones del tenant en este periodo. Pedimos (empresa_id, aceptacion)
        # y filtramos en Python las que están "pendientes" (aceptacion NULL/''/
        # 'P') porque los 4 modelos pueden tratar distinto el campo y un filtro
        # SQL común requeriría asumir NULL estricto.
        rows_full = (
            db.query(model.empresa_id, model.aceptacion)
            .filter(
                model.tenant_id == tenant_id,
                model.periodo   == periodo_slash,
            )
            .all()
        )
        for eid, ac in rows_full:
            if ac in (None, "", "P"):  # P = pendiente si algún parser lo usa
                resultado[int(eid)] = resultado.get(int(eid), 0) + 1

    return resultado


# ═════════════════════════════════════════════════════════════════════════════
# JOB PRINCIPAL
# ═════════════════════════════════════════════════════════════════════════════

def ejecutar_chequeo_fin_resolucion_tenant(
    db: Session,
    *,
    tenant_id: int,
    current_user=None,  # no se usa — no hay SFTP aquí — se deja por simetría
    forzar: bool = False,
) -> dict:
    """
    Ejecuta el chequeo FIN RESOLUCIÓN OBJECIONES para un tenant.

    Parámetros:
        tenant_id: tenant a procesar.
        current_user: ignorado (no se toca el SFTP). Se acepta por simetría con
                      el job de FIN_RECEPCION.
        forzar:    si True, salta el check de "activa" en la config.
                   Lo usa el endpoint manual "Revisar ahora".

    Devuelve un resumen:
      {
        "ok":                 True/False,
        "mensaje":            texto legible,
        "alertas_creadas":    N,
        "hitos_procesados":   N,
      }

    También persiste el resumen en config.ultimo_run_* para que la UI
    lo pueda mostrar.
    """
    cfg = get_or_create_config(db, tenant_id=tenant_id, tipo=TIPO_FIN_RESOLUCION)

    # Si no se está forzando y la automatización está desactivada → no hacer nada.
    if not forzar and int(cfg.activa or 0) == 0:
        msg = "Automatización desactivada — chequeo omitido."
        logger.info(f"[obj_fin_resolucion] tenant={tenant_id}: {msg}")
        return {"ok": True, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    hitos = _hitos_fin_resolucion_proximos_dias(db, tenant_id=tenant_id, dias_adelante=3)

    if not hitos:
        msg = "No hay hitos FIN RESOLUCIÓN OBJECIONES en los próximos 3 días."
        marcar_ultimo_run(db, tenant_id=tenant_id, tipo=TIPO_FIN_RESOLUCION, ok=True, mensaje=msg)
        logger.info(f"[obj_fin_resolucion] tenant={tenant_id}: {msg}")
        return {"ok": True, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    alertas_creadas = 0
    hitos_procesados = 0
    errores: List[str] = []

    for hito in hitos:
        parsed = _parsear_mes_afectado(getattr(hito, "mes_afectado", None))
        if parsed is None:
            errores.append(f"No se pudo parsear mes_afectado='{hito.mes_afectado}' (hito id={hito.id})")
            continue

        anio, mes_num, periodo_yyyymm, periodo_slash = parsed

        try:
            pendientes_por_empresa = _contar_pendientes_por_empresa(
                db,
                tenant_id=tenant_id,
                periodo_slash=periodo_slash,
            )
        except Exception as exc:
            msg_err = f"Error contando pendientes periodo={periodo_yyyymm}: {exc}"
            logger.error(f"[obj_fin_resolucion] tenant={tenant_id}: {msg_err}")
            errores.append(msg_err)
            continue

        hitos_procesados += 1

        # Para cada empresa con pendientes → upsert de alerta.
        for empresa_id, num_pend in pendientes_por_empresa.items():
            if num_pend <= 0:
                continue
            # Detalle ligero (no hace falta listar cada objeción — en la UI
            # el usuario irá a la pantalla de la empresa para verlas).
            empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
            nombre_empresa = getattr(empresa, "nombre", None) or f"Empresa {empresa_id}"
            detalle = [{
                "empresa":        nombre_empresa,
                "periodo":        periodo_yyyymm,
                "num_pendientes": num_pend,
            }]
            try:
                fecha_hito_dt = datetime.combine(hito.fecha, datetime.min.time()) if hito.fecha else None
                upsert_alerta(
                    db,
                    tenant_id      = tenant_id,
                    empresa_id     = empresa_id,
                    tipo           = TIPO_FIN_RESOLUCION,
                    periodo        = periodo_yyyymm,
                    fecha_hito     = fecha_hito_dt,
                    num_pendientes = num_pend,
                    detalle        = detalle,
                    severidad      = "warning",
                )
                alertas_creadas += 1
            except Exception as exc:
                msg_err = f"Error guardando alerta empresa={empresa_id} periodo={periodo_yyyymm}: {exc}"
                logger.error(f"[obj_fin_resolucion] tenant={tenant_id}: {msg_err}")
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

    marcar_ultimo_run(db, tenant_id=tenant_id, tipo=TIPO_FIN_RESOLUCION, ok=ok, mensaje=mensaje)
    logger.info(f"[obj_fin_resolucion] tenant={tenant_id}: {mensaje}")

    return {
        "ok":               ok,
        "mensaje":          mensaje,
        "alertas_creadas":  alertas_creadas,
        "hitos_procesados": hitos_procesados,
    }