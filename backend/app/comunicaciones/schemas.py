# app/comunicaciones/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


# ── FtpConfig ─────────────────────────────────────────────────────────────────

class FtpConfigCreate(BaseModel):
    empresa_id:        int
    nombre:            Optional[str] = None
    host:              str
    puerto:            int  = 22221
    usuario:           str
    password:          str
    directorio_remoto: str  = "/"
    usar_tls:          bool = True
    activo:            bool = True


class FtpConfigUpdate(BaseModel):
    nombre:            Optional[str]  = None
    host:              Optional[str]  = None
    puerto:            Optional[int]  = None
    usuario:           Optional[str]  = None
    password:          Optional[str]  = None
    directorio_remoto: Optional[str]  = None
    usar_tls:          Optional[bool] = None
    activo:            Optional[bool] = None


class FtpConfigRead(BaseModel):
    id:                int
    empresa_id:        int
    empresa_nombre:    str
    nombre:            Optional[str]
    host:              str
    puerto:            int
    usuario:           str
    directorio_remoto: str
    usar_tls:          bool
    activo:            bool

    model_config = {"from_attributes": True}


# ── FtpSyncRule ───────────────────────────────────────────────────────────────

class FtpSyncRuleCreate(BaseModel):
    config_id:       int
    nombre:          Optional[str] = None
    directorio:      str  = "/"
    patron_nombre:   Optional[str] = None   # vacío = todos los ficheros
    intervalo_horas: int  = 1               # 1, 6, 12, 24
    activo:          bool = True


class FtpSyncRuleUpdate(BaseModel):
    nombre:          Optional[str]  = None
    directorio:      Optional[str]  = None
    patron_nombre:   Optional[str]  = None
    intervalo_horas: Optional[int]  = None
    activo:          Optional[bool] = None


class FtpSyncRuleRead(BaseModel):
    id:               int
    config_id:        int
    config_nombre:    Optional[str]   # nombre de la conexión
    empresa_nombre:   str
    nombre:           Optional[str]
    directorio:       str
    patron_nombre:    Optional[str]
    intervalo_horas:  int
    activo:           bool
    ultima_ejecucion: Optional[datetime]
    proxima_ejecucion: Optional[datetime]

    model_config = {"from_attributes": True}


# ── FtpSyncLog ────────────────────────────────────────────────────────────────

class FtpSyncLogRead(BaseModel):
    id:             int
    empresa_id:     int
    empresa_nombre: str
    config_id:      Optional[int]
    rule_id:        Optional[int]
    origen:         str             # "manual" | "auto"
    nombre_fichero: str
    tamanio:        Optional[int] = None
    estado:         str
    mensaje_error:  Optional[str] = None
    created_at:     datetime

    model_config = {"from_attributes": True}


# ── Fichero remoto ────────────────────────────────────────────────────────────

class FtpFichero(BaseModel):
    nombre:  str
    tamanio: int
    fecha:   str


# ── Payloads ──────────────────────────────────────────────────────────────────

class DescargarPayload(BaseModel):
    ficheros: List[str]


class TestResponse(BaseModel):
    ok:      bool
    message: str


class DescargarResponse(BaseModel):
    descargados: int
    errores:     int
    detalle:     List[str]
