# app/measures/descarga/automatizacion/services_job.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Job BUSCAR_PUBLICACIONES_REE del submódulo Automatización de Publicaciones.

Función pública:
  - ejecutar_chequeo_publicaciones_tenant:
      Mira si en la ventana del hito (hoy ± N días, configurable por hito)
      hay algún hito de publicación REE (M1 / M2 / M7 / M11 / ART15) según
      el calendario del tenant. Para cada hito detectado, llama a `buscar_ftp`
      y crea alertas con los ficheros pendientes (nuevo / actualizable) del
      tipo asociado a ese hito:
        - M1                       → ACUMCIL, ACUM_H2_GRD, ACUM_H2_RDD_P1/P2
        - M2 / M7 / M11 / ART15    → BALD

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
# Constantes — los 5 hitos REE (M1 + M2/M7/M11/ART15)
# ═════════════════════════════════════════════════════════════════════════════

# Mapeo de eventos REE a tipo de alerta. El `evento_contains` debe coincidir
# exactamente con los nombres reales del calendario REE — son los mismos que
# usa /calendario-ree/dashboard-hitos y se han verificado en producción.
#
# Campos por hito:
#   tipo_alerta     → string único para identificar el tipo de alerta en BD.
#   label           → texto mostrado en logs.
#   categoria       → filtro adicional sobre ReeCalendarEvent.categoria (None = no filtra).
#   evento_contains → substring que debe contener ReeCalendarEvent.evento.
#   tipos_fichero   → tipos del SFTP que pertenecen a este hito (filtra los
#                     resultados de buscar_ftp). Vacío = no filtra por tipo.
#   dias_antes      → cuántos días ANTES del hito empieza la ventana de detección.
#   dias_despues    → cuántos días DESPUÉS del hito sigue activa la ventana.
#
# Notas sobre las ventanas:
#   - M2/M7/M11/ART15 (BALD): mantienen el comportamiento original
#     (hoy → hoy+2 = solo futuro). REE publica BALD con margen suficiente.
#   - M1 (ACUM*): ventana centrada en el hito (hoy-2 → hoy+2) porque los
#     ACUM se publican el mismo día del hito y conviene seguir detectándolos
#     uno o dos días después si el job se ejecuta a primera hora de la mañana.
_HITOS_PUBLICACION: List[Dict] = [
    {
        "tipo_alerta":     "publicacion_m1",
        "label":           "M1",
        "categoria":       "M+1",
        "evento_contains": "cierre m+1",
        "tipos_fichero":   ["ACUMCIL", "ACUM_H2_GRD", "ACUM_H2_RDD_P1", "ACUM_H2_RDD_P2"],
        "dias_antes":      2,
        "dias_despues":    2,
    },
    {
        "tipo_alerta":     "publicacion_m2",
        "label":           "M2",
        "categoria":       "M+2",
        "evento_contains": "cierre m+2",
        "tipos_fichero":   ["BALD"],
        "dias_antes":      0,
        "dias_despues":    2,
    },
    {
        "tipo_alerta":     "publicacion_m7",
        "label":           "M7",
        "categoria":       None,
        "evento_contains": "cierre provisional",
        "tipos_fichero":   ["BALD"],
        "dias_antes":      0,
        "dias_despues":    2,
    },
    {
        "tipo_alerta":     "publicacion_m11",
        "label":           "M11",
        "categoria":       None,
        "evento_contains": "cierre definitivo",
        "tipos_fichero":   ["BALD"],
        "dias_antes":      0,
        "dias_despues":    2,
    },
    {
        "tipo_alerta":     "publicacion_art15",
        "label":           "ART15",
        "categoria":       "Art. 15",
        "evento_contains": "publicación del operador del sistema",
        "tipos_fichero":   ["BALD"],
        "dias_antes":      0,
        "dias_despues":    2,
    },
]


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
) -> List[Tuple[ReeCalendarEvent, Dict]]:
    """
    Busca eventos del calendario REE que sean hitos de publicación
    (M1 / M2 / M7 / M11 / ART15) y caigan dentro de la ventana definida por
    el propio hito (`dias_antes` / `dias_despues`).

    Cada hito define su propia ventana porque:
      - BALD (M2/M7/M11/ART15): solo futuro (hoy → hoy+2) — REE publica con margen.
      - M1   (ACUM*):           pasado y futuro (hoy-2 → hoy+2) — REE puede
                                publicar el mismo día del hito y conviene seguir
                                detectándolo 1-2 días después.

    Para limitar la consulta SQL hacemos un primer filtro amplio con la
    ventana MÁXIMA de cualquier hito, y luego validamos hito a hito.

    Devuelve lista de (evento, hito_meta) para no perder la asociación
    de qué tipo de alerta corresponde.
    """
    hoy = date.today()

    # Ventana SQL amplia: el máximo `dias_antes` y `dias_despues` de cualquier hito.
    max_dias_antes   = max(int(h.get("dias_antes",   0)) for h in _HITOS_PUBLICACION) if _HITOS_PUBLICACION else 0
    max_dias_despues = max(int(h.get("dias_despues", 0)) for h in _HITOS_PUBLICACION) if _HITOS_PUBLICACION else 0
    fecha_desde_sql  = hoy - timedelta(days=max_dias_antes)
    fecha_hasta_sql  = hoy + timedelta(days=max_dias_despues)

    eventos = (
        db.query(ReeCalendarEvent)
        .filter(
            ReeCalendarEvent.tenant_id == tenant_id,
            ReeCalendarEvent.fecha     >= fecha_desde_sql,
            ReeCalendarEvent.fecha     <= fecha_hasta_sql,
        )
        .order_by(ReeCalendarEvent.fecha.asc(), ReeCalendarEvent.id.asc())
        .all()
    )

    matches: List[Tuple[ReeCalendarEvent, Dict]] = []
    for ev in eventos:
        ev_evento_lower    = (cast(str, getattr(ev, "evento", "")) or "").lower()
        ev_categoria_lower = (cast(str, getattr(ev, "categoria", "")) or "").lower()
        ev_fecha           = cast(date, getattr(ev, "fecha", None))

        for hito in _HITOS_PUBLICACION:
            evento_contains  = hito["evento_contains"].lower()
            categoria_filtro = hito.get("categoria")

            if evento_contains not in ev_evento_lower:
                continue
            # Si el hito requiere una categoría específica, validarla.
            if categoria_filtro is not None:
                if str(categoria_filtro).lower() not in ev_categoria_lower:
                    continue

            # Ventana específica de este hito: hito ya tiene una fecha concreta
            # en el calendario (ev_fecha). El hito está "en ventana" si
            # hoy está dentro de [ev_fecha - dias_antes, ev_fecha + dias_despues].
            if ev_fecha is None:
                continue
            dias_antes   = int(hito.get("dias_antes",   0))
            dias_despues = int(hito.get("dias_despues", 0))
            ventana_desde = ev_fecha - timedelta(days=dias_antes)
            ventana_hasta = ev_fecha + timedelta(days=dias_despues)
            if not (ventana_desde <= hoy <= ventana_hasta):
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
        msg = "No hay hitos de publicación REE en la ventana de detección."
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
        tipo_alerta   = hito_meta["tipo_alerta"]
        label_hito    = hito_meta["label"]
        tipos_fichero = hito_meta.get("tipos_fichero") or []

        # Filtrar pendientes que coincidan con este periodo del hito Y con
        # los tipos de fichero asociados (BALD para M2/M7/M11/ART15; ACUM*
        # para M1). Si `tipos_fichero` está vacío, no filtra por tipo.
        pendientes_hito = [
            r for r in pendientes
            if str(r.get("periodo") or "") == periodo_yyyymm
            and (not tipos_fichero or str(r.get("tipo") or "") in tipos_fichero)
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