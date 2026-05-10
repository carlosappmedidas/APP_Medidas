# app/envios/automatizacion/services_alertas.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Servicio de detección y persistencia de alertas de envíos.

Detecta 4 tipos de alertas:
  1. plazo_proximo:           ≤3 días al plazo Y empresa sin envíos del M
  2. plazo_vencido_bad:       pasó plazo Y hay algún .bad
  3. plazo_vencido_pendiente: pasó plazo Y empresa sin envíos del M
  4. respuesta_ree:           respuestas REE recibidas (consolidada)

La función pública `recalcular_alertas_envios_tenant` orquesta todo:
  - Llama a las 4 funciones de detección
  - Crea/actualiza alertas en BD
  - Auto-resuelve plazo_proximo cuando se cumple la condición
  - Devuelve un dict con contadores
"""
from __future__ import annotations

import json
from datetime import date, datetime, time
from typing import Any

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore[assignment,misc]

from sqlalchemy.orm import Session

from app.calendario_laboral.services_db import cargar_festivos_set_activos
from app.calendario_laboral.services_festivos import (
    nth_dia_habil_madrid,
    nth_dia_natural_mes,
)
from app.empresas.models import Empresa
from app.envios.automatizacion.models import (
    ESTADO_ACTIVA,
    ESTADO_RESUELTA,
    EnvioAlerta,
    SEVERIDAD_CRITICAL,
    SEVERIDAD_WARNING,
    TIPO_PLAZO_PROXIMO,
    TIPO_PLAZO_VENCIDO_BAD,
    TIPO_PLAZO_VENCIDO_PENDIENTE,
    TIPO_RESPUESTA_REE,
)
from app.envios.models import EnvioM


# ── Constantes de plazos REE ─────────────────────────────────────────────────

PLAZOS_CONFIG: dict[str, dict[str, Any]] = {
    "M1": {"meses_offset": 1, "label": "4º día hábil 08:00h"},
    "M2": {"meses_offset": 2, "label": "12º día natural 08:00h"},
    "M7": {"meses_offset": 7, "label": "11º día hábil 08:00h"},
}
ORDEN_MS = ("M1", "M2", "M7")
DIAS_AVISO_PROXIMO = 3


# ── Helpers ──────────────────────────────────────────────────────────────────

def _restar_meses(anio: int, mes: int, n: int) -> tuple[int, int]:
    indice_total = (anio * 12 + (mes - 1)) - n
    return indice_total // 12, (indice_total % 12) + 1


def _periodo_str(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def _madrid_now() -> datetime:
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("Europe/Madrid"))
    return datetime.now()


def _datetime_madrid(d: date, hora: time = time(8, 0)) -> datetime:
    naive = datetime.combine(d, hora)
    if ZoneInfo is not None:
        return naive.replace(tzinfo=ZoneInfo("Europe/Madrid"))
    return naive


def _calcular_plazo(
    mes_envio_anio: int,
    mes_envio_mes: int,
    m_clas: str,
    festivos: set[date],
) -> datetime:
    if m_clas == "M1":
        fecha = nth_dia_habil_madrid(mes_envio_anio, mes_envio_mes, 4, festivos)
    elif m_clas == "M2":
        fecha = nth_dia_natural_mes(mes_envio_anio, mes_envio_mes, 12)
    elif m_clas == "M7":
        fecha = nth_dia_habil_madrid(mes_envio_anio, mes_envio_mes, 11, festivos)
    else:
        raise ValueError(f"M no soportada: {m_clas}")
    if fecha is None:
        fecha = date(mes_envio_anio, mes_envio_mes, 1)
    return _datetime_madrid(fecha, time(8, 0))


def _empresa_tiene_envios(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    m_clas: str,
    periodo_anio: int,
    periodo_mes: int,
) -> bool:
    """¿La empresa ha enviado AL MENOS un fichero del M y periodo?"""
    return db.query(EnvioM).filter(
        EnvioM.tenant_id == tenant_id,
        EnvioM.empresa_id == empresa_id,
        EnvioM.m_clasificacion == m_clas,
        EnvioM.periodo_anio == periodo_anio,
        EnvioM.periodo_mes == periodo_mes,
    ).count() > 0


def _empresa_tiene_bads(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    m_clas: str,
    periodo_anio: int,
    periodo_mes: int,
) -> int:
    """Cuenta envíos en estado 'bad' para esa empresa+M+periodo."""
    return db.query(EnvioM).filter(
        EnvioM.tenant_id == tenant_id,
        EnvioM.empresa_id == empresa_id,
        EnvioM.m_clasificacion == m_clas,
        EnvioM.periodo_anio == periodo_anio,
        EnvioM.periodo_mes == periodo_mes,
        EnvioM.estado_ree == "bad",
    ).count()


# ── Upsert de alerta ─────────────────────────────────────────────────────────

def _upsert_alerta(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    tipo: str,
    m_clas: str,
    periodo: str,
    plazo_fecha: datetime | None,
    num_pendientes: int,
    detalle: Any,
    severidad: str,
) -> tuple[bool, EnvioAlerta]:
    """
    Crea o actualiza una alerta. Devuelve (creada, alerta).
    Si la alerta ya existe en estado "descartada", NO la reactiva.
    """
    existing = db.query(EnvioAlerta).filter(
        EnvioAlerta.tenant_id == tenant_id,
        EnvioAlerta.empresa_id == empresa_id,
        EnvioAlerta.tipo == tipo,
        EnvioAlerta.m_clas == m_clas,
        EnvioAlerta.periodo == periodo,
    ).first()

    detalle_str = json.dumps(detalle, ensure_ascii=False, default=str) if detalle is not None else None

    if existing is None:
        nueva = EnvioAlerta()
        nueva.tenant_id = tenant_id  # type: ignore[assignment]
        nueva.empresa_id = empresa_id  # type: ignore[assignment]
        nueva.tipo = tipo  # type: ignore[assignment]
        nueva.m_clas = m_clas  # type: ignore[assignment]
        nueva.periodo = periodo  # type: ignore[assignment]
        nueva.plazo_fecha = plazo_fecha  # type: ignore[assignment]
        nueva.num_pendientes = num_pendientes  # type: ignore[assignment]
        nueva.detalle_json = detalle_str  # type: ignore[assignment]
        nueva.severidad = severidad  # type: ignore[assignment]
        nueva.estado = ESTADO_ACTIVA  # type: ignore[assignment]
        db.add(nueva)
        db.flush()
        return True, nueva

    # Ya existe: si está descartada, NO la tocamos (el usuario decidió ignorarla)
    if existing.estado == "descartada":
        return False, existing

    # Actualizar datos contextuales (siempre)
    existing.plazo_fecha = plazo_fecha  # type: ignore[assignment]
    existing.num_pendientes = num_pendientes  # type: ignore[assignment]
    existing.detalle_json = detalle_str  # type: ignore[assignment]
    existing.severidad = severidad  # type: ignore[assignment]

    # Si estaba resuelta y la condición vuelve a darse → reactivamos
    if existing.estado == "resuelta":
        existing.estado = ESTADO_ACTIVA  # type: ignore[assignment]
        existing.resuelta_at = None  # type: ignore[assignment]
        existing.resuelta_by = None  # type: ignore[assignment]

    db.flush()
    return False, existing


def _auto_resolver(
    db: Session,
    *,
    alerta: EnvioAlerta,
) -> bool:
    """Marca la alerta como 'resuelta' si está activa. Devuelve True si cambió."""
    if alerta.estado != ESTADO_ACTIVA:
        return False
    alerta.estado = ESTADO_RESUELTA  # type: ignore[assignment]
    alerta.resuelta_at = _madrid_now().replace(tzinfo=None)  # type: ignore[assignment]
    db.flush()
    return True


# ── Detección — Alerta 1: plazo_proximo ──────────────────────────────────────

def detectar_plazo_proximo(
    db: Session,
    *,
    tenant_id: int,
    empresas: list[Empresa],
    festivos: set[date],
    ahora: datetime,
) -> tuple[int, int, int]:
    """
    Para el mes_envio actual: detecta empresas SIN envíos cuyo plazo está
    a ≤3 días.

    Si la empresa AHORA tiene envíos, auto-resolvemos la alerta antigua si
    estaba activa.

    Devuelve (creadas, actualizadas, auto_resueltas).
    """
    creadas, actualizadas, auto_resueltas = 0, 0, 0

    me_anio = ahora.year
    me_mes  = ahora.month
    periodo_envio = _periodo_str(me_anio, me_mes)

    for emp in empresas:
        empresa_id = int(emp.id)  # type: ignore[arg-type]
        for m_clas in ORDEN_MS:
            plazo = _calcular_plazo(me_anio, me_mes, m_clas, festivos)
            dias_restantes = (plazo.date() - ahora.date()).days
            p_anio, p_mes = _restar_meses(me_anio, me_mes, PLAZOS_CONFIG[m_clas]["meses_offset"])
            tiene = _empresa_tiene_envios(
                db, tenant_id=tenant_id, empresa_id=empresa_id,
                m_clas=m_clas, periodo_anio=p_anio, periodo_mes=p_mes,
            )

            # Buscar alerta existente para auto-resolver si procede
            existing = db.query(EnvioAlerta).filter(
                EnvioAlerta.tenant_id == tenant_id,
                EnvioAlerta.empresa_id == empresa_id,
                EnvioAlerta.tipo == TIPO_PLAZO_PROXIMO,
                EnvioAlerta.m_clas == m_clas,
                EnvioAlerta.periodo == periodo_envio,
            ).first()

            condicion = (
                0 <= dias_restantes <= DIAS_AVISO_PROXIMO
                and not tiene
                and ahora < plazo
            )

            if condicion:
                detalle = {
                    "dias_restantes": dias_restantes,
                    "periodo_dato": _periodo_str(p_anio, p_mes),
                    "plazo_label": PLAZOS_CONFIG[m_clas]["label"],
                }
                created, _ = _upsert_alerta(
                    db,
                    tenant_id=tenant_id, empresa_id=empresa_id,
                    tipo=TIPO_PLAZO_PROXIMO, m_clas=m_clas, periodo=periodo_envio,
                    plazo_fecha=plazo.replace(tzinfo=None),
                    num_pendientes=1, detalle=detalle,
                    severidad=SEVERIDAD_WARNING,
                )
                if created:
                    creadas += 1
                else:
                    actualizadas += 1
            elif existing is not None and tiene:
                if _auto_resolver(db, alerta=existing):
                    auto_resueltas += 1

    return creadas, actualizadas, auto_resueltas


# ── Detección — Alerta 2: plazo_vencido_bad ──────────────────────────────────

def detectar_plazo_vencido_bad(
    db: Session,
    *,
    tenant_id: int,
    empresas: list[Empresa],
    festivos: set[date],
    ahora: datetime,
) -> tuple[int, int]:
    """
    Para el mes_envio actual: detecta empresas con .bad sin reenviar
    cuyo plazo ya pasó.

    NO auto-resuelve: el usuario debe reenviar y marcar manualmente.

    Devuelve (creadas, actualizadas).
    """
    creadas, actualizadas = 0, 0

    # Solo revisar el mes_envio actual
    meses_a_revisar: list[tuple[int, int]] = [(ahora.year, ahora.month)]

    for me_anio, me_mes in meses_a_revisar:
        periodo_envio = _periodo_str(me_anio, me_mes)
        for emp in empresas:
            empresa_id = int(emp.id)  # type: ignore[arg-type]
            for m_clas in ORDEN_MS:
                plazo = _calcular_plazo(me_anio, me_mes, m_clas, festivos)
                if ahora < plazo:
                    continue  # plazo no vencido todavía

                p_anio, p_mes = _restar_meses(me_anio, me_mes, PLAZOS_CONFIG[m_clas]["meses_offset"])
                num_bads = _empresa_tiene_bads(
                    db, tenant_id=tenant_id, empresa_id=empresa_id,
                    m_clas=m_clas, periodo_anio=p_anio, periodo_mes=p_mes,
                )
                if num_bads == 0:
                    continue

                detalle = {
                    "num_bads": num_bads,
                    "periodo_dato": _periodo_str(p_anio, p_mes),
                    "plazo_label": PLAZOS_CONFIG[m_clas]["label"],
                }
                created, _ = _upsert_alerta(
                    db,
                    tenant_id=tenant_id, empresa_id=empresa_id,
                    tipo=TIPO_PLAZO_VENCIDO_BAD, m_clas=m_clas, periodo=periodo_envio,
                    plazo_fecha=plazo.replace(tzinfo=None),
                    num_pendientes=num_bads, detalle=detalle,
                    severidad=SEVERIDAD_CRITICAL,
                )
                if created:
                    creadas += 1
                else:
                    actualizadas += 1

    return creadas, actualizadas


# ── Detección — Alerta 3: plazo_vencido_pendiente ────────────────────────────

def detectar_plazo_vencido_pendiente(
    db: Session,
    *,
    tenant_id: int,
    empresas: list[Empresa],
    festivos: set[date],
    ahora: datetime,
) -> tuple[int, int]:
    """
    Para el mes_envio actual: detecta empresas SIN ningún envío del M
    cuyo plazo ya pasó.

    NO auto-resuelve: el usuario debe enviar y marcar manualmente.

    Devuelve (creadas, actualizadas).
    """
    creadas, actualizadas = 0, 0

    # Solo revisar el mes_envio actual
    meses_a_revisar: list[tuple[int, int]] = [(ahora.year, ahora.month)]

    for me_anio, me_mes in meses_a_revisar:
        periodo_envio = _periodo_str(me_anio, me_mes)
        for emp in empresas:
            empresa_id = int(emp.id)  # type: ignore[arg-type]
            for m_clas in ORDEN_MS:
                plazo = _calcular_plazo(me_anio, me_mes, m_clas, festivos)
                if ahora < plazo:
                    continue

                p_anio, p_mes = _restar_meses(me_anio, me_mes, PLAZOS_CONFIG[m_clas]["meses_offset"])
                tiene = _empresa_tiene_envios(
                    db, tenant_id=tenant_id, empresa_id=empresa_id,
                    m_clas=m_clas, periodo_anio=p_anio, periodo_mes=p_mes,
                )
                if tiene:
                    continue

                detalle = {
                    "periodo_dato": _periodo_str(p_anio, p_mes),
                    "plazo_label": PLAZOS_CONFIG[m_clas]["label"],
                }
                created, _ = _upsert_alerta(
                    db,
                    tenant_id=tenant_id, empresa_id=empresa_id,
                    tipo=TIPO_PLAZO_VENCIDO_PENDIENTE, m_clas=m_clas, periodo=periodo_envio,
                    plazo_fecha=plazo.replace(tzinfo=None),
                    num_pendientes=1, detalle=detalle,
                    severidad=SEVERIDAD_CRITICAL,
                )
                if created:
                    creadas += 1
                else:
                    actualizadas += 1

    return creadas, actualizadas


# ── Alerta 4: respuesta_ree ──────────────────────────────────────────────────

def crear_alerta_respuesta_ree_bad(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    m_clas: str,
    periodo_envio: str,
    nombre_fichero: str,
    bad_n: int,
) -> bool:
    """
    Llamada desde `services_respuestas_ree` cuando llega un .bad nuevo.

    Lógica:
      - Si NO hay alerta activa para (tenant, empresa, M, periodo_envio):
         crear una nueva con num_pendientes=1 y detalle=[fichero].
      - Si YA hay alerta ACTIVA: actualizar — sumar 1 al contador y añadir
         el fichero al detalle (si no está ya).
      - Si la alerta está RESUELTA o DESCARTADA: crear una NUEVA alerta
         (los .bad nuevos son un evento distinto del anterior). El UNIQUE
         de BD nos lo impide → en ese caso modificamos el periodo añadiendo
         un sufijo con timestamp para que sea único.

    Devuelve True si se creó una alerta nueva, False si solo se actualizó.
    """
    existing = db.query(EnvioAlerta).filter(
        EnvioAlerta.tenant_id == tenant_id,
        EnvioAlerta.empresa_id == empresa_id,
        EnvioAlerta.tipo == TIPO_RESPUESTA_REE,
        EnvioAlerta.m_clas == m_clas,
        EnvioAlerta.periodo == periodo_envio,
    ).first()

    nuevo_item = {
        "fichero": nombre_fichero,
        "bad_n": bad_n,
        "detectado_at": _madrid_now().replace(tzinfo=None).isoformat(),
    }

    if existing is None:
        # Caso 1: no hay alerta → crear nueva
        nueva = EnvioAlerta()
        nueva.tenant_id = tenant_id  # type: ignore[assignment]
        nueva.empresa_id = empresa_id  # type: ignore[assignment]
        nueva.tipo = TIPO_RESPUESTA_REE  # type: ignore[assignment]
        nueva.m_clas = m_clas  # type: ignore[assignment]
        nueva.periodo = periodo_envio  # type: ignore[assignment]
        nueva.plazo_fecha = None  # type: ignore[assignment]
        nueva.num_pendientes = 1  # type: ignore[assignment]
        nueva.detalle_json = json.dumps([nuevo_item], ensure_ascii=False)  # type: ignore[assignment]
        nueva.severidad = SEVERIDAD_WARNING  # type: ignore[assignment]
        nueva.estado = ESTADO_ACTIVA  # type: ignore[assignment]
        db.add(nueva)
        db.flush()
        return True

    if existing.estado == ESTADO_ACTIVA:
        # Caso 2: alerta activa → sumar al contador y añadir al detalle
        items_existentes: list[dict[str, Any]] = []
        raw = getattr(existing, "detalle_json", None)
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    items_existentes = parsed
            except (json.JSONDecodeError, TypeError):
                items_existentes = []
        # Evitar duplicados por nombre_fichero
        if not any(it.get("fichero") == nombre_fichero for it in items_existentes):
            items_existentes.append(nuevo_item)
            existing.num_pendientes = len(items_existentes)  # type: ignore[assignment]
            existing.detalle_json = json.dumps(items_existentes, ensure_ascii=False)  # type: ignore[assignment]
            db.flush()
        return False

    # Caso 3: alerta resuelta o descartada → crear NUEVA con periodo único
    # Como el UNIQUE constraint nos impediría crear otra con el mismo
    # (tenant, empresa, tipo, M, periodo), añadimos sufijo timestamp.
    sufijo = _madrid_now().strftime("-%Y%m%d%H%M")
    periodo_unico = f"{periodo_envio}{sufijo}"

    nueva = EnvioAlerta()
    nueva.tenant_id = tenant_id  # type: ignore[assignment]
    nueva.empresa_id = empresa_id  # type: ignore[assignment]
    nueva.tipo = TIPO_RESPUESTA_REE  # type: ignore[assignment]
    nueva.m_clas = m_clas  # type: ignore[assignment]
    nueva.periodo = periodo_unico  # type: ignore[assignment]
    nueva.plazo_fecha = None  # type: ignore[assignment]
    nueva.num_pendientes = 1  # type: ignore[assignment]
    nueva.detalle_json = json.dumps([nuevo_item], ensure_ascii=False)  # type: ignore[assignment]
    nueva.severidad = SEVERIDAD_WARNING  # type: ignore[assignment]
    nueva.estado = ESTADO_ACTIVA  # type: ignore[assignment]
    db.add(nueva)
    db.flush()
    return True


def auto_resolver_alertas_respuesta_ree_por_ok(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    m_clas: str,
    periodo_envio: str,
    nombre_fichero_original: str,
) -> int:
    """
    Llamada cuando llega un .ok que cierra un .bad anterior.

    Busca alertas ACTIVAS de tipo respuesta_ree para esta empresa+M cuyo
    detalle incluya este fichero, y elimina ese fichero del detalle. Si
    el detalle queda vacío, marca la alerta como resuelta.

    Devuelve nº de alertas resueltas.
    """
    resueltas = 0
    # Buscar alertas activas para este (empresa, M) — el periodo puede tener
    # sufijo de timestamp si es una "segunda tanda", así que filtramos por
    # prefijo del periodo.
    alertas = db.query(EnvioAlerta).filter(
        EnvioAlerta.tenant_id == tenant_id,
        EnvioAlerta.empresa_id == empresa_id,
        EnvioAlerta.tipo == TIPO_RESPUESTA_REE,
        EnvioAlerta.m_clas == m_clas,
        EnvioAlerta.estado == ESTADO_ACTIVA,
        EnvioAlerta.periodo.like(f"{periodo_envio}%"),
    ).all()

    for alerta in alertas:
        items: list[dict[str, Any]] = []
        raw = getattr(alerta, "detalle_json", None)
        if raw:
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    items = parsed
            except (json.JSONDecodeError, TypeError):
                items = []
        items_filtrados = [it for it in items if it.get("fichero") != nombre_fichero_original]
        if len(items_filtrados) == len(items):
            continue  # este fichero no estaba en esta alerta
        if not items_filtrados:
            # Detalle vacío → resolver la alerta
            alerta.estado = ESTADO_RESUELTA  # type: ignore[assignment]
            alerta.resuelta_at = _madrid_now().replace(tzinfo=None)  # type: ignore[assignment]
            alerta.num_pendientes = 0  # type: ignore[assignment]
            alerta.detalle_json = json.dumps([], ensure_ascii=False)  # type: ignore[assignment]
            resueltas += 1
        else:
            # Aún quedan .bad sin resolver en esta alerta
            alerta.num_pendientes = len(items_filtrados)  # type: ignore[assignment]
            alerta.detalle_json = json.dumps(items_filtrados, ensure_ascii=False)  # type: ignore[assignment]
        db.flush()

    return resueltas


# ── Función pública orquestadora ─────────────────────────────────────────────

def recalcular_alertas_envios_tenant(
    db: Session,
    *,
    tenant_id: int,
) -> dict[str, Any]:
    """
    Recalcula las alertas de tipos plazo_* para un tenant.
    Llama secuencialmente a las 3 funciones de detección de plazos.
    NO incluye respuesta_ree (se genera desde el job de respuestas).

    Devuelve un dict con contadores agregados.
    """
    ahora = _madrid_now()
    festivos = cargar_festivos_set_activos(db, tenant_id=tenant_id, anio=ahora.year)
    empresas = (
        db.query(Empresa)
        .filter(Empresa.tenant_id == tenant_id)
        .order_by(Empresa.nombre.asc())
        .all()
    )

    detalle_por_tipo: dict[str, int] = {
        TIPO_PLAZO_PROXIMO: 0,
        TIPO_PLAZO_VENCIDO_BAD: 0,
        TIPO_PLAZO_VENCIDO_PENDIENTE: 0,
    }

    c1, u1, ar1 = detectar_plazo_proximo(
        db, tenant_id=tenant_id, empresas=empresas, festivos=festivos, ahora=ahora,
    )
    detalle_por_tipo[TIPO_PLAZO_PROXIMO] = c1 + u1

    c2, u2 = detectar_plazo_vencido_bad(
        db, tenant_id=tenant_id, empresas=empresas, festivos=festivos, ahora=ahora,
    )
    detalle_por_tipo[TIPO_PLAZO_VENCIDO_BAD] = c2 + u2

    c3, u3 = detectar_plazo_vencido_pendiente(
        db, tenant_id=tenant_id, empresas=empresas, festivos=festivos, ahora=ahora,
    )
    detalle_por_tipo[TIPO_PLAZO_VENCIDO_PENDIENTE] = c3 + u3

    db.commit()

    return {
        "creadas": c1 + c2 + c3,
        "actualizadas": u1 + u2 + u3,
        "auto_resueltas": ar1,
        "detalle": detalle_por_tipo,
    }