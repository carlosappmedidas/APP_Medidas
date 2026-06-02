# app/stg/schemas.py
# pyright: reportMissingImports=false
"""
Schemas Pydantic v2 del módulo STG.
"""
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Tipos comunes
# ---------------------------------------------------------------------------
TipoConexion = Literal["gisce", "sftp", "ftp", "api_rest", "db_directa"]
EstadoConexion = Literal["desconocido", "ok", "error", "no_probado"]
EstadoComunicacion = Literal["online", "offline", "alerta", "desconocido"]
TipoFichero = Literal["S02", "S04", "S05", "S09"]
EstadoSolicitud = Literal["pendiente", "enviada", "en_proceso", "recibida", "error"]
Prioridad = Literal["normal", "alta", "urgente"]


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
class DashboardSummary(BaseModel):
    empresa_id: int
    cups_total: int
    cups_online: int
    cups_offline: int
    porcentaje_online: float
    concentradores_total: int
    concentradores_alerta: int
    concentradores_offline: int
    solicitudes_pendientes: int
    solicitudes_en_proceso: int


# ---------------------------------------------------------------------------
# ConexionStgEmpresa
# ---------------------------------------------------------------------------
class ConexionStgEmpresaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    tipo: TipoConexion
    nombre: Optional[str] = None
    activo: bool
    host: Optional[str] = None
    puerto: Optional[int] = None
    usuario: Optional[str] = None
    ruta_base: Optional[str] = None
    config_extra: Optional[dict] = None
    carpeta_recepcion: Optional[str] = None
    carpeta_envio: Optional[str] = None
    usar_tls: bool = True
    ultimo_ping: Optional[datetime] = None
    estado: EstadoConexion
    ultimo_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ConexionStgEmpresaCreate(BaseModel):
    empresa_id: int
    tipo: TipoConexion
    nombre: Optional[str] = None
    host: Optional[str] = None
    puerto: Optional[int] = None
    usuario: Optional[str] = None
    password: Optional[str] = None
    ruta_base: Optional[str] = None
    config_extra: Optional[dict] = None
    carpeta_recepcion: Optional[str] = None
    carpeta_envio: Optional[str] = None
    usar_tls: Optional[bool] = None
    activo: bool = True


class ConexionStgEmpresaUpdate(BaseModel):
    tipo: Optional[TipoConexion] = None
    nombre: Optional[str] = None
    host: Optional[str] = None
    puerto: Optional[int] = None
    usuario: Optional[str] = None
    password: Optional[str] = None
    ruta_base: Optional[str] = None
    config_extra: Optional[dict] = None
    carpeta_recepcion: Optional[str] = None
    carpeta_envio: Optional[str] = None
    usar_tls: Optional[bool] = None
    activo: Optional[bool] = None


class ConexionTestResult(BaseModel):
    ok: bool
    mensaje: str
    tiempo_ms: Optional[int] = None


# ---------------------------------------------------------------------------
# Concentrador
# ---------------------------------------------------------------------------
class ConcentradorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    codigo_ct: str
    nombre: Optional[str] = None
    numero_serie: Optional[str] = None
    direccion: Optional[str] = None
    municipio: Optional[str] = None
    provincia: Optional[str] = None
    codigo_postal: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    ip: Optional[str] = None
    fabricante: Optional[str] = None
    modelo: Optional[str] = None
    firmware: Optional[str] = None
    protocolo_pmi: Optional[str] = None
    numero_cups_asociados: Optional[int] = None
    ultimo_contacto: Optional[datetime] = None
    estado_comunicacion: EstadoComunicacion
    activo: bool


class ConcentradorList(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[ConcentradorRead]


# ---------------------------------------------------------------------------
# Cups
# ---------------------------------------------------------------------------
class CupsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    cups: str
    concentrador_id: Optional[int] = None
    concentrador_codigo_ct: Optional[str] = None
    numero_contador: Optional[str] = None
    fabricante_contador: Optional[str] = None
    modelo_contador: Optional[str] = None
    tarifa: Optional[str] = None
    tension_suministro: Optional[str] = None
    tipo_punto_medida: Optional[int] = None
    direccion: Optional[str] = None
    municipio: Optional[str] = None
    provincia: Optional[str] = None
    cp: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    autoconsumo: bool = False
    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None
    comercializadora_actual: Optional[str] = None
    ultimo_contacto: Optional[datetime] = None
    estado_comunicacion: EstadoComunicacion
    activo: bool


class CupsList(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[CupsRead]


# ---------------------------------------------------------------------------
# SolicitudFichero
# ---------------------------------------------------------------------------
class SolicitudFicheroRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    cups_id: Optional[int] = None
    cups_codigo: Optional[str] = None
    concentrador_id: Optional[int] = None
    concentrador_codigo_ct: Optional[str] = None
    tipo_fichero: TipoFichero
    fecha_desde: date
    fecha_hasta: date
    prioridad: Prioridad
    estado: EstadoSolicitud
    solicitado_por: int
    mensaje_error: Optional[str] = None
    fecha_envio: Optional[datetime] = None
    fecha_recepcion: Optional[datetime] = None
    created_at: datetime


class SolicitudFicheroCreate(BaseModel):
    empresa_id: int
    cups_id: Optional[int] = None
    concentrador_id: Optional[int] = None
    tipo_fichero: TipoFichero
    fecha_desde: date
    fecha_hasta: date
    prioridad: Prioridad = "normal"


class SolicitudFicheroUpdate(BaseModel):
    estado: Optional[EstadoSolicitud] = None
    mensaje_error: Optional[str] = None


class SolicitudFicheroList(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[SolicitudFicheroRead]


# ---------------------------------------------------------------------------
# FicheroRecibido
# ---------------------------------------------------------------------------
class FicheroRecibidoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    solicitud_id: Optional[int] = None
    cups_id: Optional[int] = None
    tipo_fichero: TipoFichero
    path: str
    nombre_original: Optional[str] = None
    tamano_bytes: Optional[int] = None
    periodo_dato_desde: Optional[date] = None
    periodo_dato_hasta: Optional[date] = None
    parsed: bool
    parsed_at: Optional[datetime] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# SFTP — listado de ficheros disponibles en el SFTP del cliente
# (solo lectura, Paquete 3)
# ---------------------------------------------------------------------------
class SftpFicheroDisponible(BaseModel):
    nombre: str
    tamano_bytes: int
    modificado: Optional[datetime] = None


class SftpListadoResponse(BaseModel):
    empresa_id: int
    ruta_consultada: str
    total: int
    items: List[SftpFicheroDisponible]
