from __future__ import annotations

from decimal import Decimal
import math
import re
from typing import Any, Optional, cast

from pydantic import BaseModel

from app.empresas.models import Empresa
from app.measures.models import MedidaPS


class DeleteIdsPayload(BaseModel):
    ids: list[int]


def sanitize_value(value: Any):
    """
    Convierte NaN / infinitos en 0.0 para que sean JSON-compatibles.
    Deja el resto tal cual.
    """
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return 0.0
        return value

    if isinstance(value, Decimal):
        if value.is_nan() or value in (Decimal("Infinity"), Decimal("-Infinity")):
            return Decimal("0")
        return value

    return value


def sanitize_medida(medida_obj: Any) -> dict:
    """
    Convierte un objeto MedidaGeneral o MedidaPS a dict, eliminando el estado interno
    de SQLAlchemy y saneando NaN/inf en todos los campos numéricos.
    """
    data = {k: v for k, v in medida_obj.__dict__.items() if not k.startswith("_")}

    for k, v in list(data.items()):
        data[k] = sanitize_value(v)

    return data


def build_empresa_codigo(empresa: Empresa) -> str | None:
    """
    Construye el código corto tipo 0277 / 0336 a partir de
    codigo_cnmc / codigo_ree / id.
    """
    codigo_cnmc = cast(Optional[str], getattr(empresa, "codigo_cnmc", None))
    codigo_ree = cast(Optional[str], getattr(empresa, "codigo_ree", None))

    raw: str = codigo_cnmc or codigo_ree or str(getattr(empresa, "id"))

    m = re.search(r"(\d{3,4})", raw)
    if m:
        codigo_corto = m.group(1)
        if len(codigo_corto) == 3:
            codigo_corto = f"0{codigo_corto}"
        return codigo_corto

    return raw


def paginate(total: int, page: int, page_size: int) -> dict:
    page_size_safe = max(1, min(int(page_size), 500))
    page_safe = max(0, int(page))

    total_pages = max(1, math.ceil(total / page_size_safe)) if total > 0 else 1
    if page_safe > total_pages - 1:
        page_safe = total_pages - 1

    return {
        "page": page_safe,
        "page_size": page_size_safe,
        "total": int(total),
        "total_pages": int(total_pages),
        "offset": int(page_safe * page_size_safe),
        "limit": int(page_size_safe),
    }


def ps_tarifa_filter(query, tarifa: str):
    t = (tarifa or "").lower().strip()
    if not t:
        return query

    if t == "20td":
        return query.filter(
            (MedidaPS.energia_tarifa_20td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_20td.isnot(None))
            | (MedidaPS.importe_tarifa_20td_eur.isnot(None))
        )
    if t == "30td":
        return query.filter(
            (MedidaPS.energia_tarifa_30td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_30td.isnot(None))
            | (MedidaPS.importe_tarifa_30td_eur.isnot(None))
        )
    if t == "30tdve":
        return query.filter(
            (MedidaPS.energia_tarifa_30tdve_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_30tdve.isnot(None))
            | (MedidaPS.importe_tarifa_30tdve_eur.isnot(None))
        )
    if t == "61td":
        return query.filter(
            (MedidaPS.energia_tarifa_61td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_61td.isnot(None))
            | (MedidaPS.importe_tarifa_61td_eur.isnot(None))
        )
    if t == "62td":
        return query.filter(
            (MedidaPS.energia_tarifa_62td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_62td.isnot(None))
            | (MedidaPS.importe_tarifa_62td_eur.isnot(None))
        )
    if t == "63td":
        return query.filter(
            (MedidaPS.energia_tarifa_63td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_63td.isnot(None))
            | (MedidaPS.importe_tarifa_63td_eur.isnot(None))
        )
    if t == "64td":
        return query.filter(
            (MedidaPS.energia_tarifa_64td_kwh.isnot(None))
            | (MedidaPS.cups_tarifa_64td.isnot(None))
            | (MedidaPS.importe_tarifa_64td_eur.isnot(None))
        )

    # tarifa desconocida: no filtramos (no rompemos)
    return query