# app/measures/schemas.py
from __future__ import annotations

from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict  # type: ignore[reportMissingImports]


class MedidaMicroRead(BaseModel):
    id: int
    tenant_id: int
    empresa_id: int
    punto_id: str
    timestamp: datetime
    energia_kwh: float | None = None
    potencia_kw: float | None = None
    calidad: str | None = None
    source_file_id: int
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class MedidaGeneralBase(BaseModel):
    tenant_id: int
    empresa_id: int
    punto_id: str
    anio: int
    mes: int


class MedidaGeneralRead(MedidaGeneralBase):
    id: int

    # Bloque general
    energia_bruta_facturada: float | None = None
    energia_autoconsumo_kwh: float | None = None
    energia_generada_kwh: float | None = None
    energia_frontera_dd_kwh: float | None = None
    energia_pf_kwh: float | None = None
    energia_pf_final_kwh: float | None = None

    energia_neta_facturada_kwh: float | None = None
    perdidas_e_facturada_kwh: float | None = None
    perdidas_e_facturada_pct: float | None = None

    # Ventanas BALD: M2
    energia_publicada_m2_kwh: float | None = None
    energia_autoconsumo_m2_kwh: float | None = None
    energia_pf_m2_kwh: float | None = None
    energia_frontera_dd_m2_kwh: float | None = None
    energia_generada_m2_kwh: float | None = None
    energia_neta_facturada_m2_kwh: float | None = None
    perdidas_e_facturada_m2_kwh: float | None = None
    perdidas_e_facturada_m2_pct: float | None = None

    # M7
    energia_publicada_m7_kwh: float | None = None
    energia_autoconsumo_m7_kwh: float | None = None
    energia_pf_m7_kwh: float | None = None
    energia_frontera_dd_m7_kwh: float | None = None
    energia_generada_m7_kwh: float | None = None
    energia_neta_facturada_m7_kwh: float | None = None
    perdidas_e_facturada_m7_kwh: float | None = None
    perdidas_e_facturada_m7_pct: float | None = None

    # M11
    energia_publicada_m11_kwh: float | None = None
    energia_autoconsumo_m11_kwh: float | None = None
    energia_pf_m11_kwh: float | None = None
    energia_frontera_dd_m11_kwh: float | None = None
    energia_generada_m11_kwh: float | None = None
    energia_neta_facturada_m11_kwh: float | None = None
    perdidas_e_facturada_m11_kwh: float | None = None
    perdidas_e_facturada_m11_pct: float | None = None

    # ART15
    energia_publicada_art15_kwh: float | None = None
    energia_autoconsumo_art15_kwh: float | None = None
    energia_pf_art15_kwh: float | None = None
    energia_frontera_dd_art15_kwh: float | None = None
    energia_generada_art15_kwh: float | None = None
    energia_neta_facturada_art15_kwh: float | None = None
    perdidas_e_facturada_art15_kwh: float | None = None
    perdidas_e_facturada_art15_pct: float | None = None

    file_id: int
    created_at: datetime
    updated_at: datetime | None = None

    # No está en la tabla medidas_general (lo añadimos desde JOIN)
    empresa_codigo: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ----------------- PS -----------------


class MedidaPSBase(BaseModel):
    tenant_id: int
    empresa_id: int
    punto_id: str
    anio: int
    mes: int


class MedidaPSRead(MedidaPSBase):
    id: int

    energia_ps_tipo_1_kwh: float | None = None
    energia_ps_tipo_2_kwh: float | None = None
    energia_ps_tipo_3_kwh: float | None = None
    energia_ps_tipo_4_kwh: float | None = None
    energia_ps_tipo_5_kwh: float | None = None
    energia_ps_total_kwh: float | None = None

    cups_tipo_1: int | None = None
    cups_tipo_2: int | None = None
    cups_tipo_3: int | None = None
    cups_tipo_4: int | None = None
    cups_tipo_5: int | None = None
    cups_total: int | None = None

    importe_tipo_1_eur: float | None = None
    importe_tipo_2_eur: float | None = None
    importe_tipo_3_eur: float | None = None
    importe_tipo_4_eur: float | None = None
    importe_tipo_5_eur: float | None = None
    importe_total_eur: float | None = None

    energia_tarifa_20td_kwh: float | None = None
    cups_tarifa_20td: int | None = None
    importe_tarifa_20td_eur: float | None = None

    energia_tarifa_30td_kwh: float | None = None
    cups_tarifa_30td: int | None = None
    importe_tarifa_30td_eur: float | None = None

    energia_tarifa_30tdve_kwh: float | None = None
    cups_tarifa_30tdve: int | None = None
    importe_tarifa_30tdve_eur: float | None = None

    energia_tarifa_61td_kwh: float | None = None
    cups_tarifa_61td: int | None = None
    importe_tarifa_61td_eur: float | None = None

    energia_tarifa_62td_kwh: float | None = None
    cups_tarifa_62td: int | None = None
    importe_tarifa_62td_eur: float | None = None

    energia_tarifa_63td_kwh: float | None = None
    cups_tarifa_63td: int | None = None
    importe_tarifa_63td_eur: float | None = None

    energia_tarifa_64td_kwh: float | None = None
    cups_tarifa_64td: int | None = None
    importe_tarifa_64td_eur: float | None = None

    file_id: int
    created_at: datetime
    updated_at: datetime | None = None

    empresa_codigo: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================================
# ✅ NUEVO (PRO): modelos auxiliares (no rompen nada)
# ==========================================================

class EmpresaFilterOption(BaseModel):
    id: int
    codigo: str | None = None
    tenant_id: int | None = None  # solo se usa en endpoints /all/filters


class MedidasGeneralFilters(BaseModel):
    empresas: list[EmpresaFilterOption] = []
    anios: list[int] = []
    meses: list[int] = []


class MedidasPsFilters(BaseModel):
    empresas: list[EmpresaFilterOption] = []
    anios: list[int] = []
    meses: list[int] = []
    tarifas: list[str] = []


class PaginatedResponse(BaseModel):
    items: list[dict[str, Any]]
    page: int
    page_size: int
    total: int
    total_pages: int