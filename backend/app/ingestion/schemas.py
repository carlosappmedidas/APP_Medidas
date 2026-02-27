# pyright: reportMissingImports=false

from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


class IngestionFileBase(BaseModel):
    empresa_id: int
    tipo: str
    anio: int
    mes: int
    filename: str

    @field_validator("anio")
    @classmethod
    def validate_anio(cls, v: int) -> int:
        # Ajusta el rango como quieras
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