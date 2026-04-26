# app/dashboard_tablas/routes.py
# pyright: reportMissingImports=false, reportArgumentType=false, reportOperatorIssue=false
from __future__ import annotations

from collections import defaultdict
from typing import Any, cast

from fastapi import APIRouter, Depends
from sqlalchemy import false as sql_false
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
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
# Permisos y tenant — copiamos el patrón EXACTO de dashboard/routes.py
# =====================================================================

def _allowed_empresa_ids(db: Session, current_user: User) -> list[int]:
    tenant_id = int(cast(int, current_user.tenant_id))

    if bool(getattr(current_user, "is_superuser", False)):
        rows = (
            db.query(Empresa.id)
            .filter(Empresa.tenant_id == tenant_id)
            .order_by(Empresa.id.asc())
            .all()
        )
        return [int(row[0]) for row in rows if row and row[0] is not None]

    raw_ids = getattr(current_user, "empresa_ids_permitidas", None)
    explicit_ids = [int(x) for x in raw_ids if x is not None] if raw_ids else []
    if explicit_ids:
        return explicit_ids

    return []


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


# =====================================================================
# Endpoint MENSUAL
# =====================================================================

@router.get("/mensual", response_model=MensualResponse)
def get_dashboard_tablas_mensual(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MensualResponse:
    tenant_id = int(cast(int, current_user.tenant_id))
    allowed = _allowed_empresa_ids(db, current_user)

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
    # Para cada ventana, encontramos su último (anio,mes) con datos
    ultimo_periodo_por_ventana: dict[VentanaCode, tuple[int, int] | None] = {}
    for ventana in VENTANAS:
        periodos_v = sorted(
            {(a, m) for (_, a, m), v in agg.items() if v[ventana]["e"] > 0},
            reverse=True,
        )
        ultimo_periodo_por_ventana[ventana] = periodos_v[0] if periodos_v else None

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
        # Suma global y empresas con dato en ese mes para esa ventana
        total_e = 0.0
        total_p = 0.0
        empresas_con_dato = 0
        for emp_id in allowed:
            v = agg.get((emp_id, anio_v, mes_v))
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
                empresas_total=n_empresas,
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
                # Esa ventana ya está publicada para otras empresas
                # pero esta empresa aún no la tiene -> pendiente.
                celdas[ventana] = MensualGeneralEmpresaVentanaCelda(pendiente=True)

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

    # Resumen textual de lo que falta (1 línea, máximo 1 ejemplo)
    pendientes_resumen: str | None = None
    for ventana in VENTANAS:
        card = next((c for c in pipeline if c.ventana == ventana), None)
        if card and card.empresas_con_dato < card.empresas_total and card.anio is not None:
            # Buscar la primera empresa que falta
            for emp in empresas:
                emp_id = int(emp.id)
                v = agg.get((emp_id, card.anio, card.mes or 0))
                if v is None or v[ventana]["e"] <= 0:
                    pendientes_resumen = (
                        f"falta {emp.nombre} {ventana.upper()} "
                        f"{_mes_corto(card.mes or 0)} {card.anio}"
                    )
                    break
            if pendientes_resumen:
                break

    banda_salud = MensualBandaSalud(
        ficheros_recibidos=ficheros_recibidos,
        ficheros_esperados=ficheros_esperados,
        ventanas_completas=ventanas_completas,
        ventanas_total=ventanas_total,
        ps_completas=ps_completas,
        ps_total=ps_total,
        pendientes_resumen=pendientes_resumen,
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
    allowed = _allowed_empresa_ids(db, current_user)

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

    # Años con datos en M1 (orden descendente, máx 5)
    anios_con_datos = sorted({a for (_, a, _), _ in gen_agg.items()}, reverse=True)
    anios_visibles = anios_con_datos[:5]

    # Tarjetas-año General
    general_anios: list[HistoricoGeneralAnioTarjeta] = []
    for anio in anios_visibles:
        meses_set = {m for (_, a, m) in gen_agg if a == anio}
        empresas_set = {e for (e, a, _) in gen_agg if a == anio}
        # Suma M1 del año + ART15 cerrados
        e_m1 = 0.0
        p_m1 = 0.0
        meses_art15_cerrados: set[int] = set()
        for (emp_id, a, m), v in gen_agg.items():
            if a != anio:
                continue
            e_m1 += v["m1"]["e"]
            p_m1 += v["m1"]["p"]
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
                energia_kwh=round(e_m1, 2),
                perdidas_pct=_safe_pct(p_m1, e_m1),
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
            # Sumas M1 + ART15 cerrados, solo de esta empresa
            e_m1_emp = 0.0
            p_m1_emp = 0.0
            art15_cerrados_emp: set[int] = set()
            for (e, a, m), v in gen_agg.items():
                if e != emp_id or a != anio:
                    continue
                e_m1_emp += v["m1"]["e"]
                p_m1_emp += v["m1"]["p"]
                if v["art15"]["e"] > 0:
                    art15_cerrados_emp.add(m)

            sin_datos = len(meses_emp) == 0
            emp_anios.append(
                HistoricoGeneralEmpresaAnioTarjeta(
                    anio=anio,
                    meses_con_dato=len(meses_emp),
                    energia_kwh=round(e_m1_emp, 2),
                    perdidas_pct=_safe_pct(p_m1_emp, e_m1_emp),
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