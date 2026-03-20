# app/measures/services/common.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from typing import Iterable, Dict, Any, Tuple, cast
from datetime import datetime, date
import re
import math

import pandas as pd

from sqlalchemy.orm import Session

from app.measures.models import MedidaGeneral
from app.ingestion.models import IngestionFile


# ---------- conversión de fechas ----------


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


# ---------- conversión numérica ----------


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


# ---------- helpers de sesión ----------


def _safe_refresh(db: Session, obj: Any) -> None:
    try:
        db.flush()
        db.refresh(obj)
    except Exception:
        pass


# ---------- cálculos de energía ----------


def _recalcular_energia_neta_y_perdidas(mg: MedidaGeneral) -> None:
    energia_bruta = cast(float | None, mg.energia_bruta_facturada) or 0.0
    energia_auto = cast(float | None, mg.energia_autoconsumo_kwh) or 0.0
    energia_pf_final = cast(float | None, mg.energia_pf_final_kwh) or 0.0
    energia_frontera_dd = cast(float | None, mg.energia_frontera_dd_kwh) or 0.0
    energia_gen = cast(float | None, mg.energia_generada_kwh) or 0.0

    energia_neta = energia_bruta - energia_auto
    mg.energia_neta_facturada_kwh = energia_neta  # type: ignore[assignment]

    perdidas_kwh = (energia_pf_final + energia_gen - energia_frontera_dd) - energia_neta
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
    mg.energia_pf_final_kwh = energia_pf  # type: ignore[assignment]
    _recalcular_energia_neta_y_perdidas(mg)


# ---------- helpers de periodos ----------


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