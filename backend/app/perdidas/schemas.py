# app/perdidas/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


# ── Concentrador ──────────────────────────────────────────────────────────────

class ConcentradorCreate(BaseModel):
    empresa_id:      int
    nombre_ct:       str
    id_concentrador: str
    id_supervisor:   Optional[str]  = None
    magn_supervisor: int            = 1000
    directorio_ftp:  Optional[str]  = None
    ftp_config_id:   Optional[int]  = None
    activo:          bool           = True


class ConcentradorUpdate(BaseModel):
    nombre_ct:       Optional[str]  = None
    id_supervisor:   Optional[str]  = None
    magn_supervisor: Optional[int]  = None
    directorio_ftp:  Optional[str]  = None
    ftp_config_id:   Optional[int]  = None
    activo:          Optional[bool] = None


class ConcentradorRead(BaseModel):
    id:                   int
    tenant_id:            int
    empresa_id:           int
    empresa_nombre:       str
    nombre_ct:            str
    id_concentrador:      str
    id_supervisor:        Optional[str]
    magn_supervisor:      int
    directorio_ftp:       Optional[str]
    ftp_config_id:        Optional[int]
    fecha_ultimo_proceso: Optional[date]
    activo:               bool
    created_at:           datetime
    updated_at:           datetime

    class Config:
        from_attributes = True


# ── Descubrimiento automático ─────────────────────────────────────────────────

class ConcentradorDescubierto(BaseModel):
    """Resultado del escaneo FTP — un concentrador detectado en un S02."""
    id_concentrador: str
    id_supervisor:   Optional[str]
    magn_supervisor: int
    num_contadores:  int
    directorio_ftp:  str
    nombre_fichero:  str
    ftp_config_id:   int
    ftp_config_nombre: str


# ── Pérdida diaria ────────────────────────────────────────────────────────────

class PerdidaDiariaRead(BaseModel):
    id:                int
    tenant_id:         int
    empresa_id:        int
    concentrador_id:   int
    nombre_ct:         str
    fecha:             date
    nombre_fichero_s02: Optional[str]
    ai_supervisor:     int
    ae_supervisor:     int
    ai_clientes:       int
    ae_clientes:       int
    energia_neta_wh:   int
    perdida_wh:        int
    perdida_pct:       Optional[Decimal]
    num_contadores:    int
    horas_con_datos:   int
    estado:            str
    created_at:        datetime

    class Config:
        from_attributes = True


# ── Pérdida mensual (calculada en tiempo real) ────────────────────────────────

class PerdidaMensualRead(BaseModel):
    concentrador_id:  int
    nombre_ct:        str
    empresa_id:       int
    anio:             int
    mes:              int
    ai_supervisor:    int
    ae_supervisor:    int
    ai_clientes:      int
    ae_clientes:      int
    energia_neta_wh:  int
    perdida_wh:       int
    perdida_pct:      Optional[Decimal]
    dias_procesados:  int
    dias_completos:   int   # días con estado=ok


# ── Procesamiento ─────────────────────────────────────────────────────────────

class ProcesarS02Request(BaseModel):
    concentrador_ids: Optional[list[int]] = None   # None = todos los activos
    fecha_desde:      date
    fecha_hasta:      date


class ProcesarS02Response(BaseModel):
    procesados:  int
    errores:     int
    omitidos:    int    # ya existían y no se reprocesaron
    detalle:     list[str]
