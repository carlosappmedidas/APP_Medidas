# app/comunicaciones/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


# ── FtpConfig ─────────────────────────────────────────────────────────────────

class FtpConfigCreate(BaseModel):
    empresa_id: int
    host: str
    puerto: int = 22221
    usuario: str
    password: str
    directorio_remoto: str = "/"
    activo: bool = True


class FtpConfigUpdate(BaseModel):
    host: Optional[str] = None
    puerto: Optional[int] = None
    usuario: Optional[str] = None
    password: Optional[str] = None
    directorio_remoto: Optional[str] = None
    activo: Optional[bool] = None


class FtpConfigRead(BaseModel):
    id: int
    empresa_id: int
    empresa_nombre: str
    host: str
    puerto: int
    usuario: str
    directorio_remoto: str
    activo: bool

    model_config = {"from_attributes": True}


# ── FtpSyncLog ────────────────────────────────────────────────────────────────

class FtpSyncLogRead(BaseModel):
    id: int
    empresa_id: int
    empresa_nombre: str
    nombre_fichero: str
    tamanio: Optional[int] = None
    estado: str
    mensaje_error: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Fichero remoto ────────────────────────────────────────────────────────────

class FtpFichero(BaseModel):
    nombre: str
    tamanio: int
    fecha: str


# ── Payloads ──────────────────────────────────────────────────────────────────

class DescargarPayload(BaseModel):
    ficheros: List[str]


class TestResponse(BaseModel):
    ok: bool
    message: str


class DescargarResponse(BaseModel):
    descargados: int
    errores: int
    detalle: List[str]
