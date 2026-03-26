# app/medidas_graficos/schemas.py
# pyright: reportMissingImports=false
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class GraficoEmpresaOption(BaseModel):
    id: int
    nombre: str
    model_config = ConfigDict(from_attributes=True)


class GraficoFiltersResponse(BaseModel):
    empresas: list[GraficoEmpresaOption]
    anios: list[int]
    meses: list[int]


class GraficoPoint(BaseModel):
    period_key: str
    period_label: str
    value: float


class GraficoSerie(BaseModel):
    serie_key: str
    serie_label: str
    points: list[GraficoPoint]


class GraficoSeriesGroup(BaseModel):
    series: list[GraficoSerie]


class GraficosFiltersApplied(BaseModel):
    empresa_ids: list[int]
    anios: list[int]
    meses: list[int]
    aggregation: str


class GraficosScope(BaseModel):
    all_empresas_selected: bool
    aggregation: str


class GraficosSeriesResponse(BaseModel):
    filters: GraficosFiltersApplied
    scope: GraficosScope
    energia_facturada: GraficoSeriesGroup
    perdidas: GraficoSeriesGroup
    perdidas_kwh: GraficoSeriesGroup
    perdidas_ventanas: GraficoSeriesGroup
    energias_publicadas: GraficoSeriesGroup
    energias_pf: GraficoSeriesGroup
    autoconsumo: GraficoSeriesGroup
    energia_generada: GraficoSeriesGroup


class GraficosPsSeriesResponse(BaseModel):
    filters: GraficosFiltersApplied
    scope: GraficosScope
    cups_por_tipo: GraficoSeriesGroup
    energia_por_tipo: GraficoSeriesGroup    # ← NUEVO
    importe_por_tipo: GraficoSeriesGroup    # ← NUEVO