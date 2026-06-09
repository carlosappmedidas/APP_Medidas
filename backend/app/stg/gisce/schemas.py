# app/stg/gisce/schemas.py
# pyright: reportMissingImports=false
"""Schemas Pydantic del modulo GISCE."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class GisceConfigIn(BaseModel):
    """Payload para crear/actualizar la config GISCE."""
    nombre: Optional[str] = Field(None, max_length=100)
    host: str = Field(..., min_length=1, max_length=200)
    puerto: int = Field(8069, ge=1, le=65535)
    database: str = Field(..., min_length=1, max_length=100)
    usuario: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)  # texto plano, se cifra al guardar
    activo: bool = True


class GisceConfigOut(BaseModel):
    """Respuesta (NUNCA incluye el password)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    nombre: Optional[str] = None
    host: str
    puerto: int
    database: str
    usuario: str
    activo: bool
    ultimo_import: Optional[datetime] = None
    estado: str
    ultimo_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class GisceTestResult(BaseModel):
    """Resultado de POST /stg/gisce/test."""
    ok: bool
    uid: Optional[int] = None
    estado: str  # "ok" | "error"
    mensaje: str
    detalle: Optional[str] = None


class GiscePreviewItem(BaseModel):
    """Item individual del preview (un CT o un CUPS)."""
    codigo: str
    accion: str  # "nuevo" | "modificar" | "sin_cambios" | "huerfano_local"
    detalle: Optional[str] = None


class GiscePreviewResult(BaseModel):
    """Resultado del dry-run de import desde GISCE."""
    ok: bool
    error: Optional[str] = None

    # Totales remotos en GISCE
    cts_remoto_total: int = 0
    cups_remoto_total: int = 0
    # Totales locales actuales (filtrados por empresa)
    cts_local_total: int = 0
    cups_local_total: int = 0

    # Diff CTs
    cts_nuevos: int = 0
    cts_modificar: int = 0
    cts_sin_cambios: int = 0
    cts_huerfanos_local: int = 0

    # Diff CUPS
    cups_nuevos: int = 0
    cups_modificar: int = 0
    cups_sin_cambios: int = 0
    cups_huerfanos_local: int = 0

    # Muestras (max 10 cada una: primero nuevos, luego modificar)
    cts_muestra: list[GiscePreviewItem] = []
    cups_muestra: list[GiscePreviewItem] = []


class GisceExecuteResult(BaseModel):
    """Resultado del import real (no dry-run) desde GISCE.

    Alcance Paquete 8f-4 inicial: cambios en CTs
    (UPDATE de stg_concentrador.id_externo_gisce + direccion).
    Paquete 8g-B2: UPSERT en stg_cups con datos de giscedata.cups.ps.
    """
    ok: bool
    error: Optional[str] = None

    # Totales
    cts_remoto_total: int = 0
    cts_local_total: int = 0

    # Aplicados CTs
    cts_actualizados: int = 0     # CTs que recibieron id_externo_gisce
    cts_sin_cambios: int = 0      # CTs ya enlazados (idempotencia)

    # No aplicados (informativos)
    cts_skipped_nuevos: int = 0   # CTs en GISCE no presentes en BD (no se crean)
    cts_skipped_huerfanos: int = 0  # PLCs en BD no presentes en GISCE

    # Muestra hasta 10 de los actualizados
    cts_actualizados_muestra: list[GiscePreviewItem] = []
    cts_skipped_nuevos_muestra: list[GiscePreviewItem] = []

    # -- Paquete 8g-B2: counts CUPS --
    cups_remoto_total: int = 0
    cups_local_total: int = 0
    cups_creados: int = 0
    cups_actualizados: int = 0
    cups_sin_cambios: int = 0
    cups_skipped_sin_ct: int = 0    # CUPS GISCE cuyo et no matchea con un CT local
    cups_huerfanos: int = 0         # CUPS local que ya no esta en GISCE
    cups_creados_muestra: list[GiscePreviewItem] = []
    cups_actualizados_muestra: list[GiscePreviewItem] = []

    # -- Paquete 8g-C: counts enlace contador <-> CUPS --
    contadores_remoto_total: int = 0
    contadores_local_total: int = 0
    contadores_enlazados: int = 0        # contadores que recibieron cups_id por primera vez
    contadores_actualizados: int = 0     # contadores con cups_id que cambio
    contadores_sin_cambios: int = 0      # ya tenian el cups_id correcto
    contadores_sin_match_meter: int = 0  # contador GISCE cuyo meter no esta en stg_contador
    contadores_sin_cups_local: int = 0   # contador GISCE cuyo cups GISCE no esta en stg_cups
    contadores_enlazados_muestra: list[GiscePreviewItem] = []

    # Timestamp del import
    fecha_import: Optional[datetime] = None
