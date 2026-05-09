# app/dashboard/services_envios.py
# pyright: reportMissingImports=false
"""
Servicio del dashboard de envíos (`/dashboard/envios-resumen`).

Modos:
  • "mensual"   → con alertas de plazo. Header: ENVÍOS {mes_envio}.
                  Cada grupo agrupa M1/M2/M7 con sus periodos (mes-1, mes-2, mes-7).
  • "historico" → sin alertas (los plazos ya pasaron). Misma lógica que
                  "mensual" pero el mes_envio es uno pasado seleccionable.

Grupos de tipos:
  - PM_1_2_3   = F1, F1QH                         (PS tipos 1-3)
  - PM_4_5     = AGRECL, INMECL, MAGCL            (PS tipos 4-5)
  - GEN_4_5    = MCIL345, MCIL345QH               (Generación 4-5)
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, cast

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
from app.envios.models import EnvioM


# ── Constantes ───────────────────────────────────────────────────────────

GRUPOS_TIPOS: dict[str, dict[str, Any]] = {
    "PM_1_2_3": {
        "label": "PM 1, 2 y 3 — F1 y F1QH",
        "tipos": ["F1", "F1QH"],
    },
    "PM_4_5": {
        "label": "PM 4 y 5 — AGRECL, INMECL, MAGCL",
        "tipos": ["AGRECL", "INMECL", "MAGCL"],
    },
    "GEN_4_5": {
        "label": "GENERACIÓN 4 y 5 — MCIL345 y MCIL345QH",
        "tipos": ["MCIL345", "MCIL345QH"],
    },
}

ORDEN_MS = ("M1", "M2", "M7")

PLAZOS_CONFIG: dict[str, dict[str, Any]] = {
    "M1": {"meses_offset": 1, "label": "4º día hábil 08:00h"},
    "M2": {"meses_offset": 2, "label": "12º día natural 08:00h"},
    "M7": {"meses_offset": 7, "label": "11º día hábil 08:00h"},
}


# ── Helpers de fechas/periodos ───────────────────────────────────────────

def _restar_meses(anio: int, mes: int, n: int) -> tuple[int, int]:
    """Resta n meses a (anio, mes)."""
    indice_total = (anio * 12 + (mes - 1)) - n
    nuevo_anio = indice_total // 12
    nuevo_mes = (indice_total % 12) + 1
    return nuevo_anio, nuevo_mes


def _periodo_str(anio: int, mes: int) -> str:
    return f"{anio:04d}-{mes:02d}"


def _periodo_para_m(mes_envio_anio: int, mes_envio_mes: int, m_clas: str) -> tuple[int, int]:
    """Devuelve el (anio, mes) del periodo asociado a un M en un mes_envio."""
    config = PLAZOS_CONFIG[m_clas]
    return _restar_meses(mes_envio_anio, mes_envio_mes, config["meses_offset"])


def _madrid_now() -> datetime:
    """Hora actual en Europe/Madrid."""
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("Europe/Madrid"))
    return datetime.now()


def _datetime_madrid(d: date, hora: time = time(8, 0)) -> datetime:
    """Combina fecha + hora en zona Europe/Madrid."""
    naive = datetime.combine(d, hora)
    if ZoneInfo is not None:
        return naive.replace(tzinfo=ZoneInfo("Europe/Madrid"))
    return naive


# ── Cálculo de plazos REE ────────────────────────────────────────────────

def calcular_plazo(
    mes_envio_anio: int,
    mes_envio_mes: int,
    m_clas: str,
    festivos: set[date],
) -> tuple[datetime, str]:
    """Calcula la fecha-hora límite REE para un M concreto en un mes_envio."""
    label = cast(str, PLAZOS_CONFIG[m_clas]["label"])

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

    return _datetime_madrid(fecha, time(8, 0)), label


def _estado_plazo(plazo: datetime, ahora: datetime, ficheros_enviados: int) -> tuple[str, int]:
    """Determina (estado, dias_restantes) según hora actual y ficheros enviados."""
    dias_restantes = (plazo.date() - ahora.date()).days

    if ahora >= plazo:
        if ficheros_enviados > 0:
            return "enviado", dias_restantes
        return "vencido", dias_restantes

    if dias_restantes == 0:
        return "vence_hoy", 0

    return "en_plazo", dias_restantes


# ── Agregaciones envios_m ────────────────────────────────────────────────

def _query_base_envios(db: Session, *, tenant_id: int):
    """Query base de envios_m del tenant."""
    return db.query(EnvioM).filter(EnvioM.tenant_id == tenant_id)


def _agregar_envios_grupo(
    db: Session,
    *,
    tenant_id: int,
    tipos: list[str],
    periodo_anio: int,
    periodo_mes: int,
    m_clas: str,
) -> dict[str, int]:
    """Cuenta envíos de un grupo (lista de tipos) para un (periodo, M)."""
    base = _query_base_envios(db, tenant_id=tenant_id).filter(
        EnvioM.tipo.in_(tipos),
        EnvioM.periodo_anio == periodo_anio,
        EnvioM.periodo_mes == periodo_mes,
        EnvioM.m_clasificacion == m_clas,
    )

    total = base.count()
    ok = base.filter(EnvioM.estado_ree == "ok").count()
    bad = base.filter(EnvioM.estado_ree == "bad").count()
    pendiente = total - ok - bad

    return {"total": total, "ok": ok, "bad": bad, "pendiente": pendiente}


def _contar_enviados_total_M(
    db: Session,
    *,
    tenant_id: int,
    periodo_anio: int,
    periodo_mes: int,
    m_clas: str,
) -> int:
    """Total de ficheros enviados (cualquier tipo) para (periodo, M)."""
    return (
        _query_base_envios(db, tenant_id=tenant_id)
        .filter(
            EnvioM.periodo_anio == periodo_anio,
            EnvioM.periodo_mes == periodo_mes,
            EnvioM.m_clasificacion == m_clas,
        )
        .count()
    )


# ── Construcción de bloques ──────────────────────────────────────────────

def _build_alertas(
    db: Session,
    *,
    tenant_id: int,
    mes_envio_anio: int,
    mes_envio_mes: int,
    festivos: set[date],
) -> dict[str, dict[str, Any]]:
    """Construye {"M1": ..., "M2": ..., "M7": ...} con AlertaPlazo."""
    ahora = _madrid_now()
    alertas: dict[str, dict[str, Any]] = {}

    for m_clas in ORDEN_MS:
        periodo_anio, periodo_mes = _periodo_para_m(mes_envio_anio, mes_envio_mes, m_clas)
        plazo_dt, label = calcular_plazo(mes_envio_anio, mes_envio_mes, m_clas, festivos)
        ficheros_enviados = _contar_enviados_total_M(
            db,
            tenant_id=tenant_id,
            periodo_anio=periodo_anio,
            periodo_mes=periodo_mes,
            m_clas=m_clas,
        )
        estado, dias_restantes = _estado_plazo(plazo_dt, ahora, ficheros_enviados)

        alertas[m_clas] = {
            "M": m_clas,
            "periodo": _periodo_str(periodo_anio, periodo_mes),
            "plazo_fecha": plazo_dt,
            "plazo_label": label,
            "estado": estado,
            "dias_restantes": dias_restantes,
            "ficheros_enviados": ficheros_enviados,
        }

    return alertas


def _build_grupos_mensual(
    db: Session,
    *,
    tenant_id: int,
    mes_envio_anio: int,
    mes_envio_mes: int,
) -> list[dict[str, Any]]:
    """Para cada grupo, una línea por cada M con datos."""
    grupos: list[dict[str, Any]] = []

    for grupo_id, info in GRUPOS_TIPOS.items():
        periodos_lista: list[dict[str, Any]] = []

        for m_clas in ORDEN_MS:
            periodo_anio, periodo_mes = _periodo_para_m(
                mes_envio_anio, mes_envio_mes, m_clas
            )
            agg = _agregar_envios_grupo(
                db,
                tenant_id=tenant_id,
                tipos=info["tipos"],
                periodo_anio=periodo_anio,
                periodo_mes=periodo_mes,
                m_clas=m_clas,
            )
            if agg["total"] == 0:
                continue
            periodos_lista.append({
                "periodo": _periodo_str(periodo_anio, periodo_mes),
                "M": m_clas,
                "ficheros_enviados": agg["total"],
                "respuestas_ok": agg["ok"],
                "respuestas_bad": agg["bad"],
                "respuestas_pendiente": agg["pendiente"],
            })

        grupos.append({
            "id": grupo_id,
            "label": info["label"],
            "tipos": list(info["tipos"]),
            "periodos": periodos_lista,
        })

    return grupos


def _build_por_empresa(
    db: Session,
    *,
    tenant_id: int,
    periodos_a_consultar: list[tuple[int, int, str]],
) -> list[dict[str, Any]]:
    """
    Bloque "Detalle por empresa".

    `periodos_a_consultar`: lista de tuplas (periodo_anio, periodo_mes, M).
    """
    empresas = (
        db.query(Empresa)
        .filter(Empresa.tenant_id == tenant_id)
        .order_by(Empresa.nombre.asc())
        .all()
    )

    resultado: list[dict[str, Any]] = []

    for emp in empresas:
        empresa_id = int(cast(int, emp.id))
        codigo_ree = cast("str | None", getattr(emp, "codigo_ree", None))

        totales_por_grupo: dict[str, dict[str, int]] = {
            grupo_id: {"enviados": 0, "ok": 0, "bad": 0, "pendiente": 0}
            for grupo_id in GRUPOS_TIPOS
        }
        detalle_por_grupo: dict[str, list[dict[str, Any]]] = {
            grupo_id: [] for grupo_id in GRUPOS_TIPOS
        }
        total_enviados_mes = 0

        for periodo_anio, periodo_mes, m_clas in periodos_a_consultar:
            for grupo_id, info in GRUPOS_TIPOS.items():
                base = (
                    _query_base_envios(db, tenant_id=tenant_id)
                    .filter(
                        EnvioM.empresa_id == empresa_id,
                        EnvioM.tipo.in_(info["tipos"]),
                        EnvioM.periodo_anio == periodo_anio,
                        EnvioM.periodo_mes == periodo_mes,
                        EnvioM.m_clasificacion == m_clas,
                    )
                )
                total = base.count()
                if total == 0:
                    continue
                ok = base.filter(EnvioM.estado_ree == "ok").count()
                bad = base.filter(EnvioM.estado_ree == "bad").count()
                pendiente = total - ok - bad

                totales_por_grupo[grupo_id]["enviados"] += total
                totales_por_grupo[grupo_id]["ok"] += ok
                totales_por_grupo[grupo_id]["bad"] += bad
                totales_por_grupo[grupo_id]["pendiente"] += pendiente
                total_enviados_mes += total

                detalle_por_grupo[grupo_id].append({
                    "periodo": _periodo_str(periodo_anio, periodo_mes),
                    "M": m_clas,
                    "enviados": total,
                    "ok": ok,
                    "bad": bad,
                    "pendiente": pendiente,
                })

        if total_enviados_mes == 0:
            continue

        resultado.append({
            "empresa_id": empresa_id,
            "empresa_nombre": cast(str, emp.nombre),
            "codigo_ree": codigo_ree,
            "total_enviados_mes": total_enviados_mes,
            "totales_por_grupo": totales_por_grupo,
            "detalle_por_grupo": detalle_por_grupo,
        })

    return resultado


# ── Función pública principal ────────────────────────────────────────────

def build_envios_resumen(
    db: Session,
    *,
    tenant_id: int,
    anio: int,
    mes: int,
    modo: str,
) -> dict[str, Any]:
    """
    Construye el JSON completo de /dashboard/envios-resumen.

    En ambos modos (mensual e histórico) (anio, mes) representa el mes_envio
    (el mes en que se realizó/realiza el envío al SFTP REE). La única
    diferencia es:
      • mensual   → incluye alertas de plazo (calculadas desde festivos Madrid)
      • historico → sin alertas (los plazos ya pasaron y no aplican)

    En ambos modos los grupos contienen líneas por cada M (M1/M2/M7) con su
    periodo correspondiente (mes_envio - N).
    """
    if modo not in ("mensual", "historico"):
        raise ValueError(f"Modo inválido: {modo}")

    # Grupos: misma lógica para ambos modos (M1/M2/M7 con periodos calculados)
    grupos = _build_grupos_mensual(
        db,
        tenant_id=tenant_id,
        mes_envio_anio=anio,
        mes_envio_mes=mes,
    )

    # Por empresa: misma lógica también
    periodos_a_consultar: list[tuple[int, int, str]] = []
    for m_clas in ORDEN_MS:
        p_anio, p_mes = _periodo_para_m(anio, mes, m_clas)
        periodos_a_consultar.append((p_anio, p_mes, m_clas))

    por_empresa = _build_por_empresa(
        db,
        tenant_id=tenant_id,
        periodos_a_consultar=periodos_a_consultar,
    )

    # Alertas: solo en modo "mensual"
    alertas: dict[str, dict[str, Any]] | None = None
    if modo == "mensual":
        festivos = cargar_festivos_set_activos(db, tenant_id=tenant_id, anio=anio)
        alertas = _build_alertas(
            db,
            tenant_id=tenant_id,
            mes_envio_anio=anio,
            mes_envio_mes=mes,
            festivos=festivos,
        )

    return {
        "mes_envio": _periodo_str(anio, mes),
        "modo": modo,
        "alertas": alertas,
        "grupos": grupos,
        "por_empresa": por_empresa,
    }

# ── Histórico jerárquico (Año → Mes → Detalle) ───────────────────────────

def build_envios_historico(
    db: Session,
    *,
    tenant_id: int,
) -> dict[str, Any]:
    """
    Construye el JSON jerárquico del histórico: lista de años, cada uno con
    su lista de meses, cada mes con su detalle completo (grupos + empresas).

    Solo incluye años y meses que tengan al menos 1 envío.
    Ordenado descendente: año más reciente primero, mes más reciente primero.
    """
    # Obtener pares distintos (año_subida_sftp, mes_subida_sftp) que tienen envíos
    # Usamos subido_sftp_at para clasificar los envíos en su mes_envio real.
    rows = (
        _query_base_envios(db, tenant_id=tenant_id)
        .with_entities(
            EnvioM.subido_sftp_at,
        )
        .all()
    )

    # Agrupar manualmente (subido_sftp_at es DateTime, sacamos año y mes)
    meses_envio: set[tuple[int, int]] = set()
    for (subido_at,) in rows:
        if subido_at is None:
            continue
        meses_envio.add((subido_at.year, subido_at.month))

    if not meses_envio:
        return {"anios": []}

    # Agrupar por año
    anios_dict: dict[int, list[int]] = {}
    for anio_e, mes_e in meses_envio:
        anios_dict.setdefault(anio_e, []).append(mes_e)

    # Construir respuesta ordenada
    anios_resp: list[dict[str, Any]] = []
    for anio_e in sorted(anios_dict.keys(), reverse=True):
        meses_del_anio: list[dict[str, Any]] = []
        total_anio = 0
        ok_anio = 0
        bad_anio = 0
        totales_grupo_anio: dict[str, int] = {g: 0 for g in GRUPOS_TIPOS}

        for mes_e in sorted(anios_dict[anio_e], reverse=True):
            # Construir bloque de cada mes igual que el modo mensual
            grupos = _build_grupos_mensual(
                db,
                tenant_id=tenant_id,
                mes_envio_anio=anio_e,
                mes_envio_mes=mes_e,
            )
            periodos_a_consultar: list[tuple[int, int, str]] = []
            for m_clas in ORDEN_MS:
                p_anio, p_mes = _periodo_para_m(anio_e, mes_e, m_clas)
                periodos_a_consultar.append((p_anio, p_mes, m_clas))
            por_empresa = _build_por_empresa(
                db,
                tenant_id=tenant_id,
                periodos_a_consultar=periodos_a_consultar,
            )

            # Totales del mes
            total_mes = sum(
                p["ficheros_enviados"] for g in grupos for p in g["periodos"]
            )
            ok_mes = sum(p["respuestas_ok"] for g in grupos for p in g["periodos"])
            bad_mes = sum(p["respuestas_bad"] for g in grupos for p in g["periodos"])

            if total_mes == 0:
                continue

            meses_del_anio.append({
                "mes_envio": _periodo_str(anio_e, mes_e),
                "total_enviados": total_mes,
                "respuestas_ok": ok_mes,
                "respuestas_bad": bad_mes,
                "grupos": grupos,
                "por_empresa": por_empresa,
            })

            # Acumular en totales del año
            total_anio += total_mes
            ok_anio += ok_mes
            bad_anio += bad_mes
            for g in grupos:
                totales_grupo_anio[g["id"]] += sum(
                    p["ficheros_enviados"] for p in g["periodos"]
                )

        if total_anio == 0:
            continue

        anios_resp.append({
            "anio": anio_e,
            "total_enviados": total_anio,
            "respuestas_ok": ok_anio,
            "respuestas_bad": bad_anio,
            "totales_por_grupo": totales_grupo_anio,
            "meses": meses_del_anio,
        })

    return {"anios": anios_resp}
