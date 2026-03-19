# app/measures/services.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from typing import Iterable, Dict, Any, Tuple, cast
from datetime import datetime, date
import re
import math

import pandas as pd

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.measures.models import MedidaGeneral, MedidaPS
from app.measures.m1_models import M1PeriodContribution
from app.measures.general_contrib_models import GeneralPeriodContribution
from app.measures.bald_contrib_models import BaldPeriodContribution
from app.measures.ps_models import PSPeriodContribution
from app.measures.ps_detail_models import PSPeriodDetail
from app.ingestion.models import IngestionFile


# ---------- utilidades comunes ----------


def _to_date(value: Any) -> date:
    """Convierte distintos formatos de fecha a date."""
    if value is None:
        raise ValueError("Fecha_final es None")

    try:
        is_na = pd.isna(value)
    except Exception:
        is_na = False

    if is_na:
        raise ValueError("Fecha_final es NaT/NaN")

    if isinstance(value, datetime):
        d = value.date()

        try:
            is_na_d = pd.isna(d)
        except Exception:
            is_na_d = False

        if is_na_d:
            raise ValueError("Fecha_final.date() es NaT/NaN")

        return d

    if isinstance(value, date):
        return value

    if isinstance(value, str):
        s = value.strip()
        if not s:
            raise ValueError("Fecha_final es cadena vacía")
        if s.upper() == "NAT":
            raise ValueError("Fecha_final es NaT (string)")
        value_norm = s.replace("/", "-")
        return datetime.fromisoformat(value_norm).date()

    if hasattr(value, "to_pydatetime"):
        try:
            dt = value.to_pydatetime()
            if isinstance(dt, datetime):
                return dt.date()
            if isinstance(dt, date):
                return dt
        except Exception:
            pass

    raise ValueError(f"No puedo interpretar la fecha: {value!r}")


def _obtener_periodo_desde_fechas(
    filas: Iterable[Dict[str, Any]],
) -> Tuple[int, int]:
    fechas: list[date] = []
    for f in filas:
        try:
            fechas.append(_to_date(f["Fecha_final"]))
        except Exception:
            continue

    if not fechas:
        raise ValueError("No hay ninguna Fecha_final válida (todas son NaT/NaN/None/vacías)")

    ultima = max(fechas)
    return ultima.year, ultima.month


def _to_float(value: Any) -> float:
    if value is None:
        return 0.0

    if isinstance(value, (int, float)):
        x = float(value)
        if math.isnan(x) or math.isinf(x):
            return 0.0
        return x

    s = str(value).strip()
    if not s:
        return 0.0

    if s.upper() in {"NA", "N/A", "NULL"}:
        return 0.0

    s = s.replace(",", ".")

    try:
        x = float(s)
    except (TypeError, ValueError):
        return 0.0

    if math.isnan(x) or math.isinf(x):
        return 0.0

    return x


def _safe_refresh(db: Session, obj: Any) -> None:
    try:
        db.flush()
        db.refresh(obj)
    except Exception:
        pass


def _recalcular_energia_neta_y_perdidas(mg: MedidaGeneral) -> None:
    energia_bruta = cast(float | None, mg.energia_bruta_facturada) or 0.0
    energia_auto = cast(float | None, mg.energia_autoconsumo_kwh) or 0.0
    energia_pf_final = cast(float | None, mg.energia_pf_final_kwh) or 0.0
    energia_frontera_dd = cast(float | None, mg.energia_frontera_dd_kwh) or 0.0

    energia_neta = energia_bruta - energia_auto
    mg.energia_neta_facturada_kwh = energia_neta  # type: ignore[assignment]

    perdidas_kwh = energia_pf_final - energia_neta
    mg.perdidas_e_facturada_kwh = perdidas_kwh  # type: ignore[assignment]

    denom = energia_neta + energia_frontera_dd
    if denom > 0:
        mg.perdidas_e_facturada_pct = (perdidas_kwh / denom) * 100.0  # type: ignore[assignment]
    else:
        mg.perdidas_e_facturada_pct = None  # type: ignore[assignment]

    for sufijo in ("m2", "m7", "m11", "art15"):
        energia_publicada = cast(float | None, getattr(mg, f"energia_publicada_{sufijo}_kwh", 0.0)) or 0.0
        energia_autoconsumo = cast(float | None, getattr(mg, f"energia_autoconsumo_{sufijo}_kwh", 0.0)) or 0.0
        energia_pf = cast(float | None, getattr(mg, f"energia_pf_{sufijo}_kwh", 0.0)) or 0.0
        energia_gen = cast(float | None, getattr(mg, f"energia_generada_{sufijo}_kwh", 0.0)) or 0.0
        energia_frontera_dd_win = cast(float | None, getattr(mg, f"energia_frontera_dd_{sufijo}_kwh", 0.0)) or 0.0

        energia_neta_win = energia_publicada - energia_autoconsumo
        setattr(mg, f"energia_neta_facturada_{sufijo}_kwh", energia_neta_win)

        pf_final_win = energia_pf + energia_gen - energia_frontera_dd_win

        perdidas_win_kwh = pf_final_win - energia_neta_win
        setattr(mg, f"perdidas_e_facturada_{sufijo}_kwh", perdidas_win_kwh)

        denom_win = energia_neta_win + energia_frontera_dd_win
        if denom_win > 0:
            perdidas_pct = (perdidas_win_kwh / denom_win) * 100.0
        else:
            perdidas_pct = None

        setattr(mg, f"perdidas_e_facturada_{sufijo}_pct", perdidas_pct)


def _recalcular_energia_pf_final(mg: MedidaGeneral) -> None:
    energia_pf = cast(float | None, mg.energia_pf_kwh) or 0.0
    energia_gen = cast(float | None, mg.energia_generada_kwh) or 0.0
    energia_frontera = cast(float | None, mg.energia_frontera_dd_kwh) or 0.0

    mg.energia_pf_final_kwh = energia_pf + energia_gen - energia_frontera  # type: ignore[assignment]
    _recalcular_energia_neta_y_perdidas(mg)


# ---------- helpers M1 / periodos ----------


def _prev_month(anio: int, mes: int) -> tuple[int, int]:
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


def _next_month(anio: int, mes: int) -> tuple[int, int]:
    if mes == 12:
        return anio + 1, 1
    return anio, mes + 1


def _periodo_objetivo_por_ventana(fecha_final: date, dias_post: int = 3) -> tuple[int, int]:
    if 1 <= fecha_final.day <= dias_post:
        return _prev_month(fecha_final.year, fecha_final.month)
    return fecha_final.year, fecha_final.month


def _extraer_periodo_principal_de_fichero(fichero: IngestionFile) -> tuple[int, int]:
    anio = getattr(fichero, "anio", None)
    mes = getattr(fichero, "mes", None)
    if isinstance(anio, int) and isinstance(mes, int) and 1 <= mes <= 12:
        return anio, mes

    nombre = str(getattr(fichero, "filename", "") or "")
    m = re.search(r"_(\d{4})(\d{2})_", nombre)
    if not m:
        m = re.search(r"_(\d{4})(\d{2})", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")
    return int(m.group(1)), int(m.group(2))


def _file_id(fichero: IngestionFile) -> int:
    return cast(int, getattr(fichero, "id"))


def _file_anio(fichero: IngestionFile) -> int:
    return cast(int, getattr(fichero, "anio"))


def _file_mes(fichero: IngestionFile) -> int:
    return cast(int, getattr(fichero, "mes"))


def _periodo_objetivo_m1_desde_periodo_principal(
    fecha_final: date,
    *,
    anio_principal: int,
    mes_principal: int,
) -> tuple[int, int, str]:
    inicio_ventana = date(anio_principal, mes_principal, 1)
    anio_sig, mes_sig = _next_month(anio_principal, mes_principal)
    fin_ventana = date(anio_sig, mes_sig, 3)

    if inicio_ventana <= fecha_final <= fin_ventana:
        return anio_principal, mes_principal, "main_window"

    if fecha_final < inicio_ventana:
        return fecha_final.year, fecha_final.month, "refactura"

    return fecha_final.year, fecha_final.month, "future_out_of_window"


def _sum_contribuciones_m1(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> float:
    total = (
        db.query(func.coalesce(func.sum(M1PeriodContribution.energia_kwh), 0.0))
        .filter(
            M1PeriodContribution.tenant_id == tenant_id,
            M1PeriodContribution.empresa_id == empresa_id,
            M1PeriodContribution.anio == anio,
            M1PeriodContribution.mes == mes,
        )
        .scalar()
    )
    return float(total or 0.0)


def _get_existing_m1_file_periods(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    ingestion_file_id: int,
) -> set[tuple[int, int]]:
    periods: set[tuple[int, int]] = set()

    rows = (
        db.query(M1PeriodContribution.anio, M1PeriodContribution.mes)
        .filter(
            M1PeriodContribution.tenant_id == tenant_id,
            M1PeriodContribution.empresa_id == empresa_id,
            M1PeriodContribution.ingestion_file_id == ingestion_file_id,
        )
        .distinct()
        .all()
    )

    for anio, mes in rows:
        if anio is not None and mes is not None:
            periods.add((int(anio), int(mes)))

    return periods


# ---------- helpers GENERAL deterministic contributions ----------


def _sum_contribuciones_general(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> dict[str, float]:
    row = (
        db.query(
            func.coalesce(func.sum(GeneralPeriodContribution.energia_generada_kwh), 0.0),
            func.coalesce(func.sum(GeneralPeriodContribution.energia_frontera_dd_kwh), 0.0),
            func.coalesce(func.sum(GeneralPeriodContribution.energia_pf_kwh), 0.0),
        )
        .filter(
            GeneralPeriodContribution.tenant_id == tenant_id,
            GeneralPeriodContribution.empresa_id == empresa_id,
            GeneralPeriodContribution.anio == anio,
            GeneralPeriodContribution.mes == mes,
        )
        .one()
    )

    return {
        "energia_generada_kwh": float(row[0] or 0.0),
        "energia_frontera_dd_kwh": float(row[1] or 0.0),
        "energia_pf_kwh": float(row[2] or 0.0),
    }


def _get_existing_general_file_periods(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    ingestion_file_id: int,
) -> set[tuple[int, int]]:
    periods: set[tuple[int, int]] = set()

    rows = (
        db.query(GeneralPeriodContribution.anio, GeneralPeriodContribution.mes)
        .filter(
            GeneralPeriodContribution.tenant_id == tenant_id,
            GeneralPeriodContribution.empresa_id == empresa_id,
            GeneralPeriodContribution.ingestion_file_id == ingestion_file_id,
        )
        .distinct()
        .all()
    )

    for anio, mes in rows:
        if anio is not None and mes is not None:
            periods.add((int(anio), int(mes)))

    return periods


def _rebuild_medida_general_from_contributions(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    fichero: IngestionFile,
    punto_id_default: str,
) -> MedidaGeneral:
    mg = (
        db.query(MedidaGeneral)
        .filter_by(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )
        .first()
    )

    if mg is None:
        mg = MedidaGeneral(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            punto_id=punto_id_default,
            anio=anio,
            mes=mes,
        )
        db.add(mg)
    elif not getattr(mg, "punto_id", None):
        mg.punto_id = punto_id_default  # type: ignore[assignment]

    sums = _sum_contribuciones_general(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )

    mg.energia_generada_kwh = float(sums["energia_generada_kwh"])  # type: ignore[assignment]
    mg.energia_frontera_dd_kwh = float(sums["energia_frontera_dd_kwh"])  # type: ignore[assignment]
    mg.energia_pf_kwh = float(sums["energia_pf_kwh"])  # type: ignore[assignment]
    mg.file_id = _file_id(fichero)  # type: ignore[assignment]

    _recalcular_energia_pf_final(mg)
    return mg


def _save_general_period_contribution_and_rebuild(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    anio: int,
    mes: int,
    source_tipo: str,
    energia_generada_kwh: float = 0.0,
    energia_frontera_dd_kwh: float = 0.0,
    energia_pf_kwh: float = 0.0,
    punto_id_default: str = "GENERAL",
) -> MedidaGeneral:
    periodos_previos = _get_existing_general_file_periods(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
    )

    (
        db.query(GeneralPeriodContribution)
        .filter(
            GeneralPeriodContribution.tenant_id == tenant_id,
            GeneralPeriodContribution.empresa_id == empresa_id,
            GeneralPeriodContribution.ingestion_file_id == _file_id(fichero),
            GeneralPeriodContribution.source_tipo == source_tipo,
        )
        .delete(synchronize_session=False)
    )

    db.flush()

    contrib = GeneralPeriodContribution(  # type: ignore[call-arg]
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
        anio=anio,
        mes=mes,
        source_tipo=source_tipo,
        energia_generada_kwh=float(energia_generada_kwh),
        energia_frontera_dd_kwh=float(energia_frontera_dd_kwh),
        energia_pf_kwh=float(energia_pf_kwh),
        is_principal=True,
    )
    db.add(contrib)
    db.flush()

    periodos_afectados = set(periodos_previos) | {(anio, mes)}

    mg_result: MedidaGeneral | None = None
    for anio_af, mes_af in sorted(periodos_afectados):
        mg = _rebuild_medida_general_from_contributions(
            db=db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio_af,
            mes=mes_af,
            fichero=fichero,
            punto_id_default=punto_id_default,
        )
        if (anio_af, mes_af) == (anio, mes):
            mg_result = mg

    db.flush()

    if mg_result is None:
        mg_result = (
            db.query(MedidaGeneral)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio,
                mes=mes,
            )
            .first()
        )

    if mg_result is None:
        raise ValueError("No se pudo reconstruir la medida general tras guardar contribuciones")

    _safe_refresh(db, mg_result)
    return mg_result


# ---------- helpers BALD deterministic contributions ----------


def _sum_contribuciones_bald(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    ventana_publicacion: str,
) -> dict[str, float]:
    row = (
        db.query(
            func.coalesce(func.sum(BaldPeriodContribution.energia_publicada_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_autoconsumo_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_pf_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_frontera_dd_kwh), 0.0),
            func.coalesce(func.sum(BaldPeriodContribution.energia_generada_kwh), 0.0),
        )
        .filter(
            BaldPeriodContribution.tenant_id == tenant_id,
            BaldPeriodContribution.empresa_id == empresa_id,
            BaldPeriodContribution.anio == anio,
            BaldPeriodContribution.mes == mes,
            BaldPeriodContribution.ventana_publicacion == ventana_publicacion,
        )
        .one()
    )

    return {
        "energia_publicada_kwh": float(row[0] or 0.0),
        "energia_autoconsumo_kwh": float(row[1] or 0.0),
        "energia_pf_kwh": float(row[2] or 0.0),
        "energia_frontera_dd_kwh": float(row[3] or 0.0),
        "energia_generada_kwh": float(row[4] or 0.0),
    }


def _get_existing_bald_period_window(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    ventana_publicacion: str,
) -> set[tuple[int, int, str]]:
    rows = (
        db.query(
            BaldPeriodContribution.anio,
            BaldPeriodContribution.mes,
            BaldPeriodContribution.ventana_publicacion,
        )
        .filter(
            BaldPeriodContribution.tenant_id == tenant_id,
            BaldPeriodContribution.empresa_id == empresa_id,
            BaldPeriodContribution.anio == anio,
            BaldPeriodContribution.mes == mes,
            BaldPeriodContribution.ventana_publicacion == ventana_publicacion,
        )
        .distinct()
        .all()
    )

    result: set[tuple[int, int, str]] = set()
    for anio_row, mes_row, ventana_row in rows:
        if anio_row is not None and mes_row is not None and ventana_row:
            result.add((int(anio_row), int(mes_row), str(ventana_row)))
    return result


def _rebuild_medida_general_bald_window(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
    ventana_publicacion: str,
    fichero: IngestionFile,
    punto_id_default: str = "BALD",
) -> MedidaGeneral:
    mg = (
        db.query(MedidaGeneral)
        .filter_by(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )
        .first()
    )

    if mg is None:
        mg = MedidaGeneral(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            punto_id=punto_id_default,
            anio=anio,
            mes=mes,
        )
        db.add(mg)
    elif not getattr(mg, "punto_id", None):
        mg.punto_id = punto_id_default  # type: ignore[assignment]

    sums = _sum_contribuciones_bald(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        ventana_publicacion=ventana_publicacion,
    )

    sufijo = ventana_publicacion.lower()

    setattr(mg, f"energia_publicada_{sufijo}_kwh", float(sums["energia_publicada_kwh"]))
    setattr(mg, f"energia_autoconsumo_{sufijo}_kwh", float(sums["energia_autoconsumo_kwh"]))
    setattr(mg, f"energia_pf_{sufijo}_kwh", float(sums["energia_pf_kwh"]))
    setattr(mg, f"energia_frontera_dd_{sufijo}_kwh", float(sums["energia_frontera_dd_kwh"]))
    setattr(mg, f"energia_generada_{sufijo}_kwh", float(sums["energia_generada_kwh"]))

    mg.file_id = _file_id(fichero)  # type: ignore[assignment]
    _recalcular_energia_neta_y_perdidas(mg)
    return mg


def _save_bald_period_contribution_and_rebuild(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    anio: int,
    mes: int,
    ventana_publicacion: str,
    energia_publicada_kwh: float,
    energia_autoconsumo_kwh: float,
    energia_pf_kwh: float,
    energia_frontera_dd_kwh: float,
    energia_generada_kwh: float,
) -> MedidaGeneral:
    # Igual que en M1: sustituimos la contribución vigente del periodo/ventana,
    # no acumulamos otra distinta solo por venir de otro ingestion_file_id.
    previos = _get_existing_bald_period_window(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        ventana_publicacion=ventana_publicacion,
    )

    (
        db.query(BaldPeriodContribution)
        .filter(
            BaldPeriodContribution.tenant_id == tenant_id,
            BaldPeriodContribution.empresa_id == empresa_id,
            BaldPeriodContribution.anio == anio,
            BaldPeriodContribution.mes == mes,
            BaldPeriodContribution.ventana_publicacion == ventana_publicacion,
        )
        .delete(synchronize_session=False)
    )

    db.flush()

    contrib = BaldPeriodContribution(  # type: ignore[call-arg]
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
        anio=anio,
        mes=mes,
        ventana_publicacion=ventana_publicacion,
        energia_publicada_kwh=float(energia_publicada_kwh),
        energia_autoconsumo_kwh=float(energia_autoconsumo_kwh),
        energia_pf_kwh=float(energia_pf_kwh),
        energia_frontera_dd_kwh=float(energia_frontera_dd_kwh),
        energia_generada_kwh=float(energia_generada_kwh),
        is_principal=True,
    )
    db.add(contrib)
    db.flush()

    afectados = set(previos) | {(anio, mes, ventana_publicacion)}

    mg_result: MedidaGeneral | None = None
    for anio_af, mes_af, ventana_af in sorted(afectados):
        mg = _rebuild_medida_general_bald_window(
            db=db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio_af,
            mes=mes_af,
            ventana_publicacion=ventana_af,
            fichero=fichero,
            punto_id_default="BALD",
        )
        if (anio_af, mes_af, ventana_af) == (anio, mes, ventana_publicacion):
            mg_result = mg

    db.flush()

    if mg_result is None:
        mg_result = (
            db.query(MedidaGeneral)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio,
                mes=mes,
            )
            .first()
        )

    if mg_result is None:
        raise ValueError("No se pudo reconstruir la medida general BALD tras guardar contribuciones")

    _safe_refresh(db, mg_result)
    return mg_result


# ---------- helpers PS ----------


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


def _build_ps_aggregate_from_rows(filas: list[Dict[str, Any]]) -> dict[str, float | int]:
    energia_por_tipo: dict[int, float] = {i: 0.0 for i in range(1, 6)}
    cups_por_tipo: dict[int, set[str]] = {i: set() for i in range(1, 6)}
    importe_por_tipo: dict[int, float] = {i: 0.0 for i in range(1, 6)}

    energia_total = 0.0
    importe_total = 0.0
    cups_total_set: set[str] = set()

    energia_tarifa: dict[str, float] = {
        "20td": 0.0,
        "30td": 0.0,
        "30tdve": 0.0,
        "61td": 0.0,
        "62td": 0.0,
        "63td": 0.0,
        "64td": 0.0,
    }
    cups_tarifa: dict[str, set[str]] = {
        "20td": set(),
        "30td": set(),
        "30tdve": set(),
        "61td": set(),
        "62td": set(),
        "63td": set(),
        "64td": set(),
    }
    importe_tarifa: dict[str, float] = {
        "20td": 0.0,
        "30td": 0.0,
        "30tdve": 0.0,
        "61td": 0.0,
        "62td": 0.0,
        "63td": 0.0,
        "64td": 0.0,
    }

    tarifa_map = {
        "2.0TD": "20td",
        "3.0TD": "30td",
        "3.0TDVE": "30tdve",
        "6.1TD": "61td",
        "6.2TD": "62td",
        "6.3TD": "63td",
        "6.4TD": "64td",
    }

    for f in filas:
        cups = _ps_cups(f)
        poliza = _ps_poliza(f)
        tarifa = _ps_tarifa(f)
        energia = _to_float(f.get("Energia_facturada"))
        importe = _to_float(f.get("Total"))

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

        sufijo = tarifa_map.get(tarifa)
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


def _aggregate_ps_detail_rows(detail_rows: list[PSPeriodDetail]) -> dict[str, float | int]:
    energia_por_tipo: dict[int, float] = {i: 0.0 for i in range(1, 6)}
    cups_por_tipo: dict[int, set[str]] = {i: set() for i in range(1, 6)}
    importe_por_tipo: dict[int, float] = {i: 0.0 for i in range(1, 6)}

    energia_total = 0.0
    importe_total = 0.0
    cups_total_set: set[str] = set()

    energia_tarifa: dict[str, float] = {
        "20td": 0.0,
        "30td": 0.0,
        "30tdve": 0.0,
        "61td": 0.0,
        "62td": 0.0,
        "63td": 0.0,
        "64td": 0.0,
    }
    cups_tarifa: dict[str, set[str]] = {
        "20td": set(),
        "30td": set(),
        "30tdve": set(),
        "61td": set(),
        "62td": set(),
        "63td": set(),
        "64td": set(),
    }
    importe_tarifa: dict[str, float] = {
        "20td": 0.0,
        "30td": 0.0,
        "30tdve": 0.0,
        "61td": 0.0,
        "62td": 0.0,
        "63td": 0.0,
        "64td": 0.0,
    }

    tarifa_map = {
        "2.0TD": "20td",
        "3.0TD": "30td",
        "3.0TDVE": "30tdve",
        "6.1TD": "61td",
        "6.2TD": "62td",
        "6.3TD": "63td",
        "6.4TD": "64td",
    }

    for row in detail_rows:
        cups = str(getattr(row, "cups", "") or "").strip()
        poliza = str(getattr(row, "poliza", "") or "").strip()
        tarifa = str(getattr(row, "tarifa_acceso", "") or "").strip().upper()
        energia = float(getattr(row, "energia_facturada_kwh", 0.0) or 0.0)
        importe = float(getattr(row, "importe_total_eur", 0.0) or 0.0)

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

        sufijo = tarifa_map.get(tarifa)
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


# ---------- M1 facturación ----------


def procesar_m1(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)
    if not filas:
        raise ValueError("El fichero M1 no contiene filas de datos")

    anio_principal, mes_principal = _extraer_periodo_principal_de_fichero(fichero)

    warnings: list[dict[str, Any]] = []
    energia_por_periodo: dict[tuple[int, int], float] = {}
    periodos_nuevos: set[tuple[int, int]] = set()

    periodos_previos = _get_existing_m1_file_periods(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
    )

    (
        db.query(M1PeriodContribution)
        .filter(
            M1PeriodContribution.tenant_id == tenant_id,
            M1PeriodContribution.empresa_id == empresa_id,
            M1PeriodContribution.ingestion_file_id == _file_id(fichero),
        )
        .delete(synchronize_session=False)
    )
    db.flush()

    for f in filas:
        try:
            fecha_final = _to_date(f.get("Fecha_final"))
        except Exception:
            continue

        fecha_inicio: date | None = None
        try:
            if "Fecha_inicio" in f:
                fecha_inicio = _to_date(f.get("Fecha_inicio"))
        except Exception:
            fecha_inicio = None

        anio_obj, mes_obj, motivo = _periodo_objetivo_m1_desde_periodo_principal(
            fecha_final,
            anio_principal=anio_principal,
            mes_principal=mes_principal,
        )

        if motivo == "future_out_of_window":
            warnings.append(
                {
                    "type": "future_out_of_window",
                    "fecha_final": fecha_final.isoformat(),
                    "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                    "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                }
            )

        if fecha_inicio is not None:
            if (fecha_inicio.year, fecha_inicio.month) != (fecha_final.year, fecha_final.month):
                warnings.append(
                    {
                        "type": "fecha_inicio_fecha_final_distinto_mes",
                        "fecha_inicio": fecha_inicio.isoformat(),
                        "fecha_final": fecha_final.isoformat(),
                        "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                        "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                    }
                )

        energia = _to_float(f.get("Energia_Kwh", 0.0))
        energia_por_periodo[(anio_obj, mes_obj)] = energia_por_periodo.get((anio_obj, mes_obj), 0.0) + energia
        periodos_nuevos.add((anio_obj, mes_obj))

    if not energia_por_periodo:
        raise ValueError(
            "No hay filas con Fecha_final válida para calcular energia_bruta_facturada (todas NaT/NaN/None/vacías)"
        )

    for (anio, mes), energia_total in sorted(energia_por_periodo.items()):
        es_principal = (anio, mes) == (anio_principal, mes_principal)

        contrib = M1PeriodContribution(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            ingestion_file_id=_file_id(fichero),
            anio=anio,
            mes=mes,
            energia_kwh=float(energia_total),
            is_principal=bool(es_principal),
        )
        db.add(contrib)

        if not es_principal:
            warnings.append(
                {
                    "type": "refactura_detectada",
                    "periodo": f"{anio:04d}{mes:02d}",
                    "energia_kwh": float(energia_total),
                    "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                }
            )

    db.flush()

    periodos_afectados = set(periodos_previos) | set(periodos_nuevos)
    mg_principal: MedidaGeneral | None = None

    for (anio, mes) in sorted(periodos_afectados):
        mg = (
            db.query(MedidaGeneral)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio,
                mes=mes,
            )
            .first()
        )

        creado = False
        if mg is None:
            mg = MedidaGeneral(  # type: ignore[call-arg]
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                punto_id="M1",
                anio=anio,
                mes=mes,
            )
            db.add(mg)
            creado = True

        es_principal = (anio, mes) == (anio_principal, mes_principal)

        energia_periodo = _sum_contribuciones_m1(
            db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )

        if creado and not es_principal and energia_periodo != 0.0:
            warnings.append(
                {
                    "type": "missing_period_created",
                    "periodo": f"{anio:04d}{mes:02d}",
                    "energia_kwh": float(energia_periodo),
                }
            )

        mg.energia_bruta_facturada = float(energia_periodo)  # type: ignore[assignment]
        mg.file_id = _file_id(fichero)  # type: ignore[assignment]

        if es_principal:
            mg_principal = mg

        _recalcular_energia_neta_y_perdidas(mg)

    db.flush()

    if mg_principal is None:
        (anio_ret, mes_ret), _ = max(energia_por_periodo.items(), key=lambda kv: kv[1])
        mg_principal = (
            db.query(MedidaGeneral)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio_ret,
                mes=mes_ret,
            )
            .first()
        )
        if mg_principal is None:
            raise ValueError("No pude recuperar la medida principal tras guardar M1")

    try:
        setattr(mg_principal, "_ingestion_warnings", warnings)
    except Exception:
        pass

    _safe_refresh(db, mg_principal)
    return mg_principal


# ---------- M1 autoconsumos ----------


def procesar_m1_autoconsumo(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero M1 de autoconsumo no contiene filas de datos")

    try:
        energia_total = sum(_to_float(f.get("Kwh", 0.0)) for f in filas)
    except Exception as exc:
        raise ValueError("Valores no numéricos en la columna 'Kwh'") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})_", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")
    anio = int(m.group(1))
    mes = int(m.group(2))

    mg = (
        db.query(MedidaGeneral)
        .filter_by(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )
        .first()
    )

    if mg is None:
        mg = MedidaGeneral(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            punto_id="M1",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    mg.energia_autoconsumo_kwh = float(energia_total)  # type: ignore[assignment]
    mg.file_id = _file_id(fichero)  # type: ignore[assignment]

    _recalcular_energia_neta_y_perdidas(mg)
    db.flush()
    _safe_refresh(db, mg)
    return mg


# ---------- ACUMCIL ----------


def procesar_acumcil_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUMCIL no contiene filas de datos")

    for f in filas:
        mag = f.get("Magnitud", "")
        f["Magnitud_normalizada"] = str(mag).strip().upper()

    filas_as = [f for f in filas if f["Magnitud_normalizada"] == "AS"]
    if not filas_as:
        raise ValueError("No hay filas con Magnitud 'AS' en el fichero ACUMCIL")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_as
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUMCIL") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})_", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")

    anio = int(m.group(1))
    mes = int(m.group(2))

    return _save_general_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        source_tipo="ACUMCIL",
        energia_generada_kwh=float(energia_total),
        energia_frontera_dd_kwh=0.0,
        energia_pf_kwh=0.0,
        punto_id_default="ACUMCIL",
    )


# ---------- ACUM H2 GRD ----------


def procesar_acum_h2_grd_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 GRD no contiene filas de datos")

    filas_as = [f for f in filas if str(f.get("Magnitud", "")).strip().upper() == "AS"]
    if not filas_as:
        raise ValueError("No hay filas con Magnitud 'AS' en el fichero ACUM H2 GRD")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_as
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 GRD") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")

    anio = int(m.group(1))
    mes = int(m.group(2))

    return _save_general_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        source_tipo="ACUM_H2_GRD",
        energia_generada_kwh=float(energia_total),
        energia_frontera_dd_kwh=0.0,
        energia_pf_kwh=0.0,
        punto_id_default="ACUM_H2_GRD",
    )


def procesar_acum_h2_gen_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 GEN no contiene filas de datos")

    filas_as = [f for f in filas if str(f.get("Magnitud", "")).strip().upper() == "AS"]
    if not filas_as:
        raise ValueError("No hay filas con Magnitud 'AS' en el fichero ACUM H2 GEN")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_as
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 GEN") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")

    anio = int(m.group(1))
    mes = int(m.group(2))

    return _save_general_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        source_tipo="ACUM_H2_GEN",
        energia_generada_kwh=float(energia_total),
        energia_frontera_dd_kwh=0.0,
        energia_pf_kwh=0.0,
        punto_id_default="ACUM_H2_GEN",
    )


def procesar_acum_h2_rdd_frontera_dd(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
    magnitud_objetivo: str = "AE",
    source_tipo: str = "ACUM_H2_RDD_FRONTERA_DD",
    punto_id_default: str = "ACUM_H2_RDD",
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 RDD no contiene filas de datos")

    magnitud_objetivo_norm = str(magnitud_objetivo).strip().upper()

    filas_filtradas = [
        f for f in filas
        if str(f.get("Magnitud", "")).strip().upper() == magnitud_objetivo_norm
    ]
    if not filas_filtradas:
        raise ValueError(f"No hay filas con Magnitud '{magnitud_objetivo_norm}' en el fichero ACUM H2 RDD")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_filtradas
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 RDD") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")

    anio = int(m.group(1))
    mes = int(m.group(2))

    return _save_general_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        source_tipo=source_tipo,
        energia_generada_kwh=0.0,
        energia_frontera_dd_kwh=float(energia_total),
        energia_pf_kwh=0.0,
        punto_id_default=punto_id_default,
    )


def procesar_acum_h2_rdd_pf_kwh(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 RDD (PF) no contiene filas de datos")

    filas_ae = [f for f in filas if str(f.get("Magnitud", "")).strip().upper() == "AE"]
    if not filas_ae:
        raise ValueError("No hay filas con Magnitud 'AE' en el fichero ACUM H2 RDD (PF)")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_ae
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 RDD (PF)") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")

    anio = int(m.group(1))
    mes = int(m.group(2))

    return _save_general_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        source_tipo="ACUM_H2_RDD_PF",
        energia_generada_kwh=0.0,
        energia_frontera_dd_kwh=0.0,
        energia_pf_kwh=float(energia_total),
        punto_id_default="ACUM_H2_RDD_PF",
    )


def procesar_acum_h2_trd_pf_kwh(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 TRD (PF) no contiene filas de datos")

    filas_ae = [f for f in filas if str(f.get("Magnitud", "")).strip().upper() == "AE"]
    if not filas_ae:
        raise ValueError("No hay filas con Magnitud 'AE' en el fichero ACUM H2 TRD (PF)")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_ae
        )
    except (TypeError, ValueError) as exc:
        raise ValueError("Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 TRD (PF)") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
    if not m:
        raise ValueError(f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}")

    anio = int(m.group(1))
    mes = int(m.group(2))

    return _save_general_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        source_tipo="ACUM_H2_TRD_PF",
        energia_generada_kwh=0.0,
        energia_frontera_dd_kwh=0.0,
        energia_pf_kwh=float(energia_total),
        punto_id_default="ACUM_H2_TRD_PF",
    )


def procesar_bald_medidas_general(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    periodo_bald: str,
    fila: Dict[str, Any],
) -> MedidaGeneral:
    periodo_bald_norm = str(periodo_bald).upper()
    if periodo_bald_norm not in {"M2", "M7", "M11", "ART15"}:
        raise ValueError(f"Periodo BALD no reconocido: {periodo_bald}")

    anio = _file_anio(fichero)
    mes = _file_mes(fichero)

    demanda_suministrada = _to_float(fila.get("Demanda_suministrada"))
    demanda_vertida = _to_float(fila.get("Demanda_vertida"))
    dd_a = _to_float(fila.get("DD_A"))
    dd_s = _to_float(fila.get("DD_S"))
    ed = _to_float(fila.get("ED"))
    cil = _to_float(fila.get("CIL"))
    energia_generada = ed + cil

    return _save_bald_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        ventana_publicacion=periodo_bald_norm,
        energia_publicada_kwh=float(demanda_suministrada),
        energia_autoconsumo_kwh=float(demanda_vertida),
        energia_pf_kwh=float(dd_a),
        energia_frontera_dd_kwh=float(dd_s),
        energia_generada_kwh=float(energia_generada),
    )


# ---------- PS ----------


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

    tarifa_map = {
        "2.0TD": "20td",
        "3.0TD": "30td",
        "3.0TDVE": "30tdve",
        "6.1TD": "61td",
        "6.2TD": "62td",
        "6.3TD": "63td",
        "6.4TD": "64td",
    }

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
            cups_tarifa = {
                "20td": set(),
                "30td": set(),
                "30tdve": set(),
                "61td": set(),
                "62td": set(),
                "63td": set(),
                "64td": set(),
            }
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

        sufijo_tarifa = tarifa_map.get(tarifa)
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
            {
                "20td": set(),
                "30td": set(),
                "30tdve": set(),
                "61td": set(),
                "62td": set(),
                "63td": set(),
                "64td": set(),
            },
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
        agregado = aggregate_by_period.get((anio, mes))
        if agregado is None:
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

        _apply_ps_aggregate_to_medida(
            mp,
            agregado=agregado,
            fichero=fichero,
        )

        if es_principal:
            mp_principal = mp

    db.flush()

    if mp_principal is None:
        mejor_periodo = max(
            periodos_afectados,
            key=lambda p: float(
                cast(
                    dict[str, float | int],
                    aggregate_by_period.get(p)
                    or _sum_contribuciones_ps(
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