# app/calendario_laboral/schemas.py
# pyright: reportMissingImports=false
"""
Schemas Pydantic v2 para el módulo `calendario_laboral`.

DiaFestivoMadridRead     — salida de un festivo (GET).
DiaFestivoMadridListResp — lista de festivos de un año + flag de cálculo.
DiaFestivoMadridCreate   — entrada para crear festivo manual (POST).
DiaFestivoMadridUpdate   — entrada para editar festivo (PUT).
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Lectura ──────────────────────────────────────────────────────────────

class DiaFestivoMadridRead(BaseModel):
    """Festivo individual tal como sale de BD."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    anio: int
    fecha: date
    nombre: str
    ambito: Literal["NACIONAL", "CCAA", "LOCAL"]
    origen: Literal["AUTO", "MANUAL"]
    activo: bool


class DiaFestivoMadridListResp(BaseModel):
    """
    Respuesta del endpoint GET /calendario_laboral/festivos?anio=YYYY.

    `calculados_ahora` es True cuando el endpoint detectó que no había datos
    para ese año y los acaba de calcular y guardar.  Útil para que el frontend
    muestre un mensaje "Festivos generados automáticamente para 2026".
    """

    anio: int
    total: int
    calculados_ahora: bool
    festivos: list[DiaFestivoMadridRead]


# ── Escritura ────────────────────────────────────────────────────────────

class DiaFestivoMadridCreate(BaseModel):
    """Crear festivo manual (origen siempre = MANUAL)."""

    fecha: date
    nombre: str = Field(min_length=1, max_length=150)
    ambito: Literal["NACIONAL", "CCAA", "LOCAL"] = "NACIONAL"
    activo: bool = True


class DiaFestivoMadridUpdate(BaseModel):
    """
    Editar un festivo existente. Todos los campos opcionales.

    Cualquier edición marca el festivo como origen=MANUAL automáticamente
    en el servicio (para que el "Recalcular automático" no lo sobrescriba).
    """

    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    ambito: Literal["NACIONAL", "CCAA", "LOCAL"] | None = None
    activo: bool | None = None


# ── Recálculo ────────────────────────────────────────────────────────────

class RecalcularResp(BaseModel):
    """Respuesta del endpoint POST /calendario_laboral/festivos/{anio}/recalcular."""

    anio: int
    eliminados_auto: int
    creados: int
    mantenidos_manual: int
