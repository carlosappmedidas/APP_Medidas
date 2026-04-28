# app/dashboard_tablas/routes.py
# pyright: reportMissingImports=false, reportArgumentType=false, reportOperatorIssue=false
from __future__ import annotations

from collections import defaultdict
from typing import Any, cast

from fastapi import APIRouter, Depends
from sqlalchemy import false as sql_false
from sqlalchemy.orm import Session

from datetime import date

from app.calendario_ree.models import ReeCalendarEvent, ReeCalendarFile
from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.permissions import get_allowed_empresa_ids
from app.empresas.models import Empresa
from app.measures.models import MedidaGeneral, MedidaPS
from app.tenants.models import User

from .schemas import (
    EmpresaRef,
    HistoricoGeneralAnioDetalle,
    HistoricoGeneralAnioTarjeta,
    HistoricoGeneralBlock,
    HistoricoGeneralEmpresaAnioTarjeta,
    HistoricoGeneralEmpresaDetalle,
    HistoricoGeneralMesCeldaVentana,
    HistoricoGeneralMesEmpresaFila,
    HistoricoGeneralMesFila,
    HistoricoPSAnioDetalle,
    HistoricoPSAnioTarjeta,
    HistoricoPSBlock,
    HistoricoPSEmpresaAnioTarjeta,
    HistoricoPSEmpresaDetalle,
    HistoricoPSMesFila,
    HistoricoResponse,
    MensualBandaPendienteGrupo,
    MensualBandaSalud,
    MensualGeneralBlock,
    MensualGeneralEmpresaDespliegueCelda,
    MensualGeneralEmpresaDespliegueFila,
    MensualGeneralEmpresaDetalle,
    MensualGeneralEmpresaVentanaCelda,
    MensualGeneralVentanaCard,
    MensualPSBlock,
    MensualPSEmpresaCelda,
    MensualPSEmpresaDetalle,
    MensualPSKpis,
    MensualPSRepartoBlock,
    MensualPSRepartoCard,
    MensualResponse,
    VentanaCode,
)

router = APIRouter(prefix="/dashboard/tablas", tags=["dashboard-tablas"])


# =====================================================================
# Constantes y mapeos de columnas BALD
# =====================================================================

# Cada ventana mapea a (col_energia, col_perdidas_kwh, col_perdidas_pct).
# M1 usa los campos sin sufijo. El resto añaden el sufijo correspondiente.
VENTANAS: list[VentanaCode] = ["m1", "m2", "m7", "m11", "art15"]

VENTANA_COLS: dict[VentanaCode, tuple[str, str, str]] = {
    "m1": (
        "energia_neta_facturada_kwh",
        "perdidas_e_facturada_kwh",
        "perdidas_e_facturada_pct",
    ),
    "m2": (
        "energia_neta_facturada_m2_kwh",
        "perdidas_e_facturada_m2_kwh",
        "perdidas_e_facturada_m2_pct",
    ),
    "m7": (
        "energia_neta_facturada_m7_kwh",
        "perdidas_e_facturada_m7_kwh",
        "perdidas_e_facturada_m7_pct",
    ),
    "m11": (
        "energia_neta_facturada_m11_kwh",
        "perdidas_e_facturada_m11_kwh",
        "perdidas_e_facturada_m11_pct",
    ),
    "art15": (
        "energia_neta_facturada_art15_kwh",
        "perdidas_e_facturada_art15_kwh",
        "perdidas_e_facturada_art15_pct",
    ),
}

# Offset de meses entre la ventana y el mes que cubre, contado desde el mes
# de carga. M1 cubre el mes anterior (offset 1), M2 el de hace 2 meses, etc.
# ART15 lo definimos como 14 meses (cierre definitivo: ~14-15m según calendario REE).
VENTANA_OFFSET_MES: dict[VentanaCode, int] = {
    "m1": 1,
    "m2": 2,
    "m7": 7,
    "m11": 11,
    "art15": 14,
}

# Códigos de tarifa expuestos (4: 2.0TD, 3.0TD, 3.0TDVE, 6.1TD).
TARIFAS_CODES: list[str] = ["20td", "30td", "30tdve", "61td"]
TIPOS_CODES: list[str] = ["tipo_1", "tipo_2", "tipo_3", "tipo_4", "tipo_5"]

PS_TARIFA_COLS: dict[str, tuple[str, str, str]] = {
    "20td": ("cups_tarifa_20td", "energia_tarifa_20td_kwh", "importe_tarifa_20td_eur"),
    "30td": ("cups_tarifa_30td", "energia_tarifa_30td_kwh", "importe_tarifa_30td_eur"),
    "30tdve": ("cups_tarifa_30tdve", "energia_tarifa_30tdve_kwh", "importe_tarifa_30tdve_eur"),
    "61td": ("cups_tarifa_61td", "energia_tarifa_61td_kwh", "importe_tarifa_61td_eur"),
}

PS_TIPO_COLS: dict[str, tuple[str, str, str]] = {
    "tipo_1": ("cups_tipo_1", "energia_ps_tipo_1_kwh", "importe_tipo_1_eur"),
    "tipo_2": ("cups_tipo_2", "energia_ps_tipo_2_kwh", "importe_tipo_2_eur"),
    "tipo_3": ("cups_tipo_3", "energia_ps_tipo_3_kwh", "importe_tipo_3_eur"),
    "tipo_4": ("cups_tipo_4", "energia_ps_tipo_4_kwh", "importe_tipo_4_eur"),
    "tipo_5": ("cups_tipo_5", "energia_ps_tipo_5_kwh", "importe_tipo_5_eur"),
}


# =====================================================================
# Helpers de cálculo
# =====================================================================

def _f(value: Any) -> float:
    """Float seguro: None -> 0.0."""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _i(value: Any) -> int:
    """Int seguro: None -> 0."""
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _safe_pct(perd_kwh: float, energia_kwh: float) -> float | None:
    """% pérdidas calculado: pérdidas / (energía + pérdidas).

    Devuelve None si no hay datos, si el denominador es <=0, o si el resultado
    cae fuera de un rango razonable (-50%, +100%) — esto último filtra datos
    sucios o filas con pérdidas anómalas que generarían valores absurdos en
    los agregados anuales.
    """
    if energia_kwh <= 0 and perd_kwh <= 0:
        return None
    denom = energia_kwh + perd_kwh
    if denom <= 0:
        return None
    pct = (perd_kwh / denom) * 100.0
    if pct < -50.0 or pct > 100.0:
        return None
    return round(pct, 2)


def _shift_mes(anio: int, mes: int, delta_meses: int) -> tuple[int, int]:
    """Resta delta_meses a (anio, mes) y devuelve (anio_nuevo, mes_nuevo)."""
    total = anio * 12 + (mes - 1) - delta_meses
    new_anio = total // 12
    new_mes = (total % 12) + 1
    return new_anio, new_mes


def _row_has_ventana(row: MedidaGeneral, ventana: VentanaCode) -> bool:
    """¿Esta fila tiene datos publicados para esa ventana?"""
    col_e, _, _ = VENTANA_COLS[ventana]
    return _f(getattr(row, col_e, None)) > 0.0


# Mapeo: para cada ventana del dashboard, qué hito del calendario REE marca
# su "cierre" oficial. El mes objetivo de la tarjeta = el mes_afectado del
# hito cuya fecha cae DENTRO del mes de carga actual (mes natural de hoy).
#
# Por ejemplo: si hoy es 27 abril 2026, M11 muestra el mes cuyo
# CIERRE DEFINITIVO ocurre en abril 2026 (cae el 30/04 → Junio 2025).
VENTANA_HITO_CALENDARIO: dict[VentanaCode, tuple[str, str]] = {
    "m1":    ("M+1",         "Publicación del cierre M+1"),
    "m2":    ("M+2",         "Publicación del cierre M+2"),
    "m7":    ("Provisional", "CIERRE PROVISIONAL"),
    "m11":   ("Definitivo",  "CIERRE DEFINITIVO"),
    "art15": ("Art. 15",     "PUBLICACION NUEVO CIERRE DE ENERGÍA"),
}

# "Enero" -> 1, etc. Necesario para parsear el campo `mes_afectado` del
# calendario REE (formato "Mes Año" en castellano).
_MES_NOMBRE_A_NUM: dict[str, int] = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}


# Mapeo abreviaturas -> número de mes (formato 'Jun 25').
_MES_ABREV_A_NUM: dict[str, int] = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


def _parse_mes_afectado(texto: str) -> tuple[int, int] | None:
    """Convierte 'Junio 2025' o 'Jun 25' -> (2025, 6). None si no parsea."""
    if not texto:
        return None
    parts = texto.strip().split()
    if len(parts) != 2:
        return None
    nombre, anio_str = parts
    mes = _MES_NOMBRE_A_NUM.get(nombre.lower())
    if mes is None:
        # Intentar abreviatura (3 letras): 'Jun', 'Sep', ...
        mes = _MES_ABREV_A_NUM.get(nombre.lower()[:3])
    if mes is None:
        return None
    try:
        anio = int(anio_str)
        # Si viene en formato corto 'Jun 25' -> año 2025
        if anio < 100:
            anio += 2000
        return anio, mes
    except ValueError:
        return None


def _meses_objetivo_por_calendario_ree(
    db: Session,
    tenant_id: int,
) -> dict[VentanaCode, tuple[int, int] | None]:
    """
    Para cada ventana, devuelve el (anio, mes) que SEGÚN EL CALENDARIO REE
    debe estar publicado en el mes de carga vigente (= mes natural de hoy).

    Si no hay calendario activo para el tenant, o no hay hito que cuadre,
    devuelve None para esa ventana — el caller hará fallback al cálculo
    antiguo basado en el último mes con dato en BD.
    """
    resultado: dict[VentanaCode, tuple[int, int] | None] = {v: None for v in VENTANAS}

    hoy = date.today()
    primer_dia_mes = date(hoy.year, hoy.month, 1)
    if hoy.month == 12:
        primer_dia_mes_siguiente = date(hoy.year + 1, 1, 1)
    else:
        primer_dia_mes_siguiente = date(hoy.year, hoy.month + 1, 1)

    # Calendario activo del tenant. Si no hay → todas las ventanas a None.
    active_file = (
        db.query(ReeCalendarFile)
        .filter(
            ReeCalendarFile.tenant_id == tenant_id,
            ReeCalendarFile.is_active.is_(True),
        )
        .order_by(
            ReeCalendarFile.anio.desc(),
            ReeCalendarFile.created_at.desc(),
            ReeCalendarFile.id.desc(),
        )
        .first()
    )
    if active_file is None:
        return resultado

    # Traemos los hitos del mes vigente para ese calendario.
    eventos = (
        db.query(ReeCalendarEvent)
        .filter(
            ReeCalendarEvent.tenant_id == tenant_id,
            ReeCalendarEvent.calendar_file_id == active_file.id,
            ReeCalendarEvent.fecha >= primer_dia_mes,
            ReeCalendarEvent.fecha < primer_dia_mes_siguiente,
        )
        .all()
    )

    for ventana in VENTANAS:
        categoria_esperada, evento_substring = VENTANA_HITO_CALENDARIO[ventana]
        for ev in eventos:
            if str(ev.categoria) != categoria_esperada:
                continue
            if evento_substring not in str(ev.evento):
                continue
            parsed = _parse_mes_afectado(str(ev.mes_afectado))
            if parsed is not None:
                resultado[ventana] = parsed
                break

    return resultado


def _fecha_publicacion_por_grupo(
    db: Session,
    tenant_id: int,
    grupos: list[tuple[VentanaCode, int, int, list[str]]],
) -> dict[tuple[VentanaCode, int, int], str | None]:
    """
    Para cada (ventana, anio_objetivo, mes_objetivo) busca la fecha de
    publicación REAL en el calendario REE activo del tenant.

    El calendario REE almacena un evento por hito. Para encontrar la fecha
    de publicación de M11 jun 2025 buscamos: categoria='Definitivo',
    evento contiene 'CIERRE DEFINITIVO', mes_afectado parsea a (2025, 6).

    Devuelve dict {(ventana, anio, mes): "30 abr 2026"} o None si no se
    encuentra.
    """
    resultado: dict[tuple[VentanaCode, int, int], str | None] = {
        (v, a, m): None for (v, a, m, _) in grupos
    }
    if not grupos:
        return resultado

    # Calendario activo del tenant (mismo criterio que en _meses_objetivo).
    active_file = (
        db.query(ReeCalendarFile)
        .filter(
            ReeCalendarFile.tenant_id == tenant_id,
            ReeCalendarFile.is_active.is_(True),
        )
        .order_by(
            ReeCalendarFile.anio.desc(),
            ReeCalendarFile.created_at.desc(),
            ReeCalendarFile.id.desc(),
        )
        .first()
    )
    if active_file is None:
        return resultado

    # Traemos TODOS los hitos del fichero activo. Son ~50-60 al año, no es
    # caro y evita una query por grupo.
    eventos = (
        db.query(ReeCalendarEvent)
        .filter(
            ReeCalendarEvent.tenant_id == tenant_id,
            ReeCalendarEvent.calendar_file_id == active_file.id,
        )
        .all()
    )

    for ventana, anio_v, mes_v, _ in grupos:
        categoria_esperada, evento_substring = VENTANA_HITO_CALENDARIO[ventana]
        for ev in eventos:
            if str(ev.categoria) != categoria_esperada:
                continue
            if evento_substring not in str(ev.evento):
                continue
            parsed = _parse_mes_afectado(str(ev.mes_afectado))
            if parsed != (anio_v, mes_v):
                continue
            # Match: formatear la fecha como '30 abr 2026'
            fecha = ev.fecha
            if fecha is None:
                continue
            try:
                resultado[(ventana, anio_v, mes_v)] = (
                    f"{fecha.day} {_MESES_CORTOS[fecha.month]} {fecha.year}"
                )
            except (AttributeError, IndexError):
                pass
            break

    return resultado


# =====================================================================
# Endpoint MENSUAL
# =====================================================================

@router.get("/mensual", response_model=MensualResponse)
def get_dashboard_tablas_mensual(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MensualResponse:
    tenant_id = int(cast(int, current_user.tenant_id))
    allowed = get_allowed_empresa_ids(db, current_user)

    # Empresas visibles para el usuario
    empresas_q = (
        db.query(Empresa)
        .filter(Empresa.tenant_id == tenant_id)
    )
    if not allowed:
        empresas_q = empresas_q.filter(sql_false())
    else:
        empresas_q = empresas_q.filter(Empresa.id.in_(allowed))
    empresas = (
        empresas_q
        .order_by(Empresa.nombre.asc(), Empresa.id.asc())
        .all()
    )
    empresa_ref_by_id: dict[int, EmpresaRef] = {
        int(e.id): EmpresaRef(
            id=int(e.id),
            nombre=str(e.nombre),
            codigo_ree=(str(e.codigo_ree) if getattr(e, "codigo_ree", None) is not None else None),
        )
        for e in empresas
    }
    n_empresas = len(empresas)

    # Cargar TODAS las filas General de las empresas permitidas, una sola vez.
    # MedidaGeneral guarda agregados por punto+mes, así que sumamos en memoria.
    general_rows: list[MedidaGeneral] = []
    if allowed:
        general_rows = list(
            db.query(MedidaGeneral)
            .filter(
                MedidaGeneral.tenant_id == tenant_id,
                MedidaGeneral.empresa_id.in_(allowed),
            )
            .all()
        )

    # Agregar por (empresa, anio, mes) para todas las ventanas a la vez.
    # agg[(empresa, anio, mes)][ventana] = {"e": kwh, "p": perd_kwh}
    agg: dict[tuple[int, int, int], dict[VentanaCode, dict[str, float]]] = defaultdict(
        lambda: {v: {"e": 0.0, "p": 0.0} for v in VENTANAS}
    )
    for row in general_rows:
        key = (int(row.empresa_id), int(row.anio), int(row.mes))
        for ventana in VENTANAS:
            col_e, col_p, _ = VENTANA_COLS[ventana]
            e = _f(getattr(row, col_e, None))
            p = _f(getattr(row, col_p, None))
            if e > 0:
                agg[key][ventana]["e"] += e
                agg[key][ventana]["p"] += p

    # Determinar la "carga" del mes actual: tomamos el último (anio, mes) con
    # datos en M1 — eso indica qué publicación estamos viendo.
    todos_periodos_m1 = sorted(
        {
            (a, m)
            for (_, a, m), v in agg.items()
            if v["m1"]["e"] > 0
        },
        reverse=True,
    )
    if todos_periodos_m1:
        ultimo_m1_anio, ultimo_m1_mes = todos_periodos_m1[0]
    else:
        # Sin datos: devolvemos algo vacío pero coherente.
        ultimo_m1_anio, ultimo_m1_mes = 0, 0

    # El "mes de carga" es ultimo_m1 + 1 mes (M1 es +1m respecto a su publicación).
    carga_anio, carga_mes = _shift_mes(ultimo_m1_anio, ultimo_m1_mes, -1)

    # ----- Pipeline (5 tarjetas de ventana) -----
    pipeline: list[MensualGeneralVentanaCard] = []
    # Para cada ventana, el (anio, mes) objetivo = el que dice el calendario
    # REE (hito de cierre/publicación que cae dentro del mes natural de hoy).
    # Si el calendario no responde para alguna ventana, hacemos fallback al
    # último (anio, mes) con datos en BD para esa ventana.
    objetivo_calendario = _meses_objetivo_por_calendario_ree(db, tenant_id)
    ultimo_periodo_por_ventana: dict[VentanaCode, tuple[int, int] | None] = {}
    for ventana in VENTANAS:
        from_cal = objetivo_calendario.get(ventana)
        if from_cal is not None:
            ultimo_periodo_por_ventana[ventana] = from_cal
            continue
        periodos_v = sorted(
            {(a, m) for (_, a, m), v in agg.items() if v[ventana]["e"] > 0},
            reverse=True,
        )
        ultimo_periodo_por_ventana[ventana] = periodos_v[0] if periodos_v else None

    # Helper: ¿esta empresa tenía M1 publicado en (anio, mes)? Si no lo tenía,
    # significa que la empresa aún no operaba ese mes -> no se la cuenta como
    # pendiente ni se la incluye en el "total esperado" de regularizaciones.
    def _empresa_tenia_m1(emp_id: int, anio: int, mes: int) -> bool:
        v = agg.get((emp_id, anio, mes))
        return bool(v and v["m1"]["e"] > 0)

    for ventana in VENTANAS:
        ult = ultimo_periodo_por_ventana[ventana]
        if ult is None:
            pipeline.append(
                MensualGeneralVentanaCard(
                    ventana=ventana,
                    empresas_total=n_empresas,
                )
            )
            continue
        anio_v, mes_v = ult
        # Suma global y empresas con dato en ese mes para esa ventana.
        # Solo contamos como "total esperado" las empresas que YA operaban
        # ese mes (es decir, que tienen M1 publicado en ese (anio, mes)).
        # M1 no se filtra a sí mismo: en M1, esperadas = todas las empresas.
        total_e = 0.0
        total_p = 0.0
        empresas_con_dato = 0
        empresas_esperadas = 0
        for emp_id in allowed:
            v = agg.get((emp_id, anio_v, mes_v))
            # Para M1, todas las empresas son "esperadas".
            # Para M2/M7/M11/ART15, solo si tenían M1 en ese mes.
            if ventana == "m1" or _empresa_tenia_m1(emp_id, anio_v, mes_v):
                empresas_esperadas += 1
            if v is None:
                continue
            e = v[ventana]["e"]
            p = v[ventana]["p"]
            if e > 0:
                total_e += e
                total_p += p
                empresas_con_dato += 1
        pipeline.append(
            MensualGeneralVentanaCard(
                ventana=ventana,
                anio=anio_v,
                mes=mes_v,
                energia_kwh=round(total_e, 2),
                perdidas_pct=_safe_pct(total_p, total_e),
                empresas_con_dato=empresas_con_dato,
                empresas_total=empresas_esperadas,
            )
        )

    # ----- Detalle por empresa: 1 fila × 5 ventanas + despliegue 5 meses × 5 ventanas -----
    detalle_por_empresa: list[MensualGeneralEmpresaDetalle] = []
    for emp in empresas:
        emp_id = int(emp.id)
        celdas: dict[VentanaCode, MensualGeneralEmpresaVentanaCelda] = {}
        for ventana in VENTANAS:
            ult = ultimo_periodo_por_ventana[ventana]
            if ult is None:
                celdas[ventana] = MensualGeneralEmpresaVentanaCelda(pendiente=False)
                continue
            anio_v, mes_v = ult
            v = agg.get((emp_id, anio_v, mes_v))
            e = v[ventana]["e"] if v else 0.0
            p = v[ventana]["p"] if v else 0.0
            if e > 0:
                celdas[ventana] = MensualGeneralEmpresaVentanaCelda(
                    energia_kwh=round(e, 2),
                    perdidas_kwh=round(p, 2),
                    perdidas_pct=_safe_pct(p, e),
                    pendiente=False,
                )
            else:
                # Solo marcamos PENDIENTE si la empresa YA operaba ese mes
                # (tenía M1 publicado). Si no tenía M1, la empresa aún no
                # estaba activa -> celda vacía (no aplica), no pendiente.
                # M1 mismo siempre se marca pendiente si falta para una
                # empresa, porque es la primera ventana esperada.
                if ventana == "m1" or _empresa_tenia_m1(emp_id, anio_v, mes_v):
                    celdas[ventana] = MensualGeneralEmpresaVentanaCelda(pendiente=True)
                else:
                    celdas[ventana] = MensualGeneralEmpresaVentanaCelda(pendiente=False)

        # Despliegue: 5 meses afectados por la publicación = el último mes de cada ventana
        despliegue: list[MensualGeneralEmpresaDespliegueFila] = []
        meses_afectados: list[tuple[int, int]] = []
        for ventana in VENTANAS:
            ult = ultimo_periodo_por_ventana[ventana]
            if ult is not None and ult not in meses_afectados:
                meses_afectados.append(ult)
        # Ordenar de más reciente a más antiguo
        meses_afectados.sort(reverse=True)

        for anio_m, mes_m in meses_afectados:
            celdas_mes: dict[VentanaCode, MensualGeneralEmpresaDespliegueCelda] = {}
            v = agg.get((emp_id, anio_m, mes_m))
            for ventana in VENTANAS:
                e = v[ventana]["e"] if v else 0.0
                p = v[ventana]["p"] if v else 0.0
                if e > 0:
                    celdas_mes[ventana] = MensualGeneralEmpresaDespliegueCelda(
                        energia_kwh=round(e, 2),
                        perdidas_pct=_safe_pct(p, e),
                        es_ultima_publicacion=(
                            ultimo_periodo_por_ventana[ventana] == (anio_m, mes_m)
                        ),
                    )
                else:
                    celdas_mes[ventana] = MensualGeneralEmpresaDespliegueCelda()
            despliegue.append(
                MensualGeneralEmpresaDespliegueFila(
                    anio=anio_m,
                    mes=mes_m,
                    celdas=celdas_mes,
                )
            )

        detalle_por_empresa.append(
            MensualGeneralEmpresaDetalle(
                empresa=empresa_ref_by_id[emp_id],
                celdas=celdas,
                despliegue_meses=despliegue,
            )
        )

    general_block = MensualGeneralBlock(
        pipeline=pipeline,
        detalle_por_empresa=detalle_por_empresa,
    )

    # ----- Bloque PS -----
    # Determinar el último (anio, mes) con datos PS
    ps_rows: list[MedidaPS] = []
    if allowed:
        ps_rows = list(
            db.query(MedidaPS)
            .filter(
                MedidaPS.tenant_id == tenant_id,
                MedidaPS.empresa_id.in_(allowed),
            )
            .all()
        )

    # Agregar por (empresa, anio, mes) para PS
    ps_agg: dict[tuple[int, int, int], dict[str, dict[str, float]]] = defaultdict(
        lambda: {
            "totals": {"cups": 0.0, "energia": 0.0, "importe": 0.0},
            **{f"tarifa_{c}": {"cups": 0.0, "energia": 0.0, "importe": 0.0} for c in TARIFAS_CODES},
            **{f"tipo_{c}": {"cups": 0.0, "energia": 0.0, "importe": 0.0} for c in TIPOS_CODES},
        }
    )
    for row in ps_rows:
        key = (int(row.empresa_id), int(row.anio), int(row.mes))
        ps_agg[key]["totals"]["cups"] += _f(row.cups_total)
        ps_agg[key]["totals"]["energia"] += _f(row.energia_ps_total_kwh)
        ps_agg[key]["totals"]["importe"] += _f(row.importe_total_eur)
        for code in TARIFAS_CODES:
            col_c, col_e, col_i = PS_TARIFA_COLS[code]
            ps_agg[key][f"tarifa_{code}"]["cups"] += _f(getattr(row, col_c, 0))
            ps_agg[key][f"tarifa_{code}"]["energia"] += _f(getattr(row, col_e, 0))
            ps_agg[key][f"tarifa_{code}"]["importe"] += _f(getattr(row, col_i, 0))
        for code in TIPOS_CODES:
            col_c, col_e, col_i = PS_TIPO_COLS[code]
            ps_agg[key][f"tipo_{code}"]["cups"] += _f(getattr(row, col_c, 0))
            ps_agg[key][f"tipo_{code}"]["energia"] += _f(getattr(row, col_e, 0))
            ps_agg[key][f"tipo_{code}"]["importe"] += _f(getattr(row, col_i, 0))

    ps_periodos = sorted(
        {(a, m) for (_, a, m), _ in ps_agg.items()},
        reverse=True,
    )
    ps_anio, ps_mes = ps_periodos[0] if ps_periodos else (carga_anio, carga_mes)
    # Mes anterior para deltas
    ps_anio_prev, ps_mes_prev = _shift_mes(ps_anio, ps_mes, 1)

    # Suma global del mes actual y del anterior para los KPIs
    def _sum_periodo(a: int, m: int, key: str, field: str) -> float:
        total = 0.0
        for emp_id in allowed:
            block = ps_agg.get((emp_id, a, m))
            if block is not None:
                total += block[key][field]
        return total

    ps_kpis = MensualPSKpis(
        cups_total=int(round(_sum_periodo(ps_anio, ps_mes, "totals", "cups"))),
        cups_delta_vs_mes_anterior=int(round(
            _sum_periodo(ps_anio, ps_mes, "totals", "cups")
            - _sum_periodo(ps_anio_prev, ps_mes_prev, "totals", "cups")
        )) if ps_periodos else None,
        energia_kwh=round(_sum_periodo(ps_anio, ps_mes, "totals", "energia"), 2),
        energia_pct_vs_mes_anterior=(
            round(
                (_sum_periodo(ps_anio, ps_mes, "totals", "energia")
                 / max(_sum_periodo(ps_anio_prev, ps_mes_prev, "totals", "energia"), 1e-9)
                 - 1) * 100.0, 2
            )
            if _sum_periodo(ps_anio_prev, ps_mes_prev, "totals", "energia") > 0
            else None
        ),
        importe_eur=round(_sum_periodo(ps_anio, ps_mes, "totals", "importe"), 2),
        importe_pct_vs_mes_anterior=(
            round(
                (_sum_periodo(ps_anio, ps_mes, "totals", "importe")
                 / max(_sum_periodo(ps_anio_prev, ps_mes_prev, "totals", "importe"), 1e-9)
                 - 1) * 100.0, 2
            )
            if _sum_periodo(ps_anio_prev, ps_mes_prev, "totals", "importe") > 0
            else None
        ),
    )

    reparto_por_tarifa: list[MensualPSRepartoCard] = []
    for code in TARIFAS_CODES:
        reparto_por_tarifa.append(
            MensualPSRepartoCard(
                codigo=code,
                cups=int(round(_sum_periodo(ps_anio, ps_mes, f"tarifa_{code}", "cups"))),
                energia_kwh=round(_sum_periodo(ps_anio, ps_mes, f"tarifa_{code}", "energia"), 2),
                importe_eur=round(_sum_periodo(ps_anio, ps_mes, f"tarifa_{code}", "importe"), 2),
            )
        )
    reparto_por_tipo: list[MensualPSRepartoCard] = []
    for code in TIPOS_CODES:
        reparto_por_tipo.append(
            MensualPSRepartoCard(
                codigo=code,
                cups=int(round(_sum_periodo(ps_anio, ps_mes, f"tipo_{code}", "cups"))),
                energia_kwh=round(_sum_periodo(ps_anio, ps_mes, f"tipo_{code}", "energia"), 2),
                importe_eur=round(_sum_periodo(ps_anio, ps_mes, f"tipo_{code}", "importe"), 2),
            )
        )

    detalle_ps_empresa: list[MensualPSEmpresaDetalle] = []
    for emp in empresas:
        emp_id = int(emp.id)
        block = ps_agg.get((emp_id, ps_anio, ps_mes))
        por_tarifa: dict[str, MensualPSEmpresaCelda] = {}
        por_tipo: dict[str, MensualPSEmpresaCelda] = {}
        for code in TARIFAS_CODES:
            if block is not None and block[f"tarifa_{code}"]["cups"] > 0:
                por_tarifa[code] = MensualPSEmpresaCelda(
                    cups=int(round(block[f"tarifa_{code}"]["cups"])),
                    energia_kwh=round(block[f"tarifa_{code}"]["energia"], 2),
                    importe_eur=round(block[f"tarifa_{code}"]["importe"], 2),
                )
            else:
                por_tarifa[code] = MensualPSEmpresaCelda()
        for code in TIPOS_CODES:
            if block is not None and block[f"tipo_{code}"]["cups"] > 0:
                por_tipo[code] = MensualPSEmpresaCelda(
                    cups=int(round(block[f"tipo_{code}"]["cups"])),
                    energia_kwh=round(block[f"tipo_{code}"]["energia"], 2),
                    importe_eur=round(block[f"tipo_{code}"]["importe"], 2),
                )
            else:
                por_tipo[code] = MensualPSEmpresaCelda()
        detalle_ps_empresa.append(
            MensualPSEmpresaDetalle(
                empresa=empresa_ref_by_id[emp_id],
                por_tarifa=por_tarifa,
                por_tipo=por_tipo,
            )
        )

    # Cuántas empresas tienen PS para este (anio, mes)
    ps_empresas_con_dato = sum(
        1
        for emp_id in allowed
        if ps_agg.get((emp_id, ps_anio, ps_mes), {}).get("totals", {}).get("cups", 0) > 0
    )

    ps_block = MensualPSBlock(
        anio=ps_anio,
        mes=ps_mes,
        empresas_con_dato=ps_empresas_con_dato,
        empresas_total=n_empresas,
        kpis=ps_kpis,
        reparto=MensualPSRepartoBlock(
            por_tarifa=reparto_por_tarifa,
            por_tipo=reparto_por_tipo,
        ),
        detalle_por_empresa=detalle_ps_empresa,
    )

    # ----- Banda de salud -----
    ventanas_completas = sum(
        1 for c in pipeline if c.empresas_con_dato == c.empresas_total and c.empresas_total > 0
    )
    ventanas_total = len(VENTANAS)
    ficheros_recibidos = sum(c.empresas_con_dato for c in pipeline)
    ficheros_esperados = ventanas_total * n_empresas
    ps_completas = 1 if ps_empresas_con_dato == n_empresas and n_empresas > 0 else 0
    ps_total = 1

    # Resumen de lo que falta — agrupado por ventana/mes.
    # Devolvemos DOS formatos:
    #   - pendientes_grupos (estructurado): el frontend lo pinta con cabeceras en negrita
    #   - pendientes_resumen (texto plano): fallback de compatibilidad
    # Solo cuenta como falta si la empresa ya operaba ese mes (tenía M1).
    pendientes_grupos_raw: list[tuple[VentanaCode, int, int, list[str]]] = []
    for ventana in VENTANAS:
        card = next((c for c in pipeline if c.ventana == ventana), None)
        if not (card and card.empresas_con_dato < card.empresas_total and card.anio is not None):
            continue
        anio_v = card.anio
        mes_v = card.mes or 0
        empresas_faltantes: list[str] = []
        for emp in empresas:
            emp_id = int(emp.id)
            # Para ventanas distintas de M1, exigimos que la empresa
            # tuviera M1 publicado en ese mes. Si no, no se considera falta.
            if ventana != "m1" and not _empresa_tenia_m1(emp_id, anio_v, mes_v):
                continue
            v = agg.get((emp_id, anio_v, mes_v))
            if v is None or v[ventana]["e"] <= 0:
                empresas_faltantes.append(str(emp.nombre))
        if empresas_faltantes:
            pendientes_grupos_raw.append((ventana, anio_v, mes_v, empresas_faltantes))

    pendientes_grupos: list[MensualBandaPendienteGrupo] = []
    pendientes_resumen: str | None = None
    if pendientes_grupos_raw:
        # Buscar fechas de publicación en el calendario REE para todos los grupos
        fechas_pub = _fecha_publicacion_por_grupo(db, tenant_id, pendientes_grupos_raw)
        partes: list[str] = []
        for ventana, anio_v, mes_v, faltantes in pendientes_grupos_raw:
            label = f"falta {ventana.upper()} {_mes_corto(mes_v)} {anio_v}"
            fecha_pub = fechas_pub.get((ventana, anio_v, mes_v))
            pendientes_grupos.append(
                MensualBandaPendienteGrupo(
                    ventana=ventana,
                    anio=anio_v,
                    mes=mes_v,
                    label=label,
                    empresas=faltantes,
                    fecha_publicacion=fecha_pub,
                )
            )
            partes.append(f"{label}: {', '.join(faltantes)}")
        pendientes_resumen = " · ".join(partes)

    banda_salud = MensualBandaSalud(
        ficheros_recibidos=ficheros_recibidos,
        ficheros_esperados=ficheros_esperados,
        ventanas_completas=ventanas_completas,
        ventanas_total=ventanas_total,
        ps_completas=ps_completas,
        ps_total=ps_total,
        pendientes_resumen=pendientes_resumen,
        pendientes_grupos=pendientes_grupos,
    )

    return MensualResponse(
        carga_anio=carga_anio,
        carga_mes=carga_mes,
        banda_salud=banda_salud,
        general=general_block,
        ps=ps_block,
    )


# =====================================================================
# Endpoint HISTÓRICO
# =====================================================================

@router.get("/historico", response_model=HistoricoResponse)
def get_dashboard_tablas_historico(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HistoricoResponse:
    tenant_id = int(cast(int, current_user.tenant_id))
    allowed = get_allowed_empresa_ids(db, current_user)

    empresas = (
        db.query(Empresa)
        .filter(Empresa.tenant_id == tenant_id)
    )
    if not allowed:
        empresas = empresas.filter(sql_false())
    else:
        empresas = empresas.filter(Empresa.id.in_(allowed))
    empresas = empresas.order_by(Empresa.nombre.asc(), Empresa.id.asc()).all()
    empresa_ref_by_id: dict[int, EmpresaRef] = {
        int(e.id): EmpresaRef(
            id=int(e.id),
            nombre=str(e.nombre),
            codigo_ree=(str(e.codigo_ree) if getattr(e, "codigo_ree", None) is not None else None),
        )
        for e in empresas
    }

    # ----- Bloque GENERAL -----
    general_rows: list[MedidaGeneral] = []
    if allowed:
        general_rows = list(
            db.query(MedidaGeneral)
            .filter(
                MedidaGeneral.tenant_id == tenant_id,
                MedidaGeneral.empresa_id.in_(allowed),
            )
            .all()
        )

    # gen_agg[(empresa, anio, mes)][ventana] = {"e": kwh, "p": perd_kwh}
    gen_agg: dict[tuple[int, int, int], dict[VentanaCode, dict[str, float]]] = defaultdict(
        lambda: {v: {"e": 0.0, "p": 0.0} for v in VENTANAS}
    )
    for row in general_rows:
        key = (int(row.empresa_id), int(row.anio), int(row.mes))
        for ventana in VENTANAS:
            col_e, col_p, _ = VENTANA_COLS[ventana]
            e = _f(getattr(row, col_e, None))
            p = _f(getattr(row, col_p, None))
            if e > 0:
                gen_agg[key][ventana]["e"] += e
                gen_agg[key][ventana]["p"] += p

    # Helper: dado un dict {ventana: {e, p}}, devolver (e, p) de la mejor
    # ventana disponible siguiendo la jerarquía ART15 > M11 > M7 > M2 > M1.
    # M1 es lectura provisional, ART15 es definitivo. Usar la "mejor"
    # disponible refleja con más exactitud el valor real.
    JERARQUIA_VENTANAS: list[VentanaCode] = ["art15", "m11", "m7", "m2", "m1"]

    def _mejor_ventana(buckets: dict[VentanaCode, dict[str, float]]) -> tuple[float, float]:
        for v in JERARQUIA_VENTANAS:
            b = buckets.get(v)
            if b and b["e"] > 0:
                return (b["e"], b["p"])
        return (0.0, 0.0)

    # Años con datos en M1 (orden descendente, máx 5)
    anios_con_datos = sorted({a for (_, a, _), _ in gen_agg.items()}, reverse=True)
    anios_visibles = anios_con_datos[:5]

    # Tarjetas-año General
    general_anios: list[HistoricoGeneralAnioTarjeta] = []
    for anio in anios_visibles:
        meses_set = {m for (_, a, m) in gen_agg if a == anio}
        empresas_set = {e for (e, a, _) in gen_agg if a == anio}
        # Acumulamos energía y pérdidas usando la MEJOR ventana disponible
        # por (empresa, mes). ART15 > M11 > M7 > M2 > M1. Esto refleja la
        # realidad final, no la primera lectura provisional.
        e_mejor = 0.0
        p_mejor = 0.0
        meses_art15_cerrados: set[int] = set()
        for (emp_id, a, m), v in gen_agg.items():
            if a != anio:
                continue
            e_cell, p_cell = _mejor_ventana(v)
            e_mejor += e_cell
            p_mejor += p_cell
            if v["art15"]["e"] > 0:
                meses_art15_cerrados.add(m)

        # Estado del año
        n_meses = len(meses_set)
        n_art15 = len(meses_art15_cerrados)
        if n_art15 == 0 and not any(
            v["m2"]["e"] > 0 or v["m7"]["e"] > 0 or v["m11"]["e"] > 0
            for (_, a, _), v in gen_agg.items() if a == anio
        ):
            estado = "solo_m1"
        elif n_art15 == 12:
            estado = "cerrado"
        elif n_art15 > 0 or any(
            v["m11"]["e"] > 0 or v["m7"]["e"] > 0 or v["m2"]["e"] > 0
            for (_, a, _), v in gen_agg.items() if a == anio
        ):
            estado = "en_regularizacion"
        else:
            estado = "en_curso"
        # Año actual sin cierres -> en_curso
        if anio == anios_visibles[0] and n_art15 == 0 and n_meses < 12:
            estado = "en_curso"

        general_anios.append(
            HistoricoGeneralAnioTarjeta(
                anio=anio,
                estado=estado,  # type: ignore[arg-type]
                meses_con_dato=n_meses,
                empresas=len(empresas_set),
                energia_kwh=round(e_mejor, 2),
                perdidas_pct=_safe_pct(p_mejor, e_mejor),
                art15_meses_cerrados=n_art15,
                art15_meses_total=12,
            )
        )

    # Detalle por año (12 meses × 5 ventanas + desglose por empresa)
    detalle_general_anios: list[HistoricoGeneralAnioDetalle] = []
    for anio in anios_visibles:
        meses_fila: list[HistoricoGeneralMesFila] = []
        total_anio: dict[VentanaCode, dict[str, float]] = {
            v: {"e": 0.0, "p": 0.0} for v in VENTANAS
        }
        meses_anio_set = sorted({m for (_, a, m) in gen_agg if a == anio})
        for mes in meses_anio_set:
            # Suma global del mes para cada ventana
            celdas_mes: dict[VentanaCode, HistoricoGeneralMesCeldaVentana] = {}
            for ventana in VENTANAS:
                e_total = 0.0
                p_total = 0.0
                for emp_id in allowed:
                    v = gen_agg.get((emp_id, anio, mes))
                    if v is None:
                        continue
                    e_total += v[ventana]["e"]
                    p_total += v[ventana]["p"]
                if e_total > 0:
                    celdas_mes[ventana] = HistoricoGeneralMesCeldaVentana(
                        energia_kwh=round(e_total, 2),
                        perdidas_pct=_safe_pct(p_total, e_total),
                    )
                    total_anio[ventana]["e"] += e_total
                    total_anio[ventana]["p"] += p_total
                else:
                    celdas_mes[ventana] = HistoricoGeneralMesCeldaVentana()

            # Desglose por empresa de ese mes
            desglose: list[HistoricoGeneralMesEmpresaFila] = []
            for emp in empresas:
                emp_id = int(emp.id)
                v = gen_agg.get((emp_id, anio, mes))
                if v is None:
                    continue
                # Solo añadir empresa si tiene al menos una ventana con datos
                if not any(v[ventana]["e"] > 0 for ventana in VENTANAS):
                    continue
                celdas_emp: dict[VentanaCode, HistoricoGeneralMesCeldaVentana] = {}
                for ventana in VENTANAS:
                    e = v[ventana]["e"]
                    p = v[ventana]["p"]
                    if e > 0:
                        celdas_emp[ventana] = HistoricoGeneralMesCeldaVentana(
                            energia_kwh=round(e, 2),
                            perdidas_pct=_safe_pct(p, e),
                        )
                    else:
                        celdas_emp[ventana] = HistoricoGeneralMesCeldaVentana()
                desglose.append(
                    HistoricoGeneralMesEmpresaFila(
                        empresa=empresa_ref_by_id[emp_id],
                        celdas=celdas_emp,
                    )
                )

            meses_fila.append(
                HistoricoGeneralMesFila(
                    anio=anio,
                    mes=mes,
                    celdas=celdas_mes,
                    desglose_por_empresa=desglose,
                )
            )

        # Total del año
        total_celdas: dict[VentanaCode, HistoricoGeneralMesCeldaVentana] = {}
        for ventana in VENTANAS:
            e = total_anio[ventana]["e"]
            p = total_anio[ventana]["p"]
            if e > 0:
                total_celdas[ventana] = HistoricoGeneralMesCeldaVentana(
                    energia_kwh=round(e, 2),
                    perdidas_pct=_safe_pct(p, e),
                )
            else:
                total_celdas[ventana] = HistoricoGeneralMesCeldaVentana()

        detalle_general_anios.append(
            HistoricoGeneralAnioDetalle(
                anio=anio,
                meses=meses_fila,
                total=total_celdas,
            )
        )

    # ----- Desglose por empresa General -----
    # Para cada empresa visible, replicamos la lógica de tarjetas-año + detalle
    # mes a mes, pero filtrando los datos a esa empresa concreta.
    general_por_empresa: list[HistoricoGeneralEmpresaDetalle] = []
    for emp in empresas:
        emp_id = int(emp.id)

        # Tarjetas-año pequeñas (5 años, una por año visible)
        emp_anios: list[HistoricoGeneralEmpresaAnioTarjeta] = []
        # Detalle precalculado por año
        emp_detalle_anios: list[HistoricoGeneralAnioDetalle] = []

        for anio in anios_visibles:
            # Meses con datos para esta empresa en este año
            meses_emp = sorted(
                {m for (e, a, m), v in gen_agg.items()
                 if e == emp_id and a == anio
                 and any(v[ventana]["e"] > 0 for ventana in VENTANAS)}
            )
            # Sumas usando la MEJOR ventana disponible por mes (jerarquía
            # ART15 > M11 > M7 > M2 > M1) — refleja la realidad final, no
            # la primera lectura provisional.
            e_mejor_emp = 0.0
            p_mejor_emp = 0.0
            art15_cerrados_emp: set[int] = set()
            for (e, a, m), v in gen_agg.items():
                if e != emp_id or a != anio:
                    continue
                e_cell, p_cell = _mejor_ventana(v)
                e_mejor_emp += e_cell
                p_mejor_emp += p_cell
                if v["art15"]["e"] > 0:
                    art15_cerrados_emp.add(m)

            sin_datos = len(meses_emp) == 0
            emp_anios.append(
                HistoricoGeneralEmpresaAnioTarjeta(
                    anio=anio,
                    meses_con_dato=len(meses_emp),
                    energia_kwh=round(e_mejor_emp, 2),
                    perdidas_pct=_safe_pct(p_mejor_emp, e_mejor_emp),
                    art15_meses_cerrados=len(art15_cerrados_emp),
                    art15_meses_total=12,
                    sin_datos=sin_datos,
                )
            )

            # Si no tiene datos, no incluimos detalle para este año
            if sin_datos:
                continue

            # Detalle 12 meses × 5 ventanas para esta empresa concreta
            meses_fila_emp: list[HistoricoGeneralMesFila] = []
            total_anio_emp: dict[VentanaCode, dict[str, float]] = {
                v: {"e": 0.0, "p": 0.0} for v in VENTANAS
            }
            for mes in meses_emp:
                celdas_mes_emp: dict[VentanaCode, HistoricoGeneralMesCeldaVentana] = {}
                v = gen_agg.get((emp_id, anio, mes))
                for ventana in VENTANAS:
                    e = v[ventana]["e"] if v else 0.0
                    p = v[ventana]["p"] if v else 0.0
                    if e > 0:
                        celdas_mes_emp[ventana] = HistoricoGeneralMesCeldaVentana(
                            energia_kwh=round(e, 2),
                            perdidas_pct=_safe_pct(p, e),
                        )
                        total_anio_emp[ventana]["e"] += e
                        total_anio_emp[ventana]["p"] += p
                    else:
                        celdas_mes_emp[ventana] = HistoricoGeneralMesCeldaVentana()

                # Desglose por empresa: una sola entrada (la propia empresa)
                # para mantener compatibilidad con HistoricoGeneralMesFila.
                desglose_propio: list[HistoricoGeneralMesEmpresaFila] = [
                    HistoricoGeneralMesEmpresaFila(
                        empresa=empresa_ref_by_id[emp_id],
                        celdas=celdas_mes_emp,
                    )
                ]

                meses_fila_emp.append(
                    HistoricoGeneralMesFila(
                        anio=anio,
                        mes=mes,
                        celdas=celdas_mes_emp,
                        desglose_por_empresa=desglose_propio,
                    )
                )

            total_celdas_emp: dict[VentanaCode, HistoricoGeneralMesCeldaVentana] = {}
            for ventana in VENTANAS:
                e = total_anio_emp[ventana]["e"]
                p = total_anio_emp[ventana]["p"]
                if e > 0:
                    total_celdas_emp[ventana] = HistoricoGeneralMesCeldaVentana(
                        energia_kwh=round(e, 2),
                        perdidas_pct=_safe_pct(p, e),
                    )
                else:
                    total_celdas_emp[ventana] = HistoricoGeneralMesCeldaVentana()

            emp_detalle_anios.append(
                HistoricoGeneralAnioDetalle(
                    anio=anio,
                    meses=meses_fila_emp,
                    total=total_celdas_emp,
                )
            )

        general_por_empresa.append(
            HistoricoGeneralEmpresaDetalle(
                empresa=empresa_ref_by_id[emp_id],
                anios=emp_anios,
                detalle_anios=emp_detalle_anios,
            )
        )

    general_block = HistoricoGeneralBlock(
        anios=general_anios,
        detalle_anios=detalle_general_anios,
        por_empresa=general_por_empresa,
    )

    # ----- Bloque PS -----
    ps_rows: list[MedidaPS] = []
    if allowed:
        ps_rows = list(
            db.query(MedidaPS)
            .filter(
                MedidaPS.tenant_id == tenant_id,
                MedidaPS.empresa_id.in_(allowed),
            )
            .all()
        )
    ps_agg2: dict[tuple[int, int, int], dict[str, dict[str, float]]] = defaultdict(
        lambda: {
            "totals": {"cups": 0.0, "energia": 0.0, "importe": 0.0},
            **{f"tarifa_{c}": {"cups": 0.0, "energia": 0.0, "importe": 0.0} for c in TARIFAS_CODES},
            **{f"tipo_{c}": {"cups": 0.0, "energia": 0.0, "importe": 0.0} for c in TIPOS_CODES},
        }
    )
    for row in ps_rows:
        key = (int(row.empresa_id), int(row.anio), int(row.mes))
        ps_agg2[key]["totals"]["cups"] += _f(row.cups_total)
        ps_agg2[key]["totals"]["energia"] += _f(row.energia_ps_total_kwh)
        ps_agg2[key]["totals"]["importe"] += _f(row.importe_total_eur)
        for code in TARIFAS_CODES:
            col_c, col_e, col_i = PS_TARIFA_COLS[code]
            ps_agg2[key][f"tarifa_{code}"]["cups"] += _f(getattr(row, col_c, 0))
            ps_agg2[key][f"tarifa_{code}"]["energia"] += _f(getattr(row, col_e, 0))
            ps_agg2[key][f"tarifa_{code}"]["importe"] += _f(getattr(row, col_i, 0))
        for code in TIPOS_CODES:
            col_c, col_e, col_i = PS_TIPO_COLS[code]
            ps_agg2[key][f"tipo_{code}"]["cups"] += _f(getattr(row, col_c, 0))
            ps_agg2[key][f"tipo_{code}"]["energia"] += _f(getattr(row, col_e, 0))
            ps_agg2[key][f"tipo_{code}"]["importe"] += _f(getattr(row, col_i, 0))

    anios_ps_con_datos = sorted({a for (_, a, _) in ps_agg2}, reverse=True)
    anios_ps_visibles = anios_ps_con_datos[:5]

    ps_anios: list[HistoricoPSAnioTarjeta] = []
    detalle_ps_anios: list[HistoricoPSAnioDetalle] = []
    hoy_anio = max(anios_ps_visibles) if anios_ps_visibles else 0

    for anio in anios_ps_visibles:
        meses_set = sorted({m for (_, a, m) in ps_agg2 if a == anio})
        empresas_set = {e for (e, a, _) in ps_agg2 if a == anio}
        # Mes "final del año" = el último mes con dato del año
        mes_final = meses_set[-1] if meses_set else None

        # CUPS al final del año = suma del último mes de todas las empresas
        cups_final = 0.0
        if mes_final is not None:
            for emp_id in allowed:
                cups_final += ps_agg2.get((emp_id, anio, mes_final), {}).get("totals", {}).get("cups", 0.0)

        # Energía y € acumulados del año (suma todos los meses)
        e_anio = 0.0
        i_anio = 0.0
        for (_, a, _), block in ps_agg2.items():
            if a == anio:
                e_anio += block["totals"]["energia"]
                i_anio += block["totals"]["importe"]

        estado_ps: str = "en_curso" if (anio == hoy_anio and len(meses_set) < 12) else "cerrado"

        ps_anios.append(
            HistoricoPSAnioTarjeta(
                anio=anio,
                estado=estado_ps,  # type: ignore[arg-type]
                meses_con_dato=len(meses_set),
                empresas=len(empresas_set),
                cups_final_anio=int(round(cups_final)),
                energia_kwh=round(e_anio, 2),
                importe_eur=round(i_anio, 2),
            )
        )

        # Detalle: 12 meses × tarifa/tipo
        meses_fila_ps: list[HistoricoPSMesFila] = []
        for mes in meses_set:
            cups_mes = 0.0
            por_tarifa_mes: dict[str, MensualPSEmpresaCelda] = {}
            por_tipo_mes: dict[str, MensualPSEmpresaCelda] = {}
            # Sumar todas las empresas para ese (anio, mes)
            tarifa_acc: dict[str, dict[str, float]] = {
                c: {"cups": 0.0, "energia": 0.0, "importe": 0.0} for c in TARIFAS_CODES
            }
            tipo_acc: dict[str, dict[str, float]] = {
                c: {"cups": 0.0, "energia": 0.0, "importe": 0.0} for c in TIPOS_CODES
            }
            for emp_id in allowed:
                block = ps_agg2.get((emp_id, anio, mes))
                if block is None:
                    continue
                cups_mes += block["totals"]["cups"]
                for code in TARIFAS_CODES:
                    tarifa_acc[code]["cups"] += block[f"tarifa_{code}"]["cups"]
                    tarifa_acc[code]["energia"] += block[f"tarifa_{code}"]["energia"]
                    tarifa_acc[code]["importe"] += block[f"tarifa_{code}"]["importe"]
                for code in TIPOS_CODES:
                    tipo_acc[code]["cups"] += block[f"tipo_{code}"]["cups"]
                    tipo_acc[code]["energia"] += block[f"tipo_{code}"]["energia"]
                    tipo_acc[code]["importe"] += block[f"tipo_{code}"]["importe"]

            for code in TARIFAS_CODES:
                por_tarifa_mes[code] = MensualPSEmpresaCelda(
                    cups=int(round(tarifa_acc[code]["cups"])),
                    energia_kwh=round(tarifa_acc[code]["energia"], 2),
                    importe_eur=round(tarifa_acc[code]["importe"], 2),
                )
            for code in TIPOS_CODES:
                por_tipo_mes[code] = MensualPSEmpresaCelda(
                    cups=int(round(tipo_acc[code]["cups"])),
                    energia_kwh=round(tipo_acc[code]["energia"], 2),
                    importe_eur=round(tipo_acc[code]["importe"], 2),
                )

            meses_fila_ps.append(
                HistoricoPSMesFila(
                    anio=anio,
                    mes=mes,
                    cups=int(round(cups_mes)),
                    por_tarifa=por_tarifa_mes,
                    por_tipo=por_tipo_mes,
                )
            )

        # Total año
        total_anio_celda = MensualPSEmpresaCelda(
            cups=int(round(cups_final)),
            energia_kwh=round(e_anio, 2),
            importe_eur=round(i_anio, 2),
        )

        detalle_ps_anios.append(
            HistoricoPSAnioDetalle(
                anio=anio,
                meses=meses_fila_ps,
                total=total_anio_celda,
            )
        )

    # ----- Desglose por empresa PS -----
    ps_por_empresa: list[HistoricoPSEmpresaDetalle] = []
    for emp in empresas:
        emp_id = int(emp.id)

        emp_anios_ps: list[HistoricoPSEmpresaAnioTarjeta] = []
        emp_detalle_anios_ps: list[HistoricoPSAnioDetalle] = []

        for anio in anios_ps_visibles:
            # Meses de esta empresa en este año
            meses_emp_ps = sorted(
                {m for (e, a, m) in ps_agg2 if e == emp_id and a == anio}
            )
            mes_final_emp = meses_emp_ps[-1] if meses_emp_ps else None

            # CUPS al final = del último mes
            cups_final_emp = 0.0
            if mes_final_emp is not None:
                cups_final_emp = ps_agg2.get((emp_id, anio, mes_final_emp), {}) \
                    .get("totals", {}).get("cups", 0.0)

            # Energía e importe del año (suma de todos los meses)
            e_anio_emp = 0.0
            i_anio_emp = 0.0
            for (e, a, _), block in ps_agg2.items():
                if e == emp_id and a == anio:
                    e_anio_emp += block["totals"]["energia"]
                    i_anio_emp += block["totals"]["importe"]

            sin_datos_ps = len(meses_emp_ps) == 0
            emp_anios_ps.append(
                HistoricoPSEmpresaAnioTarjeta(
                    anio=anio,
                    meses_con_dato=len(meses_emp_ps),
                    cups_final_anio=int(round(cups_final_emp)),
                    energia_kwh=round(e_anio_emp, 2),
                    importe_eur=round(i_anio_emp, 2),
                    sin_datos=sin_datos_ps,
                )
            )

            if sin_datos_ps:
                continue

            # Detalle mes a mes para esta empresa
            meses_fila_emp_ps: list[HistoricoPSMesFila] = []
            for mes in meses_emp_ps:
                block = ps_agg2.get((emp_id, anio, mes))
                if block is None:
                    continue
                cups_mes = block["totals"]["cups"]
                por_tarifa_mes_emp: dict[str, MensualPSEmpresaCelda] = {}
                por_tipo_mes_emp: dict[str, MensualPSEmpresaCelda] = {}
                for code in TARIFAS_CODES:
                    por_tarifa_mes_emp[code] = MensualPSEmpresaCelda(
                        cups=int(round(block[f"tarifa_{code}"]["cups"])),
                        energia_kwh=round(block[f"tarifa_{code}"]["energia"], 2),
                        importe_eur=round(block[f"tarifa_{code}"]["importe"], 2),
                    )
                for code in TIPOS_CODES:
                    por_tipo_mes_emp[code] = MensualPSEmpresaCelda(
                        cups=int(round(block[f"tipo_{code}"]["cups"])),
                        energia_kwh=round(block[f"tipo_{code}"]["energia"], 2),
                        importe_eur=round(block[f"tipo_{code}"]["importe"], 2),
                    )
                meses_fila_emp_ps.append(
                    HistoricoPSMesFila(
                        anio=anio,
                        mes=mes,
                        cups=int(round(cups_mes)),
                        por_tarifa=por_tarifa_mes_emp,
                        por_tipo=por_tipo_mes_emp,
                    )
                )

            total_emp_ps = MensualPSEmpresaCelda(
                cups=int(round(cups_final_emp)),
                energia_kwh=round(e_anio_emp, 2),
                importe_eur=round(i_anio_emp, 2),
            )

            emp_detalle_anios_ps.append(
                HistoricoPSAnioDetalle(
                    anio=anio,
                    meses=meses_fila_emp_ps,
                    total=total_emp_ps,
                )
            )

        ps_por_empresa.append(
            HistoricoPSEmpresaDetalle(
                empresa=empresa_ref_by_id[emp_id],
                anios=emp_anios_ps,
                detalle_anios=emp_detalle_anios_ps,
            )
        )

    ps_block = HistoricoPSBlock(
        anios=ps_anios,
        detalle_anios=detalle_ps_anios,
        por_empresa=ps_por_empresa,
    )

    return HistoricoResponse(
        anios_visibles=anios_visibles,
        general=general_block,
        ps=ps_block,
    )


# =====================================================================
# Helpers menores
# =====================================================================

_MESES_CORTOS = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def _mes_corto(mes: int) -> str:
    if 1 <= mes <= 12:
        return _MESES_CORTOS[mes]
    return "?"