# app/measures/services/ps.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from typing import Iterable, Dict, Any, cast
import math
import re

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.measures.models import MedidaPS
from app.measures.ps_models import PSPeriodContribution
from app.measures.ps_detail_models import PSPeriodDetail
from app.ingestion.models import IngestionFile

from app.measures.services.common import (
    _to_date,
    _to_float,
    _safe_refresh,
    _extraer_periodo_principal_de_fichero,
    _periodo_objetivo_m1_desde_periodo_principal,
    _file_id,
)


# ---------- constantes ----------

TARIFA_MAP: dict[str, str] = {
    "2.0TD": "20td",
    "3.0TD": "30td",
    "3.0TDVE": "30tdve",
    "6.1TD": "61td",
    "6.2TD": "62td",
    "6.3TD": "63td",
    "6.4TD": "64td",
}


# ---------- extractores de campos PS ----------


def _ps_poliza(f: Dict[str, Any]) -> str:
    raw = f.get("Poliza", "")
    if raw is None:
        return ""

    s = str(raw).strip()
    if not s:
        return ""

    try:
        num = float(s.replace(",", "."))
        if not math.isnan(num) and not math.isinf(num):
            num_rounded = int(round(num))
            if 1 <= num_rounded <= 5:
                return str(num_rounded)
    except (TypeError, ValueError):
        pass

    m_pol = re.search(r"[1-5]", s)
    if m_pol:
        return m_pol.group(0)

    return ""


def _ps_tarifa(f: Dict[str, Any]) -> str:
    return str(f.get("Tarifa_acceso", "")).strip().upper()


def _ps_cups(f: Dict[str, Any]) -> str:
    return str(f.get("CUPS", "")).strip()


# ---------- agregado PS ----------


def _empty_ps_aggregate() -> dict[str, float | int]:
    return {
        "energia_ps_tipo_1_kwh": 0.0,
        "energia_ps_tipo_2_kwh": 0.0,
        "energia_ps_tipo_3_kwh": 0.0,
        "energia_ps_tipo_4_kwh": 0.0,
        "energia_ps_tipo_5_kwh": 0.0,
        "energia_ps_total_kwh": 0.0,
        "cups_tipo_1": 0,
        "cups_tipo_2": 0,
        "cups_tipo_3": 0,
        "cups_tipo_4": 0,
        "cups_tipo_5": 0,
        "cups_total": 0,
        "importe_tipo_1_eur": 0.0,
        "importe_tipo_2_eur": 0.0,
        "importe_tipo_3_eur": 0.0,
        "importe_tipo_4_eur": 0.0,
        "importe_tipo_5_eur": 0.0,
        "importe_total_eur": 0.0,
        "energia_tarifa_20td_kwh": 0.0,
        "cups_tarifa_20td": 0,
        "importe_tarifa_20td_eur": 0.0,
        "energia_tarifa_30td_kwh": 0.0,
        "cups_tarifa_30td": 0,
        "importe_tarifa_30td_eur": 0.0,
        "energia_tarifa_30tdve_kwh": 0.0,
        "cups_tarifa_30tdve": 0,
        "importe_tarifa_30tdve_eur": 0.0,
        "energia_tarifa_61td_kwh": 0.0,
        "cups_tarifa_61td": 0,
        "importe_tarifa_61td_eur": 0.0,
        "energia_tarifa_62td_kwh": 0.0,
        "cups_tarifa_62td": 0,
        "importe_tarifa_62td_eur": 0.0,
        "energia_tarifa_63td_kwh": 0.0,
        "cups_tarifa_63td": 0,
        "importe_tarifa_63td_eur": 0.0,
        "energia_tarifa_64td_kwh": 0.0,
        "cups_tarifa_64td": 0,
        "importe_tarifa_64td_eur": 0.0,
    }


def _aggregate_ps_items(
    items: list[Any],
    *,
    get_cups: Any,
    get_poliza: Any,
    get_tarifa: Any,
    get_energia: Any,
    get_importe: Any,
) -> dict[str, float | int]:
    """Núcleo de agregación PS reutilizado por _build_ps_aggregate_from_rows
    y _aggregate_ps_detail_rows. Recibe callables de extracción para cada campo."""

    energia_por_tipo: dict[int, float] = {i: 0.0 for i in range(1, 6)}
    cups_por_tipo: dict[int, set[str]] = {i: set() for i in range(1, 6)}
    importe_por_tipo: dict[int, float] = {i: 0.0 for i in range(1, 6)}

    energia_total = 0.0
    importe_total = 0.0
    cups_total_set: set[str] = set()

    energia_tarifa: dict[str, float] = {k: 0.0 for k in TARIFA_MAP.values()}
    cups_tarifa: dict[str, set[str]] = {k: set() for k in TARIFA_MAP.values()}
    importe_tarifa: dict[str, float] = {k: 0.0 for k in TARIFA_MAP.values()}

    for item in items:
        cups = get_cups(item)
        poliza = get_poliza(item)
        tarifa = get_tarifa(item)
        energia = get_energia(item)
        importe = get_importe(item)

        energia_total += energia
        importe_total += importe

        if cups:
            cups_total_set.add(cups)

        if poliza in {"1", "2", "3", "4", "5"}:
            tipo = int(poliza)
            energia_por_tipo[tipo] += energia
            importe_por_tipo[tipo] += importe
            if cups:
                cups_por_tipo[tipo].add(cups)

        sufijo = TARIFA_MAP.get(tarifa)
        if sufijo:
            energia_tarifa[sufijo] += energia
            importe_tarifa[sufijo] += importe
            if cups:
                cups_tarifa[sufijo].add(cups)

    return {
        "energia_ps_tipo_1_kwh": energia_por_tipo[1],
        "energia_ps_tipo_2_kwh": energia_por_tipo[2],
        "energia_ps_tipo_3_kwh": energia_por_tipo[3],
        "energia_ps_tipo_4_kwh": energia_por_tipo[4],
        "energia_ps_tipo_5_kwh": energia_por_tipo[5],
        "energia_ps_total_kwh": energia_total,
        "cups_tipo_1": len(cups_por_tipo[1]),
        "cups_tipo_2": len(cups_por_tipo[2]),
        "cups_tipo_3": len(cups_por_tipo[3]),
        "cups_tipo_4": len(cups_por_tipo[4]),
        "cups_tipo_5": len(cups_por_tipo[5]),
        "cups_total": len(cups_total_set),
        "importe_tipo_1_eur": importe_por_tipo[1],
        "importe_tipo_2_eur": importe_por_tipo[2],
        "importe_tipo_3_eur": importe_por_tipo[3],
        "importe_tipo_4_eur": importe_por_tipo[4],
        "importe_tipo_5_eur": importe_por_tipo[5],
        "importe_total_eur": importe_total,
        "energia_tarifa_20td_kwh": energia_tarifa["20td"],
        "cups_tarifa_20td": len(cups_tarifa["20td"]),
        "importe_tarifa_20td_eur": importe_tarifa["20td"],
        "energia_tarifa_30td_kwh": energia_tarifa["30td"],
        "cups_tarifa_30td": len(cups_tarifa["30td"]),
        "importe_tarifa_30td_eur": importe_tarifa["30td"],
        "energia_tarifa_30tdve_kwh": energia_tarifa["30tdve"],
        "cups_tarifa_30tdve": len(cups_tarifa["30tdve"]),
        "importe_tarifa_30tdve_eur": importe_tarifa["30tdve"],
        "energia_tarifa_61td_kwh": energia_tarifa["61td"],
        "cups_tarifa_61td": len(cups_tarifa["61td"]),
        "importe_tarifa_61td_eur": importe_tarifa["61td"],
        "energia_tarifa_62td_kwh": energia_tarifa["62td"],
        "cups_tarifa_62td": len(cups_tarifa["62td"]),
        "importe_tarifa_62td_eur": importe_tarifa["62td"],
        "energia_tarifa_63td_kwh": energia_tarifa["63td"],
        "cups_tarifa_63td": len(cups_tarifa["63td"]),
        "importe_tarifa_63td_eur": importe_tarifa["63td"],
        "energia_tarifa_64td_kwh": energia_tarifa["64td"],
        "cups_tarifa_64td": len(cups_tarifa["64td"]),
        "importe_tarifa_64td_eur": importe_tarifa["64td"],
    }


def _build_ps_aggregate_from_rows(filas: list[Dict[str, Any]]) -> dict[str, float | int]:
    return _aggregate_ps_items(
        filas,
        get_cups=_ps_cups,
        get_poliza=_ps_poliza,
        get_tarifa=_ps_tarifa,
        get_energia=lambda f: _to_float(f.get("Energia_facturada")),
        get_importe=lambda f: _to_float(f.get("Total")),
    )


def _aggregate_ps_detail_rows(detail_rows: list[PSPeriodDetail]) -> dict[str, float | int]:
    return _aggregate_ps_items(
        detail_rows,
        get_cups=lambda r: str(getattr(r, "cups", "") or "").strip(),
        get_poliza=lambda r: str(getattr(r, "poliza", "") or "").strip(),
        get_tarifa=lambda r: str(getattr(r, "tarifa_acceso", "") or "").strip().upper(),
        get_energia=lambda r: float(getattr(r, "energia_facturada_kwh", 0.0) or 0.0),
        get_importe=lambda r: float(getattr(r, "importe_total_eur", 0.0) or 0.0),
    )


# ---------- helpers de BD PS ----------


def _sum_contribuciones_ps(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> dict[str, float | int]:
    row = (
        db.query(
            func.coalesce(func.sum(PSPeriodContribution.energia_ps_tipo_1_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_ps_tipo_2_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_ps_tipo_3_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_ps_tipo_4_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_ps_tipo_5_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_ps_total_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tipo_1), 0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tipo_2), 0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tipo_3), 0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tipo_4), 0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tipo_5), 0),
            func.coalesce(func.sum(PSPeriodContribution.cups_total), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tipo_1_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tipo_2_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tipo_3_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tipo_4_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tipo_5_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.importe_total_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_tarifa_20td_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tarifa_20td), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tarifa_20td_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_tarifa_30td_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tarifa_30td), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tarifa_30td_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_tarifa_30tdve_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tarifa_30tdve), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tarifa_30tdve_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_tarifa_61td_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tarifa_61td), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tarifa_61td_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_tarifa_62td_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tarifa_62td), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tarifa_62td_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_tarifa_63td_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tarifa_63td), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tarifa_63td_eur), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.energia_tarifa_64td_kwh), 0.0),
            func.coalesce(func.sum(PSPeriodContribution.cups_tarifa_64td), 0),
            func.coalesce(func.sum(PSPeriodContribution.importe_tarifa_64td_eur), 0.0),
        )
        .filter(
            PSPeriodContribution.tenant_id == tenant_id,
            PSPeriodContribution.empresa_id == empresa_id,
            PSPeriodContribution.anio == anio,
            PSPeriodContribution.mes == mes,
        )
        .one()
    )

    return {
        "energia_ps_tipo_1_kwh": float(row[0] or 0.0),
        "energia_ps_tipo_2_kwh": float(row[1] or 0.0),
        "energia_ps_tipo_3_kwh": float(row[2] or 0.0),
        "energia_ps_tipo_4_kwh": float(row[3] or 0.0),
        "energia_ps_tipo_5_kwh": float(row[4] or 0.0),
        "energia_ps_total_kwh": float(row[5] or 0.0),
        "cups_tipo_1": int(row[6] or 0),
        "cups_tipo_2": int(row[7] or 0),
        "cups_tipo_3": int(row[8] or 0),
        "cups_tipo_4": int(row[9] or 0),
        "cups_tipo_5": int(row[10] or 0),
        "cups_total": int(row[11] or 0),
        "importe_tipo_1_eur": float(row[12] or 0.0),
        "importe_tipo_2_eur": float(row[13] or 0.0),
        "importe_tipo_3_eur": float(row[14] or 0.0),
        "importe_tipo_4_eur": float(row[15] or 0.0),
        "importe_tipo_5_eur": float(row[16] or 0.0),
        "importe_total_eur": float(row[17] or 0.0),
        "energia_tarifa_20td_kwh": float(row[18] or 0.0),
        "cups_tarifa_20td": int(row[19] or 0),
        "importe_tarifa_20td_eur": float(row[20] or 0.0),
        "energia_tarifa_30td_kwh": float(row[21] or 0.0),
        "cups_tarifa_30td": int(row[22] or 0),
        "importe_tarifa_30td_eur": float(row[23] or 0.0),
        "energia_tarifa_30tdve_kwh": float(row[24] or 0.0),
        "cups_tarifa_30tdve": int(row[25] or 0),
        "importe_tarifa_30tdve_eur": float(row[26] or 0.0),
        "energia_tarifa_61td_kwh": float(row[27] or 0.0),
        "cups_tarifa_61td": int(row[28] or 0),
        "importe_tarifa_61td_eur": float(row[29] or 0.0),
        "energia_tarifa_62td_kwh": float(row[30] or 0.0),
        "cups_tarifa_62td": int(row[31] or 0),
        "importe_tarifa_62td_eur": float(row[32] or 0.0),
        "energia_tarifa_63td_kwh": float(row[33] or 0.0),
        "cups_tarifa_63td": int(row[34] or 0),
        "importe_tarifa_63td_eur": float(row[35] or 0.0),
        "energia_tarifa_64td_kwh": float(row[36] or 0.0),
        "cups_tarifa_64td": int(row[37] or 0),
        "importe_tarifa_64td_eur": float(row[38] or 0.0),
    }


def _get_existing_ps_file_periods(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    ingestion_file_id: int,
) -> set[tuple[int, int]]:
    periods: set[tuple[int, int]] = set()

    detail_rows = (
        db.query(PSPeriodDetail.anio, PSPeriodDetail.mes)
        .filter(
            PSPeriodDetail.tenant_id == tenant_id,
            PSPeriodDetail.empresa_id == empresa_id,
            PSPeriodDetail.ingestion_file_id == ingestion_file_id,
        )
        .distinct()
        .all()
    )
    for anio, mes in detail_rows:
        if anio is not None and mes is not None:
            periods.add((int(anio), int(mes)))

    contrib_rows = (
        db.query(PSPeriodContribution.anio, PSPeriodContribution.mes)
        .filter(
            PSPeriodContribution.tenant_id == tenant_id,
            PSPeriodContribution.empresa_id == empresa_id,
            PSPeriodContribution.ingestion_file_id == ingestion_file_id,
        )
        .distinct()
        .all()
    )
    for anio, mes in contrib_rows:
        if anio is not None and mes is not None:
            periods.add((int(anio), int(mes)))

    return periods


def _load_ps_detail_rows_for_period(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> list[PSPeriodDetail]:
    return cast(
        list[PSPeriodDetail],
        db.query(PSPeriodDetail)
        .filter(
            PSPeriodDetail.tenant_id == tenant_id,
            PSPeriodDetail.empresa_id == empresa_id,
            PSPeriodDetail.anio == anio,
            PSPeriodDetail.mes == mes,
        )
        .all(),
    )


def _make_ps_period_detail_mapping(
    *,
    tenant_id: int,
    empresa_id: int,
    ingestion_file_id: int,
    anio: int,
    mes: int,
    is_principal: bool,
    cups: str,
    poliza: str | None,
    tarifa_acceso: str | None,
    energia_facturada_kwh: float,
    importe_total_eur: float,
) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "empresa_id": empresa_id,
        "ingestion_file_id": ingestion_file_id,
        "anio": anio,
        "mes": mes,
        "is_principal": is_principal,
        "cups": cups,
        "poliza": poliza,
        "tarifa_acceso": tarifa_acceso,
        "energia_facturada_kwh": energia_facturada_kwh,
        "importe_total_eur": importe_total_eur,
    }


def _make_ps_period_contribution(
    *,
    tenant_id: int,
    empresa_id: int,
    ingestion_file_id: int,
    anio: int,
    mes: int,
    is_principal: bool,
    agregado: dict[str, float | int],
) -> PSPeriodContribution:
    contrib = PSPeriodContribution(  # type: ignore[call-arg]
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=ingestion_file_id,
        anio=anio,
        mes=mes,
        is_principal=is_principal,
    )

    contrib.energia_ps_tipo_1_kwh = float(agregado["energia_ps_tipo_1_kwh"])  # type: ignore[assignment]
    contrib.energia_ps_tipo_2_kwh = float(agregado["energia_ps_tipo_2_kwh"])  # type: ignore[assignment]
    contrib.energia_ps_tipo_3_kwh = float(agregado["energia_ps_tipo_3_kwh"])  # type: ignore[assignment]
    contrib.energia_ps_tipo_4_kwh = float(agregado["energia_ps_tipo_4_kwh"])  # type: ignore[assignment]
    contrib.energia_ps_tipo_5_kwh = float(agregado["energia_ps_tipo_5_kwh"])  # type: ignore[assignment]
    contrib.energia_ps_total_kwh = float(agregado["energia_ps_total_kwh"])  # type: ignore[assignment]

    contrib.cups_tipo_1 = int(agregado["cups_tipo_1"])  # type: ignore[assignment]
    contrib.cups_tipo_2 = int(agregado["cups_tipo_2"])  # type: ignore[assignment]
    contrib.cups_tipo_3 = int(agregado["cups_tipo_3"])  # type: ignore[assignment]
    contrib.cups_tipo_4 = int(agregado["cups_tipo_4"])  # type: ignore[assignment]
    contrib.cups_tipo_5 = int(agregado["cups_tipo_5"])  # type: ignore[assignment]
    contrib.cups_total = int(agregado["cups_total"])  # type: ignore[assignment]

    contrib.importe_tipo_1_eur = float(agregado["importe_tipo_1_eur"])  # type: ignore[assignment]
    contrib.importe_tipo_2_eur = float(agregado["importe_tipo_2_eur"])  # type: ignore[assignment]
    contrib.importe_tipo_3_eur = float(agregado["importe_tipo_3_eur"])  # type: ignore[assignment]
    contrib.importe_tipo_4_eur = float(agregado["importe_tipo_4_eur"])  # type: ignore[assignment]
    contrib.importe_tipo_5_eur = float(agregado["importe_tipo_5_eur"])  # type: ignore[assignment]
    contrib.importe_total_eur = float(agregado["importe_total_eur"])  # type: ignore[assignment]

    contrib.energia_tarifa_20td_kwh = float(agregado["energia_tarifa_20td_kwh"])  # type: ignore[assignment]
    contrib.cups_tarifa_20td = int(agregado["cups_tarifa_20td"])  # type: ignore[assignment]
    contrib.importe_tarifa_20td_eur = float(agregado["importe_tarifa_20td_eur"])  # type: ignore[assignment]

    contrib.energia_tarifa_30td_kwh = float(agregado["energia_tarifa_30td_kwh"])  # type: ignore[assignment]
    contrib.cups_tarifa_30td = int(agregado["cups_tarifa_30td"])  # type: ignore[assignment]
    contrib.importe_tarifa_30td_eur = float(agregado["importe_tarifa_30td_eur"])  # type: ignore[assignment]

    contrib.energia_tarifa_30tdve_kwh = float(agregado["energia_tarifa_30tdve_kwh"])  # type: ignore[assignment]
    contrib.cups_tarifa_30tdve = int(agregado["cups_tarifa_30tdve"])  # type: ignore[assignment]
    contrib.importe_tarifa_30tdve_eur = float(agregado["importe_tarifa_30tdve_eur"])  # type: ignore[assignment]

    contrib.energia_tarifa_61td_kwh = float(agregado["energia_tarifa_61td_kwh"])  # type: ignore[assignment]
    contrib.cups_tarifa_61td = int(agregado["cups_tarifa_61td"])  # type: ignore[assignment]
    contrib.importe_tarifa_61td_eur = float(agregado["importe_tarifa_61td_eur"])  # type: ignore[assignment]

    contrib.energia_tarifa_62td_kwh = float(agregado["energia_tarifa_62td_kwh"])  # type: ignore[assignment]
    contrib.cups_tarifa_62td = int(agregado["cups_tarifa_62td"])  # type: ignore[assignment]
    contrib.importe_tarifa_62td_eur = float(agregado["importe_tarifa_62td_eur"])  # type: ignore[assignment]

    contrib.energia_tarifa_63td_kwh = float(agregado["energia_tarifa_63td_kwh"])  # type: ignore[assignment]
    contrib.cups_tarifa_63td = int(agregado["cups_tarifa_63td"])  # type: ignore[assignment]
    contrib.importe_tarifa_63td_eur = float(agregado["importe_tarifa_63td_eur"])  # type: ignore[assignment]

    contrib.energia_tarifa_64td_kwh = float(agregado["energia_tarifa_64td_kwh"])  # type: ignore[assignment]
    contrib.cups_tarifa_64td = int(agregado["cups_tarifa_64td"])  # type: ignore[assignment]
    contrib.importe_tarifa_64td_eur = float(agregado["importe_tarifa_64td_eur"])  # type: ignore[assignment]

    return contrib


def _apply_ps_aggregate_to_medida(
    mp: MedidaPS,
    *,
    agregado: dict[str, float | int],
    fichero: IngestionFile,
) -> None:
    mp.energia_ps_tipo_1_kwh = float(agregado["energia_ps_tipo_1_kwh"])  # type: ignore[assignment]
    mp.energia_ps_tipo_2_kwh = float(agregado["energia_ps_tipo_2_kwh"])  # type: ignore[assignment]
    mp.energia_ps_tipo_3_kwh = float(agregado["energia_ps_tipo_3_kwh"])  # type: ignore[assignment]
    mp.energia_ps_tipo_4_kwh = float(agregado["energia_ps_tipo_4_kwh"])  # type: ignore[assignment]
    mp.energia_ps_tipo_5_kwh = float(agregado["energia_ps_tipo_5_kwh"])  # type: ignore[assignment]
    mp.energia_ps_total_kwh = float(agregado["energia_ps_total_kwh"])  # type: ignore[assignment]

    mp.cups_tipo_1 = int(agregado["cups_tipo_1"])  # type: ignore[assignment]
    mp.cups_tipo_2 = int(agregado["cups_tipo_2"])  # type: ignore[assignment]
    mp.cups_tipo_3 = int(agregado["cups_tipo_3"])  # type: ignore[assignment]
    mp.cups_tipo_4 = int(agregado["cups_tipo_4"])  # type: ignore[assignment]
    mp.cups_tipo_5 = int(agregado["cups_tipo_5"])  # type: ignore[assignment]
    mp.cups_total = int(agregado["cups_total"])  # type: ignore[assignment]

    mp.importe_tipo_1_eur = float(agregado["importe_tipo_1_eur"])  # type: ignore[assignment]
    mp.importe_tipo_2_eur = float(agregado["importe_tipo_2_eur"])  # type: ignore[assignment]
    mp.importe_tipo_3_eur = float(agregado["importe_tipo_3_eur"])  # type: ignore[assignment]
    mp.importe_tipo_4_eur = float(agregado["importe_tipo_4_eur"])  # type: ignore[assignment]
    mp.importe_tipo_5_eur = float(agregado["importe_tipo_5_eur"])  # type: ignore[assignment]
    mp.importe_total_eur = float(agregado["importe_total_eur"])  # type: ignore[assignment]

    mp.energia_tarifa_20td_kwh = float(agregado["energia_tarifa_20td_kwh"])  # type: ignore[assignment]
    mp.cups_tarifa_20td = int(agregado["cups_tarifa_20td"])  # type: ignore[assignment]
    mp.importe_tarifa_20td_eur = float(agregado["importe_tarifa_20td_eur"])  # type: ignore[assignment]

    mp.energia_tarifa_30td_kwh = float(agregado["energia_tarifa_30td_kwh"])  # type: ignore[assignment]
    mp.cups_tarifa_30td = int(agregado["cups_tarifa_30td"])  # type: ignore[assignment]
    mp.importe_tarifa_30td_eur = float(agregado["importe_tarifa_30td_eur"])  # type: ignore[assignment]

    mp.energia_tarifa_30tdve_kwh = float(agregado["energia_tarifa_30tdve_kwh"])  # type: ignore[assignment]
    mp.cups_tarifa_30tdve = int(agregado["cups_tarifa_30tdve"])  # type: ignore[assignment]
    mp.importe_tarifa_30tdve_eur = float(agregado["importe_tarifa_30tdve_eur"])  # type: ignore[assignment]

    mp.energia_tarifa_61td_kwh = float(agregado["energia_tarifa_61td_kwh"])  # type: ignore[assignment]
    mp.cups_tarifa_61td = int(agregado["cups_tarifa_61td"])  # type: ignore[assignment]
    mp.importe_tarifa_61td_eur = float(agregado["importe_tarifa_61td_eur"])  # type: ignore[assignment]

    mp.energia_tarifa_62td_kwh = float(agregado["energia_tarifa_62td_kwh"])  # type: ignore[assignment]
    mp.cups_tarifa_62td = int(agregado["cups_tarifa_62td"])  # type: ignore[assignment]
    mp.importe_tarifa_62td_eur = float(agregado["importe_tarifa_62td_eur"])  # type: ignore[assignment]

    mp.energia_tarifa_63td_kwh = float(agregado["energia_tarifa_63td_kwh"])  # type: ignore[assignment]
    mp.cups_tarifa_63td = int(agregado["cups_tarifa_63td"])  # type: ignore[assignment]
    mp.importe_tarifa_63td_eur = float(agregado["importe_tarifa_63td_eur"])  # type: ignore[assignment]

    mp.energia_tarifa_64td_kwh = float(agregado["energia_tarifa_64td_kwh"])  # type: ignore[assignment]
    mp.cups_tarifa_64td = int(agregado["cups_tarifa_64td"])  # type: ignore[assignment]
    mp.importe_tarifa_64td_eur = float(agregado["importe_tarifa_64td_eur"])  # type: ignore[assignment]

    mp.file_id = _file_id(fichero)  # type: ignore[assignment]


# ---------- procesador PS ----------


def procesar_ps(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaPS:
    filas = list(filas_raw)
    if not filas:
        raise ValueError("El fichero PS no contiene filas de datos")

    anio_principal, mes_principal = _extraer_periodo_principal_de_fichero(fichero)

    warnings: list[dict[str, Any]] = []

    periodos_previos = _get_existing_ps_file_periods(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
    )

    detail_map: dict[tuple[int, int, str], dict[str, Any]] = {}
    aggregate_by_period: dict[tuple[int, int], dict[str, float | int]] = {}
    periodos_nuevos: set[tuple[int, int]] = set()

    cups_sets_tipo_by_period: dict[tuple[int, int], dict[int, set[str]]] = {}
    cups_total_set_by_period: dict[tuple[int, int], set[str]] = {}
    cups_tarifa_by_period: dict[tuple[int, int], dict[str, set[str]]] = {}

    for f in filas:
        try:
            fecha_final = _to_date(f.get("Fecha_final"))
        except Exception:
            continue

        anio_obj, mes_obj, motivo = _periodo_objetivo_m1_desde_periodo_principal(
            fecha_final,
            anio_principal=anio_principal,
            mes_principal=mes_principal,
        )

        if motivo == "future_out_of_window":
            warnings.append(
                {
                    "type": "future_out_of_window_ps",
                    "fecha_final": fecha_final.isoformat(),
                    "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                    "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                }
            )

        if motivo == "refactura":
            warnings.append(
                {
                    "type": "refactura_detectada_ps",
                    "fecha_final": fecha_final.isoformat(),
                    "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                    "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                }
            )

        period_key = (anio_obj, mes_obj)
        periodos_nuevos.add(period_key)

        cups = _ps_cups(f)
        if not cups:
            warnings.append(
                {
                    "type": "ps_row_without_cups",
                    "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                }
            )
            continue

        poliza = _ps_poliza(f)
        tarifa = _ps_tarifa(f)
        energia = _to_float(f.get("Energia_facturada"))
        importe = _to_float(f.get("Total"))

        agregado = aggregate_by_period.get(period_key)
        if agregado is None:
            agregado = _empty_ps_aggregate()
            aggregate_by_period[period_key] = agregado

        cups_sets_tipo = cups_sets_tipo_by_period.get(period_key)
        if cups_sets_tipo is None:
            cups_sets_tipo = {i: set() for i in range(1, 6)}
            cups_sets_tipo_by_period[period_key] = cups_sets_tipo

        cups_total_set = cups_total_set_by_period.get(period_key)
        if cups_total_set is None:
            cups_total_set = set()
            cups_total_set_by_period[period_key] = cups_total_set

        cups_tarifa = cups_tarifa_by_period.get(period_key)
        if cups_tarifa is None:
            cups_tarifa = {k: set() for k in TARIFA_MAP.values()}
            cups_tarifa_by_period[period_key] = cups_tarifa

        agregado["energia_ps_total_kwh"] = float(agregado["energia_ps_total_kwh"]) + energia
        agregado["importe_total_eur"] = float(agregado["importe_total_eur"]) + importe

        if cups:
            cups_total_set.add(cups)

        if poliza in {"1", "2", "3", "4", "5"}:
            tipo_int = int(poliza)
            energia_key = f"energia_ps_tipo_{tipo_int}_kwh"
            importe_key = f"importe_tipo_{tipo_int}_eur"
            agregado[energia_key] = float(agregado[energia_key]) + energia
            agregado[importe_key] = float(agregado[importe_key]) + importe
            cups_sets_tipo[tipo_int].add(cups)

        sufijo_tarifa = TARIFA_MAP.get(tarifa)
        if sufijo_tarifa is not None:
            energia_tarifa_key = f"energia_tarifa_{sufijo_tarifa}_kwh"
            importe_tarifa_key = f"importe_tarifa_{sufijo_tarifa}_eur"
            agregado[energia_tarifa_key] = float(agregado[energia_tarifa_key]) + energia
            agregado[importe_tarifa_key] = float(agregado[importe_tarifa_key]) + importe
            cups_tarifa[sufijo_tarifa].add(cups)

        detail_key = (anio_obj, mes_obj, cups)
        existing = detail_map.get(detail_key)

        if existing is None:
            detail_map[detail_key] = {
                "anio": anio_obj,
                "mes": mes_obj,
                "cups": cups,
                "poliza": poliza,
                "tarifa_acceso": tarifa,
                "energia_facturada_kwh": energia,
                "importe_total_eur": importe,
                "is_principal": period_key == (anio_principal, mes_principal),
            }
        else:
            old_poliza = cast(str | None, existing.get("poliza"))
            old_tarifa = cast(str | None, existing.get("tarifa_acceso"))

            existing["energia_facturada_kwh"] = float(existing.get("energia_facturada_kwh", 0.0)) + energia
            existing["importe_total_eur"] = float(existing.get("importe_total_eur", 0.0)) + importe

            if not old_poliza and poliza:
                existing["poliza"] = poliza
            if not old_tarifa and tarifa:
                existing["tarifa_acceso"] = tarifa

            current_poliza = cast(str | None, existing.get("poliza"))
            current_tarifa = cast(str | None, existing.get("tarifa_acceso"))

            if poliza and current_poliza and poliza != current_poliza:
                warnings.append(
                    {
                        "type": "ps_conflicting_poliza_same_cups",
                        "cups": cups,
                        "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                        "poliza_existente": current_poliza,
                        "poliza_nueva": poliza,
                    }
                )
            if tarifa and current_tarifa and tarifa != current_tarifa:
                warnings.append(
                    {
                        "type": "ps_conflicting_tarifa_same_cups",
                        "cups": cups,
                        "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                        "tarifa_existente": current_tarifa,
                        "tarifa_nueva": tarifa,
                    }
                )

    if not aggregate_by_period:
        raise ValueError(
            "No hay filas con Fecha_final válida para calcular PS (todas NaT/NaN/None/vacías)"
        )

    for period_key, agregado in aggregate_by_period.items():
        cups_sets_tipo = cups_sets_tipo_by_period.get(period_key, {i: set() for i in range(1, 6)})
        cups_total_set = cups_total_set_by_period.get(period_key, set())
        cups_tarifa = cups_tarifa_by_period.get(
            period_key,
            {k: set() for k in TARIFA_MAP.values()},
        )

        agregado["cups_tipo_1"] = len(cups_sets_tipo[1])
        agregado["cups_tipo_2"] = len(cups_sets_tipo[2])
        agregado["cups_tipo_3"] = len(cups_sets_tipo[3])
        agregado["cups_tipo_4"] = len(cups_sets_tipo[4])
        agregado["cups_tipo_5"] = len(cups_sets_tipo[5])
        agregado["cups_total"] = len(cups_total_set)
        agregado["cups_tarifa_20td"] = len(cups_tarifa["20td"])
        agregado["cups_tarifa_30td"] = len(cups_tarifa["30td"])
        agregado["cups_tarifa_30tdve"] = len(cups_tarifa["30tdve"])
        agregado["cups_tarifa_61td"] = len(cups_tarifa["61td"])
        agregado["cups_tarifa_62td"] = len(cups_tarifa["62td"])
        agregado["cups_tarifa_63td"] = len(cups_tarifa["63td"])
        agregado["cups_tarifa_64td"] = len(cups_tarifa["64td"])

    periodos_afectados = set(periodos_previos) | set(periodos_nuevos)

    (
        db.query(PSPeriodDetail)
        .filter(
            PSPeriodDetail.tenant_id == tenant_id,
            PSPeriodDetail.empresa_id == empresa_id,
            PSPeriodDetail.ingestion_file_id == _file_id(fichero),
        )
        .delete(synchronize_session=False)
    )

    (
        db.query(PSPeriodContribution)
        .filter(
            PSPeriodContribution.tenant_id == tenant_id,
            PSPeriodContribution.empresa_id == empresa_id,
            PSPeriodContribution.ingestion_file_id == _file_id(fichero),
        )
        .delete(synchronize_session=False)
    )

    db.flush()

    detail_mappings: list[dict[str, Any]] = []
    for item in detail_map.values():
        detail_mappings.append(
            _make_ps_period_detail_mapping(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                ingestion_file_id=_file_id(fichero),
                anio=int(item["anio"]),
                mes=int(item["mes"]),
                is_principal=bool(item["is_principal"]),
                cups=str(item["cups"]),
                poliza=str(item["poliza"]) if item.get("poliza") else None,
                tarifa_acceso=str(item["tarifa_acceso"]) if item.get("tarifa_acceso") else None,
                energia_facturada_kwh=float(item["energia_facturada_kwh"]),
                importe_total_eur=float(item["importe_total_eur"]),
            )
        )

    if detail_mappings:
        db.bulk_insert_mappings(cast(Any, PSPeriodDetail), detail_mappings)

    for (anio, mes), agregado in sorted(aggregate_by_period.items()):
        es_principal = (anio, mes) == (anio_principal, mes_principal)
        contrib = _make_ps_period_contribution(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            ingestion_file_id=_file_id(fichero),
            anio=anio,
            mes=mes,
            is_principal=bool(es_principal),
            agregado=agregado,
        )
        db.add(contrib)

    db.flush()

    mp_principal: MedidaPS | None = None

    for (anio, mes) in sorted(periodos_afectados):
        agregado = _sum_contribuciones_ps(
            db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )

        mp = (
            db.query(MedidaPS)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                punto_id="PS",
                anio=anio,
                mes=mes,
            )
            .first()
        )

        creado = False
        if mp is None:
            mp = MedidaPS(  # type: ignore[call-arg]
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                punto_id="PS",
                anio=anio,
                mes=mes,
            )
            db.add(mp)
            creado = True

        es_principal = (anio, mes) == (anio_principal, mes_principal)

        if creado and not es_principal:
            warnings.append(
                {
                    "type": "missing_period_created_ps",
                    "periodo": f"{anio:04d}{mes:02d}",
                    "energia_ps_total_kwh": float(agregado["energia_ps_total_kwh"]),
                }
            )

        _apply_ps_aggregate_to_medida(mp, agregado=agregado, fichero=fichero)

        if es_principal:
            mp_principal = mp

    db.flush()

    if mp_principal is None:
        mejor_periodo = max(
            periodos_afectados,
            key=lambda p: float(
                cast(
                    dict[str, float | int],
                    _sum_contribuciones_ps(
                        db,
                        tenant_id=tenant_id,
                        empresa_id=empresa_id,
                        anio=p[0],
                        mes=p[1],
                    ),
                )["energia_ps_total_kwh"]
            ),
        )
        anio_ret, mes_ret = mejor_periodo
        mp_principal = (
            db.query(MedidaPS)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                punto_id="PS",
                anio=anio_ret,
                mes=mes_ret,
            )
            .first()
        )
        if mp_principal is None:
            raise ValueError("No pude recuperar la medida principal tras guardar PS")

    try:
        setattr(mp_principal, "_ingestion_warnings", warnings)
    except Exception:
        pass

    _safe_refresh(db, mp_principal)
    return mp_principal