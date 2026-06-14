"""
Schemas Pydantic para el modulo WS-PRIME.

Sirven como contrato de entrada/salida de los endpoints REST.
Envuelven los resultados del cliente (dict simple) en modelos
tipados para FastAPI/OpenAPI.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


# ============================================================
# Fabricantes validos. Debe sincronizarse con:
#   - models.py FABRICANTES_VALIDOS
#   - factory.py FABRICANTES_VALIDOS
# ============================================================
Fabricante = Literal["mock", "circutor", "ziv", "sagemcom", "landis"]


# ============================================================
# Entrada: crear configuracion WS-PRIME para un concentrador
# ============================================================
class WsPrimeConfigCreate(BaseModel):
    """Payload para POST /stg/wsprime/config."""

    concentrador_id: int = Field(
        ..., gt=0, description="ID del stg_concentrador asociado"
    )
    fabricante: Fabricante = Field(..., description="Fabricante del concentrador")
    url: HttpUrl = Field(..., description="URL del endpoint WS-PRIME")
    usuario: str = Field(
        ..., min_length=1, max_length=100, description="Usuario WS-PRIME"
    )
    password: str = Field(
        ..., min_length=1, description="Password en claro (se cifra antes de guardar)"
    )
    timeout_segundos: int = Field(default=30, ge=1, le=300)
    verify_ssl: bool = Field(default=True)
    activo: bool = Field(default=True)


# ============================================================
# Entrada: actualizar configuracion (PATCH)
# Todos los campos opcionales.
# ============================================================
class WsPrimeConfigUpdate(BaseModel):
    """Payload para PATCH /stg/wsprime/config/{concentrador_id}."""

    fabricante: Fabricante | None = None
    url: HttpUrl | None = None
    usuario: str | None = Field(default=None, min_length=1, max_length=100)
    password: str | None = Field(default=None, min_length=1)
    timeout_segundos: int | None = Field(default=None, ge=1, le=300)
    verify_ssl: bool | None = None
    activo: bool | None = None


# ============================================================
# Salida: configuracion almacenada (sin password)
# ============================================================
class WsPrimeConfigOut(BaseModel):
    """Respuesta del GET/POST/PATCH config. Nunca expone password_cifrado."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    concentrador_id: int
    fabricante: str
    url: str
    usuario: str
    timeout_segundos: int
    verify_ssl: bool
    activo: bool
    ultima_conexion_at: datetime | None = None
    ultima_conexion_ok: bool | None = None
    ultima_conexion_error: str | None = None
    created_at: datetime
    updated_at: datetime


# ============================================================
# Salida: resultado de test de conexion
# Envuelve el dict del cliente {'ok', 'mensaje', 'info'}
# ============================================================
class WsPrimeTestResult(BaseModel):
    """Respuesta de POST /stg/wsprime/test/{concentrador_id}."""

    ok: bool
    mensaje: str
    info: dict[str, Any] | None = None


# ============================================================
# Salida: info general del concentrador
# Envuelve el dict del cliente {'ok', 'mensaje', 'info'}
# ============================================================
class WsPrimeInfoGeneral(BaseModel):
    """Respuesta de GET /stg/wsprime/info/{concentrador_id}."""

    ok: bool
    mensaje: str
    info: dict[str, Any] | None = None