# app/measures/descarga/automatizacion/services_job.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Job BUSCAR_PUBLICACIONES_REE del submódulo Automatización de Publicaciones.

Función pública:
  - ejecutar_chequeo_publicaciones_tenant:
      Mira si en HOY o los 2 días siguientes hay un hito de publicación REE
      (M2 / M7 / M11 / ART15) según el calendario del tenant. Para cada hito
      detectado, llama a `buscar_ftp` y crea alertas para los BALDs en estado
      "nuevo" o "actualizable".

Importante:
  - El job NUNCA descarga ni importa ficheros. Solo crea alertas.
  - El usuario las ve en la campanita y al pulsar va al panel manual.

Comportamiento del flag `forzar`:
  - Cron → forzar=False (respeta config.activa).
  - "Revisar ahora" desde UI → forzar=True (salta el check).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple, cast

from sqlalchemy.orm import Session

from app.calendario_ree.models import ReeCalendarEvent
from app.empresas.models import Empresa
from app.measures.descarga.automatizacion.models import (
    TIPO_BUSCAR_PUBLICACIONES_REE,
)
from app.measures.descarga.automatizacion.services_alertas import upsert_alerta
from app.measures.descarga.automatizacion.services_config import (
    get_or_create_config,
    marcar_ultimo_run,
)

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# Constantes — los 4 hitos REE que generan publicaciones BALD
# ═════════════════════════════════════════════════════════════════════════════

# Mapeo de eventos REE a tipo de alerta. El `evento_contains` debe coincidir
# exactamente con los nombres reales del calendario REE — son los mismos que
# usa /calendario-ree/dashboard-hitos y se han verificado en producción.
_HITOS_PUBLICACION: List[Dict[str, str]] = [
    {
        "tipo_alerta":     "publicacion_m2",
        "label":           "M2",
        "categoria":       "M+2",
        "evento_contains": "cierre m+2",
    },
    {
        "tipo_alerta":     "publicacion_m7",
        "label":           "M7",
        "categoria":       None,  # type: ignore[dict-item]
        "evento_contains": "cierre provisional",
    },
    {
        "tipo_alerta":     "publicacion_m11",
        "label":           "M11",
        "categoria":       None,  # type: ignore[dict-item]
        "evento_contains": "cierre definitivo",
    },
    {
        "tipo_alerta":     "publicacion_art15",
        "label":           "ART15",
        "categoria":       "Art. 15",
        "evento_contains": "publicación del operador del sistema",
    },
]

# Ventana de detección: hoy + N días siguientes. Cubre retrasos de REE.
_DIAS_VENTANA = 3  # hoy, hoy+1, hoy+2


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

# Meses ES → número (espejo del helper de objeciones).
_MESES_ES_A_NUM: Dict[str, int] = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


def _parsear_mes_afectado(mes_afectado: Optional[str]) -> Optional[Tuple[int, int, str]]:
    """
    Convierte "Junio 2025" → (2025, 6, "202506").
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


def _hitos_publicacion_en_ventana(
    db: Session,
    *,
    tenant_id: int,
    dias_ventana: int = _DIAS_VENTANA,
) -> List[Tuple[ReeCalendarEvent, Dict[str, str]]]:
    """
    Busca eventos del calendario REE que sean hitos de publicación
    (M2/M7/M11/ART15) y caigan en la ventana [hoy, hoy+dias_ventana-1].

    Devuelve lista de (evento, hito_meta) para no perder la asociación
    de qué tipo de alerta corresponde.
    """
    hoy = date.today()
    fecha_desde = hoy
    fecha_hasta = hoy + timedelta(days=dias_ventana - 1)

    eventos = (
        db.query(ReeCalendarEvent)
        .filter(
            ReeCalendarEvent.tenant_id == tenant_id,
            ReeCalendarEvent.fecha     >= fecha_desde,
            ReeCalendarEvent.fecha     <= fecha_hasta,
        )
        .order_by(ReeCalendarEvent.fecha.asc(), ReeCalendarEvent.id.asc())
        .all()
    )

    matches: List[Tuple[ReeCalendarEvent, Dict[str, str]]] = []
    for ev in eventos:
        ev_evento_lower    = (cast(str, getattr(ev, "evento", "")) or "").lower()
        ev_categoria_lower = (cast(str, getattr(ev, "categoria", "")) or "").lower()

        for hito in _HITOS_PUBLICACION:
            evento_contains  = hito["evento_contains"].lower()
            categoria_filtro = hito["categoria"]

            if evento_contains not in ev_evento_lower:
                continue
            # Si el hito requiere una categoría específica, validarla.
            if categoria_filtro is not None:
                if str(categoria_filtro).lower() not in ev_categoria_lower:
                    continue

            matches.append((ev, hito))
            break  # un evento corresponde a 1 solo tipo de hito

    return matches


def _construir_usuario_sintetico(allowed_empresa_ids: List[int]):
    """
    Crea un objeto-usuario mínimo para pasar a `buscar_ftp`.
    El servicio solo lee `empresa_ids_permitidas` e `is_superuser`, así que
    con eso basta.
    """
    class _UsuarioSintetico:
        is_superuser = False
        empresa_ids_permitidas: List[int] = allowed_empresa_ids

    return _UsuarioSintetico()


# ═════════════════════════════════════════════════════════════════════════════
# JOB PRINCIPAL
# ═════════════════════════════════════════════════════════════════════════════

def ejecutar_chequeo_publicaciones_tenant(
    db: Session,
    *,
    tenant_id: int,
    current_user=None,
    forzar: bool = False,
) -> dict:
    """
    Ejecuta el chequeo de publicaciones REE para un tenant.

    Devuelve:
      {
        "ok":                bool,
        "mensaje":           str,
        "alertas_creadas":   int,
        "hitos_procesados":  int,
      }
    """
    # Importes diferidos para evitar ciclos.
    from app.measures.descarga.services import buscar_ftp

    cfg = get_or_create_config(
        db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_PUBLICACIONES_REE,
    )

    # Si no se está forzando y la automatización está OFF → no hacer nada.
    if not forzar and int(cfg.activa or 0) == 0:
        msg = "Automatización desactivada — chequeo omitido."
        logger.info(f"[pub_buscar_publicaciones] tenant={tenant_id}: {msg}")
        return {"ok": True, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    # 1) Buscar hitos REE en la ventana.
    hitos = _hitos_publicacion_en_ventana(db, tenant_id=tenant_id)

    if not hitos:
        msg = f"No hay hitos de publicación REE en los próximos {_DIAS_VENTANA} días."
        marcar_ultimo_run(
            db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_PUBLICACIONES_REE,
            ok=True, mensaje=msg,
        )
        logger.info(f"[pub_buscar_publicaciones] tenant={tenant_id}: {msg}")
        return {"ok": True, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    # 2) Empresas accesibles (todas las del tenant — el job no filtra).
    empresas_tenant: List[Empresa] = (
        db.query(Empresa).filter(Empresa.tenant_id == tenant_id).all()
    )
    allowed_empresa_ids = [int(e.id) for e in empresas_tenant]

    if not allowed_empresa_ids:
        msg = "Tenant sin empresas — chequeo omitido."
        marcar_ultimo_run(
            db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_PUBLICACIONES_REE,
            ok=True, mensaje=msg,
        )
        return {"ok": True, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    user_sintetico = _construir_usuario_sintetico(allowed_empresa_ids)

    # 3) Llamar a buscar_ftp UNA sola vez sin filtros — el filtro inteligente
    #    de calendario REE ya cubre el ciclo en curso. Pasamos un fecha_desde
    #    amplio para asegurarnos de coger TODO lo del mes en curso + anterior.
    hoy = date.today()
    fecha_desde_iso = (hoy - timedelta(days=60)).isoformat()

    try:
        resultados = buscar_ftp(
            db,
            tenant_id    = tenant_id,
            current_user = user_sintetico,
            empresa_ids  = None,
            periodo      = None,
            nombre_filtro= None,
            fecha_desde  = fecha_desde_iso,
            fecha_hasta  = None,
        )
    except Exception as exc:
        msg = f"Error consultando SFTP: {str(exc)[:200]}"
        marcar_ultimo_run(
            db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_PUBLICACIONES_REE,
            ok=False, mensaje=msg,
        )
        logger.error(f"[pub_buscar_publicaciones] tenant={tenant_id}: {msg}")
        return {"ok": False, "mensaje": msg, "alertas_creadas": 0, "hitos_procesados": 0}

    # Solo nos interesan los pendientes (nuevo o actualizable).
    pendientes = [r for r in resultados if r.get("estado") in ("nuevo", "actualizable")]

    # 4) Para cada hito de la ventana, agrupar pendientes por (empresa, periodo)
    #    que coincidan con el periodo del hito.
    alertas_creadas  = 0
    hitos_procesados = 0
    errores: List[str] = []

    for hito_event, hito_meta in hitos:
        parsed = _parsear_mes_afectado(getattr(hito_event, "mes_afectado", None))
        if parsed is None:
            errores.append(
                f"No se pudo parsear mes_afectado='{hito_event.mes_afectado}' (hito id={hito_event.id})"
            )
            continue

        anio_periodo, mes_periodo, periodo_yyyymm = parsed
        tipo_alerta = hito_meta["tipo_alerta"]
        label_hito  = hito_meta["label"]

        # Filtrar pendientes que coincidan con este periodo del hito.
        pendientes_hito = [
            r for r in pendientes
            if str(r.get("periodo") or "") == periodo_yyyymm
        ]

        hitos_procesados += 1

        if not pendientes_hito:
            # No hay pendientes para este hito — REE aún no ha publicado, o ya estaba todo importado.
            continue

        # Agrupar por empresa.
        por_empresa: Dict[int, List[dict]] = {}
        for r in pendientes_hito:
            empresa_id = int(r.get("empresa_id") or 0)
            if empresa_id <= 0:
                continue
            por_empresa.setdefault(empresa_id, []).append(r)

        # Crear/actualizar alerta por empresa.
        fecha_hito_dt: Optional[datetime] = None
        if hito_event.fecha:
            fecha_hito_dt = datetime.combine(
                cast(date, hito_event.fecha), datetime.min.time(),
            )

        for empresa_id, items in por_empresa.items():
            try:
                detalle = [
                    {
                        "nombre":  it.get("nombre"),
                        "estado":  it.get("estado"),
                        "version": it.get("version"),
                        "tamanio": it.get("tamanio"),
                    }
                    for it in items
                ]
                upsert_alerta(
                    db,
                    tenant_id      = tenant_id,
                    empresa_id     = empresa_id,
                    tipo           = tipo_alerta,
                    periodo        = periodo_yyyymm,
                    fecha_hito     = fecha_hito_dt,
                    num_pendientes = len(items),
                    detalle        = detalle,
                    severidad      = "info",
                )
                alertas_creadas += 1
            except Exception as exc:
                msg_err = (
                    f"Error guardando alerta empresa={empresa_id} "
                    f"hito={label_hito} periodo={periodo_yyyymm}: {exc}"
                )
                logger.error(f"[pub_buscar_publicaciones] tenant={tenant_id}: {msg_err}")
                errores.append(msg_err)

    # 5) Construir mensaje final.
    if errores:
        ok = False
        mensaje = (
            f"{alertas_creadas} alertas en {hitos_procesados} hitos. "
            f"{len(errores)} errores: {errores[0][:120]}"
        )
    else:
        ok = True
        if alertas_creadas == 0:
            mensaje = (
                f"{hitos_procesados} hito(s) revisados — sin publicaciones nuevas en SFTP."
            )
        else:
            mensaje = f"{alertas_creadas} alerta(s) creadas en {hitos_procesados} hito(s)."

    marcar_ultimo_run(
        db, tenant_id=tenant_id, tipo=TIPO_BUSCAR_PUBLICACIONES_REE,
        ok=ok, mensaje=mensaje,
    )
    logger.info(f"[pub_buscar_publicaciones] tenant={tenant_id}: {mensaje}")

    return {
        "ok":                ok,
        "mensaje":           mensaje,
        "alertas_creadas":   alertas_creadas,
        "hitos_procesados":  hitos_procesados,
    }