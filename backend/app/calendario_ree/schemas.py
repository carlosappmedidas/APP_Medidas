# app/calendario_ree/schemas.py
# pyright: reportMissingImports=false
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, field_validator


class ReeCalendarFileBase(BaseModel):
    anio: int
    filename: str

    @field_validator("anio")
    @classmethod
    def validate_anio(cls, v: int) -> int:
        if v < 2000 or v > 2100:
            raise ValueError("anio debe estar entre 2000 y 2100")
        return v


class ReeCalendarFileRead(ReeCalendarFileBase):
    id: int
    tenant_id: int
    storage_key: str | None = None
    mime_type: str | None = None
    status: str
    is_active: bool
    uploaded_by: int
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ReeCalendarOperativoItemRead(BaseModel):
    id: int
    anio: int
    fecha: date
    mes_visual: str
    categoria: str
    evento: str
    mes_afectado: str
    estado: str
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class ReeCalendarOperativoResponse(BaseModel):
    anio: int | None
    source: str
    page: int
    page_size: int
    total: int
    pages: int
    total_hitos: int
    hitos_pendientes: int
    hitos_cerrados: int
    categoria_actual: str | None
    proximo_hito: ReeCalendarOperativoItemRead | None
    proximos_hitos: list[ReeCalendarOperativoItemRead]
    items: list[ReeCalendarOperativoItemRead]


class ReeCalendarOperativoSeedRequest(BaseModel):
    anio: int

    @field_validator("anio")
    @classmethod
    def validate_anio(cls, v: int) -> int:
        if v < 2000 or v > 2100:
            raise ValueError("anio debe estar entre 2000 y 2100")
        return v


class ReeCalendarWorkbookSheetRowRead(BaseModel):
    cells: list[str]


class ReeCalendarWorkbookSheetRead(BaseModel):
    name: str
    max_columns: int
    rows: list[ReeCalendarWorkbookSheetRowRead]


class ReeCalendarWorkbookPreviewResponse(BaseModel):
    sheets: list[ReeCalendarWorkbookSheetRead]


class ReeCalendarDashboardHitosResponse(BaseModel):
    anio: int | None
    mes: int | None
    mes_label: str | None

    fecha_publicacion_m2: date | None
    mes_afectado_publicacion_m2: str | None

    fecha_publicacion_m7: date | None
    mes_afectado_publicacion_m7: str | None

    fecha_limite_respuesta_objeciones: date | None
    mes_afectado_limite_respuesta_objeciones: str | None

    fecha_publicacion_m11: date | None
    mes_afectado_publicacion_m11: str | None

    fecha_publicacion_art15: date | None
    mes_afectado_publicacion_art15: str | None