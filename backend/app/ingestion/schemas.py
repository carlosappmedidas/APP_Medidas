# app/ingestion/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class IngestionFileBase(BaseModel):
    empresa_id: int
    tipo: str
    anio: int
    mes: int
    filename: str

    @field_validator("anio")
    @classmethod
    def validate_anio(cls, v: int) -> int:
        if v < 2000 or v > 2100:
            raise ValueError("anio debe estar entre 2000 y 2100")
        return v

    @field_validator("mes")
    @classmethod
    def validate_mes(cls, v: int) -> int:
        if v < 1 or v > 12:
            raise ValueError("mes debe estar entre 1 y 12")
        return v


class IngestionFileCreate(IngestionFileBase):
    """
    Datos que envía el cliente para registrar un fichero.
    Por ahora asumimos que el fichero ya está subido en algún sitio
    (más adelante será un upload real a S3).
    """

    storage_key: str | None = None


class IngestionFileRead(IngestionFileBase):
    id: int
    tenant_id: int
    storage_key: str | None = None
    status: str
    rows_ok: int | None = None
    rows_error: int | None = None
    error_message: str | None = None

    warnings: list[Any] = Field(default_factory=list)

    created_at: datetime
    updated_at: datetime | None = None
    processed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class IngestionProcessResult(BaseModel):
    """
    (Opcional) Body para procesar fichero.
    De momento lo vamos a dejar vacío para simplificar
    pero más adelante podríamos enviar rows_ok, etc.
    """

    ok: bool = True


# ============================================================
# DELETE PREVIEW
# ============================================================


class IngestionDeletePreviewFilters(BaseModel):
    tenant_id: int | None = None
    empresa_id: int | None = None
    tipo: str | None = None
    status_: str | None = None
    anio: int | None = None
    mes: int | None = None


class IngestionDeletePreviewFileItem(BaseModel):
    ingestion_file_id: int
    tenant_id: int
    empresa_id: int
    tipo: str
    anio: int
    mes: int
    filename: str
    status: str


class IngestionDeletePreviewAffectedPeriod(BaseModel):
    tenant_id: int
    empresa_id: int
    anio: int
    mes: int

    # Qué se borra directamente por los ingestion_files seleccionados
    m1_contributions_from_selected_files: int = 0
    general_contributions_from_selected_files: int = 0
    bald_contributions_from_selected_files: int = 0
    ps_detail_from_selected_files: int = 0
    ps_contributions_from_selected_files: int = 0

    # Medidas que quedarían sin soporte y se limpiarían
    medidas_general_direct: int = 0
    medidas_general_orphan: int = 0
    medidas_ps_direct: int = 0
    medidas_ps_orphan: int = 0

    # Contexto útil para UI / negocio
    has_refacturas_m1: bool = False
    total_energia_refacturada_m1_kwh: float = 0.0
    notes: list[str] = Field(default_factory=list)


class IngestionDeletePreviewSummary(BaseModel):
    selected_ingestion_files: int = 0

    deleted_m1_period_contributions: int = 0
    deleted_general_period_contributions: int = 0
    deleted_bald_period_contributions: int = 0
    deleted_ps_period_detail: int = 0
    deleted_ps_period_contributions: int = 0

    deleted_medidas_general_direct: int = 0
    deleted_medidas_general_orphan: int = 0
    deleted_medidas_ps_direct: int = 0
    deleted_medidas_ps_orphan: int = 0


class IngestionDeletePreviewResponse(BaseModel):
    filters: IngestionDeletePreviewFilters
    summary: IngestionDeletePreviewSummary
    files: list[IngestionDeletePreviewFileItem] = Field(default_factory=list)
    affected_periods: list[IngestionDeletePreviewAffectedPeriod] = Field(default_factory=list)


class IngestionDeleteResult(BaseModel):
    deleted_ingestion_files: int
    deleted_m1_period_contributions: int
    deleted_general_period_contributions: int
    deleted_bald_period_contributions: int
    deleted_ps_period_detail: int
    deleted_ps_period_contributions: int
    deleted_medidas_general_direct: int
    deleted_medidas_general_orphan: int
    deleted_medidas_ps_direct: int
    deleted_medidas_ps_orphan: int
    filters: IngestionDeletePreviewFilters