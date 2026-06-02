# app/stg/models.py
# pyright: reportMissingImports=false
"""
Modelos SQLAlchemy del módulo STG (Sistema de Telegestión).

Hay 5 tablas:
  - stg_conexion_empresa     → configuración de conexión por empresa
  - stg_concentrador         → catálogo de concentradores (DCU)
  - stg_cups                 → CUPS telegestionados
  - stg_solicitud_fichero    → peticiones manuales del usuario
  - stg_fichero_recibido     → ficheros S0X descargados

Todas llevan tenant_id + empresa_id para multi-tenant/multi-empresa,
igual que el resto de tablas de la app.
"""
from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey,
    Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.models_base import Base, TimestampMixin


# ---------------------------------------------------------------------------
# 1) ConexionStgEmpresa  -- configuración por empresa
# ---------------------------------------------------------------------------
class ConexionStgEmpresa(TimestampMixin, Base):
    """
    Configuración de conexión al STG de una empresa.

    tipo:
        "gisce"      → habla XML-RPC contra el GISCE de la empresa
        "sftp"       → recoge ficheros de un SFTP
        "api_rest"   → llama a una API REST genérica
        "db_directa" → lee directamente de la BD del STG

    estado:
        "desconocido" → aún no se ha probado
        "ok"          → último ping correcto
        "error"       → último ping falló (ver ultimo_error)
        "no_probado"  → configurado pero sin probar nunca
    """
    __tablename__ = "stg_conexion_empresa"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    tipo        = Column(String(20), nullable=False)
    nombre      = Column(String(255), nullable=True)
    activo      = Column(Boolean, nullable=False, default=True)

    host             = Column(String(255), nullable=True)
    puerto           = Column(Integer, nullable=True)
    usuario          = Column(String(255), nullable=True)
    password_cifrado = Column(Text, nullable=True)
    ruta_base        = Column(String(500), nullable=True)
    config_extra     = Column(JSON, nullable=True)

    ultimo_ping  = Column(DateTime, nullable=True)
    estado       = Column(String(20), nullable=False, default="desconocido")
    ultimo_error = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("empresa_id", name="uq_stg_conexion_empresa"),
    )


# ---------------------------------------------------------------------------
# 2) StgConcentrador (DCU)  -- catálogo de concentradores
# ---------------------------------------------------------------------------
class StgConcentrador(TimestampMixin, Base):
    """
    StgConcentrador (DCU) de un centro de transformación.

    estado_comunicacion:
        "online"      → comunica con normalidad
        "offline"     → sin contacto durante umbral configurado
        "alerta"      → comunica pero con incidencias (latencia, etc.)
        "desconocido" → aún no comprobado
    """
    __tablename__ = "stg_concentrador"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    codigo_ct       = Column(String(50), nullable=False)
    nombre          = Column(String(255), nullable=True)
    numero_serie    = Column(String(50), nullable=True)
    direccion       = Column(String(500), nullable=True)
    municipio       = Column(String(100), nullable=True)
    provincia       = Column(String(100), nullable=True)
    codigo_postal   = Column(String(10), nullable=True)
    latitud         = Column(Float, nullable=True)
    longitud        = Column(Float, nullable=True)
    ip              = Column(String(50), nullable=True)

    fabricante      = Column(String(100), nullable=True)
    modelo          = Column(String(100), nullable=True)
    firmware        = Column(String(50), nullable=True)
    protocolo_pmi   = Column(String(30), nullable=True)

    numero_cups_asociados = Column(Integer, nullable=True)

    ultimo_contacto     = Column(DateTime, nullable=True)
    estado_comunicacion = Column(String(20), nullable=False, default="desconocido")
    activo              = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("empresa_id", "codigo_ct", name="uq_stg_concentrador_empresa_ct"),
    )


# ---------------------------------------------------------------------------
# 3) Cups  -- CUPS telegestionados
# ---------------------------------------------------------------------------
class Cups(TimestampMixin, Base):
    """
    Punto de suministro telegestionado.
    """
    __tablename__ = "stg_cups"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    cups            = Column(String(22), nullable=False, index=True)

    concentrador_id     = Column(Integer, ForeignKey("stg_concentrador.id"), nullable=True, index=True)
    numero_contador     = Column(String(50), nullable=True)
    fabricante_contador = Column(String(100), nullable=True)
    modelo_contador     = Column(String(100), nullable=True)

    tarifa              = Column(String(20), nullable=True)
    tension_suministro  = Column(String(10), nullable=True)
    tipo_punto_medida   = Column(Integer, nullable=True)

    direccion       = Column(String(500), nullable=True)
    municipio       = Column(String(100), nullable=True)
    provincia       = Column(String(100), nullable=True)
    cp              = Column(String(10), nullable=True)
    latitud         = Column(Float, nullable=True)
    longitud        = Column(Float, nullable=True)

    potencia_p1     = Column(Float, nullable=True)
    potencia_p2     = Column(Float, nullable=True)
    potencia_p3     = Column(Float, nullable=True)
    potencia_p4     = Column(Float, nullable=True)
    potencia_p5     = Column(Float, nullable=True)
    potencia_p6     = Column(Float, nullable=True)

    autoconsumo            = Column(Boolean, nullable=False, default=False)
    cnae                   = Column(String(10), nullable=True)
    fecha_alta             = Column(Date, nullable=True)
    fecha_baja             = Column(Date, nullable=True)
    comercializadora_actual = Column(String(50), nullable=True)

    ultimo_contacto     = Column(DateTime, nullable=True)
    estado_comunicacion = Column(String(20), nullable=False, default="desconocido")
    activo              = Column(Boolean, nullable=False, default=True)

    concentrador = relationship("StgConcentrador", lazy="joined")

    __table_args__ = (
        UniqueConstraint("empresa_id", "cups", name="uq_stg_cups_empresa_cups"),
    )


# ---------------------------------------------------------------------------
# 4) SolicitudFichero  -- peticiones manuales del usuario
# ---------------------------------------------------------------------------
class SolicitudFichero(TimestampMixin, Base):
    """
    Petición manual de un fichero S0X al STG del cliente.

    tipo_fichero:
        "S02" → curva horaria
        "S04" → lecturas diarias
        "S05" → lecturas instantáneas / absolutas
        "S09" → eventos

    estado:
        "pendiente"   → recién creada, aún no enviada
        "enviada"     → mandada al STG, esperando respuesta
        "en_proceso"  → el STG la está procesando
        "recibida"    → llegó el fichero (ver tabla stg_fichero_recibido)
        "error"       → falló, ver mensaje_error

    prioridad:
        "normal" / "alta" / "urgente"
    """
    __tablename__ = "stg_solicitud_fichero"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    cups_id          = Column(Integer, ForeignKey("stg_cups.id"), nullable=True, index=True)
    concentrador_id  = Column(Integer, ForeignKey("stg_concentrador.id"), nullable=True, index=True)

    tipo_fichero  = Column(String(10), nullable=False, index=True)
    fecha_desde   = Column(Date, nullable=False)
    fecha_hasta   = Column(Date, nullable=False)
    prioridad     = Column(String(10), nullable=False, default="normal")

    estado          = Column(String(20), nullable=False, default="pendiente", index=True)
    solicitado_por  = Column(Integer, ForeignKey("users.id"), nullable=False)
    mensaje_error   = Column(Text, nullable=True)
    fecha_envio     = Column(DateTime, nullable=True)
    fecha_recepcion = Column(DateTime, nullable=True)

    cups          = relationship("Cups", lazy="joined")
    concentrador  = relationship("StgConcentrador", lazy="joined")


# ---------------------------------------------------------------------------
# 5) FicheroRecibido  -- ficheros S0X descargados
# ---------------------------------------------------------------------------
class FicheroRecibido(TimestampMixin, Base):
    """
    Fichero S0X que ha llegado del STG. Se asocia a la solicitud
    (si vino por petición) y opcionalmente al CUPS concreto.
    """
    __tablename__ = "stg_fichero_recibido"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    solicitud_id = Column(Integer, ForeignKey("stg_solicitud_fichero.id"), nullable=True, index=True)
    cups_id      = Column(Integer, ForeignKey("stg_cups.id"), nullable=True, index=True)

    tipo_fichero      = Column(String(10), nullable=False, index=True)
    path              = Column(String(500), nullable=False)
    nombre_original   = Column(String(255), nullable=True)
    tamano_bytes      = Column(Integer, nullable=True)
    periodo_dato_desde = Column(Date, nullable=True)
    periodo_dato_hasta = Column(Date, nullable=True)

    parsed     = Column(Boolean, nullable=False, default=False)
    parsed_at  = Column(DateTime, nullable=True)

    solicitud  = relationship("SolicitudFichero", lazy="joined")
    cups       = relationship("Cups", lazy="joined")
