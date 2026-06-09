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
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime, Float, ForeignKey,
    Integer, JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
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

    # Carpetas funcionales (similar al patrón de ftp_configs en comunicaciones)
    # - carpeta_recepcion: ruta donde el STG nos deja los ficheros S0X.
    #   Admite plantillas: {anio}, {mes}, {mes_actual} (YYYY-MM), {mes_anterior}.
    # - carpeta_envio: ruta donde subimos peticiones. FIJA, sin plantillas.
    # - usar_tls: si el SFTP usa TLS (FTPS) o SSH puro (SFTP). Por defecto True.
    carpeta_recepcion = Column(String(500), nullable=True)
    carpeta_envio     = Column(String(500), nullable=True)
    usar_tls          = Column(Boolean, nullable=False, default=True)

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

    # Paquete 8c — campos administrativos (no vienen en STG, se cargan por Excel/GISCE)
    cups            = Column(String(22), nullable=True)
    id_ct           = Column(String(50), nullable=True)
    nombre_ct       = Column(String(255), nullable=True)

    # Paquete 8f — ID externo del concentrador en GISCE-ERP (campo `et` del XML-RPC)
    id_externo_gisce = Column(Integer, nullable=True, index=True)
    # Capa de dispositivo: 'concentrador_plc' (Circutor PLC del CT) o 'medidor_cabecera'
    # (CIR de cabecera que aparece en los nombres de fichero S0X).
    tipo_dispositivo = Column(String(30), nullable=True, index=True)
    legacy_cabecera_id = Column(Integer, ForeignKey('stg_concentrador.id', ondelete='SET NULL'), nullable=True, index=True)

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

    # -- Datos administrativos importados de GISCE (Paquete 8f) --
    titular = Column(String(255), nullable=True)

    # -- Paquete 8g-B1: enlace al CUPS en GISCE (giscedata.cups.ps.id) --
    id_externo_gisce = Column(Integer, nullable=True, index=True)

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

    # Metadata extraída del nombre del fichero al descargarlo (Paquete 5)
    id_contador      = Column(String(50), nullable=True, index=True)
    tipo_mensaje     = Column(String(20), nullable=True)
    timestamp_nombre = Column(DateTime, nullable=True, index=True)
    ruta_remota      = Column(String(500), nullable=True)

    parsed     = Column(Boolean, nullable=False, default=False)
    parsed_at  = Column(DateTime, nullable=True)
    # Mensaje de error si falló el parseo (Paquete 6). NULL si OK o aún no intentado.
    parse_error = Column(Text, nullable=True)

    solicitud  = relationship("SolicitudFichero", lazy="joined")
    cups       = relationship("Cups", lazy="joined")


# ---------------------------------------------------------------------------
# 6) Contador  -- contador físico detectado en S24 (Paquete 6)
# ---------------------------------------------------------------------------
class Contador(TimestampMixin, Base):
    """
    Contador físico observado en informes S24.

    El meter_id es el identificador del contador tal como aparece en el XML
    (p.ej. "CIR0141406756", "LGZ0012240491", "ZIV0037156307").
    No es lo mismo que un CUPS oficial (que se enlaza opcionalmente via cups_id).

    fabricante se deriva del prefijo del meter_id:
        CIR -> Circutor
        LGZ -> Landis+Gyr
        SAG -> Sagemcom
        ZIV -> ZIV
        ITE -> ITE / Itron

    estado_comunicacion:
        "ok"           -> ComStatus == 2
        "warning"      -> ComStatus == 1
        "error"        -> ComStatus == 0
        "desconocido"  -> aún no observado
    """
    __tablename__ = "stg_contador"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    concentrador_id = Column(Integer, ForeignKey("stg_concentrador.id"), nullable=True, index=True)
    cups_id         = Column(Integer, ForeignKey("stg_cups.id"), nullable=True, index=True)

    meter_id    = Column(String(50), nullable=False, index=True)
    fabricante  = Column(String(10), nullable=True)

    ultimo_contacto     = Column(DateTime, nullable=True)
    estado_comunicacion = Column(String(20), nullable=False, default="desconocido")
    activo              = Column(Boolean, nullable=False, default=True)

    concentrador = relationship("StgConcentrador", lazy="joined")
    cups         = relationship("Cups", lazy="joined")

    __table_args__ = (
        UniqueConstraint("empresa_id", "meter_id", name="uq_stg_contador_empresa_meter"),
    )


# ---------------------------------------------------------------------------
# 7) Medida  -- evento o medida individual parseada de un fichero (Paquete 6)
# ---------------------------------------------------------------------------
class Medida(Base):
    """
    Medida individual extraída de un fichero parseado.

    Para S24:
      - una fila por cada <Meter> dentro de cada <S24> de un fichero
      - timestamp_dato es el timestamp del informe (Fh del S24)
      - datos = {'status': 2, 'active': true, 'meter_timestamp': '...', 'season': 'W'}

    Diseño deliberadamente genérico (JSONB en `datos`) para soportar
    cualquier tipo de informe sin migración por cada tipo nuevo.
    """
    __tablename__ = "stg_medida"

    id          = Column(BigInteger, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    fichero_id  = Column(Integer, ForeignKey("stg_fichero_recibido.id"), nullable=False, index=True)

    concentrador_id = Column(Integer, ForeignKey("stg_concentrador.id"), nullable=True, index=True)
    contador_id     = Column(Integer, ForeignKey("stg_contador.id"), nullable=True, index=True)

    tipo_fichero       = Column(String(10), nullable=False, index=True)
    timestamp_dato     = Column(DateTime, nullable=True, index=True)
    concentrador_externo_id = Column(String(50), nullable=True)
    meter_id           = Column(String(50), nullable=True, index=True)

    datos      = Column(JSONB, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# StgImportConfig — Paquete 8e-2a
# ---------------------------------------------------------------------------
class StgImportConfig(TimestampMixin, Base):
    """
    Configuración de origen de imports administrativos.

    Una fila por (empresa_id, origen) donde origen ∈ {excel, gisce_os, sips_cnmc}.
    - mapeo_columnas: dict que mapea "columna_excel" → "campo_concentrador"
    - configuracion:  credenciales / opciones específicas del origen
    """
    __tablename__ = "stg_import_config"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    origen          = Column(String(20), nullable=False)   # "excel" | "gisce_os" | "sips_cnmc"
    mapeo_columnas  = Column(JSON, nullable=True)
    configuracion   = Column(JSON, nullable=True)
    activo          = Column(Boolean, nullable=False, default=True)
    last_sync       = Column(DateTime, nullable=True)
    last_sync_status = Column(String(30), nullable=True)
    last_sync_resumen = Column(JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint("empresa_id", "origen", name="uq_stg_import_config_empresa_origen"),
    )



# ---------------------------------------------------------------------------
# 9) StgGisceConfig  --  configuracion del importador GISCE-ERP (Paquete 8f)
# ---------------------------------------------------------------------------
class StgGisceConfig(TimestampMixin, Base):
    """
    Configuracion del importador GISCE-ERP por empresa.

    A diferencia de stg_conexion_empresa (que define donde descargar
    ficheros S0X del STG via FTP/SFTP), esta tabla define donde
    conectarse al ERP GISCE via XML-RPC para importar datos
    administrativos (CTs, CUPS oficiales, titulares).

    Una empresa puede tener simultaneamente una stg_conexion_empresa
    (STG) y una stg_gisce_config (ERP administrativo), porque GISCE-ERP
    es un sistema paralelo y opcional al STG.

    Campos:
        host             -> IP o dominio del servidor GISCE-ERP
        puerto           -> puerto XML-RPC (default 8069, estandar Odoo/OpenERP)
        database         -> nombre de la BD ERPweb del cliente
        usuario          -> usuario XML-RPC con permisos de lectura
        password_cifrado -> password cifrado con Fernet (app/core/crypto.py)
        estado:
            "no_probado" -> configurado pero sin test de conexion
            "ok"         -> ultimo test correcto
            "error"      -> ultimo test fallo (ver ultimo_error)
    """
    __tablename__ = "stg_gisce_config"

    id          = Column(Integer, primary_key=True)
    tenant_id   = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id  = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    nombre      = Column(String(100), nullable=True)

    host             = Column(String(200), nullable=False)
    puerto           = Column(Integer, nullable=False, default=8069)
    database         = Column(String(100), nullable=False)
    usuario          = Column(String(100), nullable=False)
    password_cifrado = Column(Text, nullable=False)  # Fernet via app/core/crypto.py

    activo           = Column(Boolean, nullable=False, default=True)
    ultimo_import    = Column(DateTime, nullable=True)
    estado           = Column(String(20), nullable=False, default="no_probado")
    ultimo_error     = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("empresa_id", name="uq_stg_gisce_config_empresa"),
    )


# ---------------------------------------------------------------------------
# Constantes para tipo_dispositivo en stg_concentrador (Paquete 8f-tipo-dispositivo)
# ---------------------------------------------------------------------------
TIPO_CONCENTRADOR_PLC = "concentrador_plc"
TIPO_MEDIDOR_CABECERA = "medidor_cabecera"
TIPOS_DISPOSITIVO_VALIDOS: set[str] = {
    TIPO_CONCENTRADOR_PLC,
    TIPO_MEDIDOR_CABECERA,
}
