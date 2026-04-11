# app/topologia/models.py
# pyright: reportMissingImports=false
"""
Modelos de BD para el módulo de topología de red.
Todos los campos corresponden a los definidos en la Circular CNMC 8/2021
(BOE-A-2021-21003) para los ficheros B1, B2, B11 y A1.
"""
from __future__ import annotations

from sqlalchemy import (
    Column,
    Date,
    Float,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)

from app.core.models_base import Base, TimestampMixin, TenantMixin


class CtInventario(TenantMixin, TimestampMixin, Base):
    """
    Centro de transformación — Formulario B2 (BOE-A-2021-21003).

    Índices de campo en el fichero (0-based):
      0  IDENTIFICADOR_CT
      1  CINI
      2  DENOMINACION
      3  CODIGO_CCUU
      4  NUDO_ALTA
      5  NUDO_BAJA
      6  TENSION_EXPLOTACION  (kV)
      7  TENSION_CONSTRUCCION (kV)
      8  POTENCIA             (kVA)
      9  COORDENADAS X        (UTM)
      10 COORDENADAS Y        (UTM)
      11 COORDENADAS Z        (ignorado)
      12 MUNICIPIO            (INE C4)
      13 PROVINCIA            (INE C2)
      14 CCAA                 (INE C2)
      15 ZONA                 (U/SU/RC/RD)
      16 ESTADO               (0/1/2)
      17 MODELO               (I/M/D/E)
      18 PUNTO_FRONTERA       (0/1)
      19 FECHA_APS
      20 CAUSA_BAJA           (0/1/2/3)
      21 FECHA_BAJA
      22 FECHA_IP
      23 TIPO_INVERSION       (0/1)
      24 IM_TRAMITES
      25 IM_CONSTRUCCION
      26 IM_TRABAJOS
      27 SUBVENCIONES_EUROPEAS
      28 SUBVENCIONES_NACIONALES
      29 SUBVENCIONES_PRTR
      30 VALOR_AUDITADO
      31 FINANCIADO
      32 CUENTA
      33 MOTIVACION
      34 AVIFAUNA             (0/1)
      35 IDENTIFICADOR_BAJA
    """
    __tablename__ = "ct_inventario"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_ct", name="uq_ct_inventario_tenant_empresa_ct"),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    # Identificación
    id_ct      = Column(String,    nullable=False, index=True)  # IDENTIFICADOR_CT
    cini       = Column(String,    nullable=True)
    nombre     = Column(String,    nullable=False)               # DENOMINACION
    codigo_ccuu = Column(String,   nullable=True)

    # Topología de red
    nudo_alta  = Column(String,    nullable=True)
    nudo_baja  = Column(String,    nullable=True)

    # Características eléctricas
    tension_kv              = Column(Numeric(6, 3), nullable=True)  # TENSION_EXPLOTACION
    tension_construccion_kv = Column(Float,         nullable=True)
    potencia_kva            = Column(Float,         nullable=True)  # POTENCIA

    # Ubicación
    utm_x        = Column(Float,      nullable=True)
    utm_y        = Column(Float,      nullable=True)
    lat          = Column(Float,      nullable=True)
    lon          = Column(Float,      nullable=True)
    municipio_ine = Column(String,    nullable=True)               # MUNICIPIO
    provincia    = Column(String(2),  nullable=True)
    ccaa         = Column(String(2),  nullable=True)
    zona         = Column(String(2),  nullable=True)               # U/SU/RC/RD

    # Estado
    propiedad      = Column(String(1),  nullable=True)             # heredado de antes
    estado         = Column(Integer,    nullable=True)             # 0/1/2
    modelo         = Column(String(1),  nullable=True)             # I/M/D/E
    punto_frontera = Column(Integer,    nullable=True)             # 0/1

    # Fechas
    fecha_aps  = Column(Date, nullable=True)
    causa_baja = Column(Integer, nullable=True)                    # 0/1/2/3
    fecha_baja = Column(Date, nullable=True)
    fecha_ip   = Column(Date, nullable=True)

    # Inversión
    tipo_inversion          = Column(Integer, nullable=True)       # 0/1
    financiado              = Column(Float,   nullable=True)       # % 0-100
    im_tramites             = Column(Float,   nullable=True)
    im_construccion         = Column(Float,   nullable=True)
    im_trabajos             = Column(Float,   nullable=True)
    subvenciones_europeas   = Column(Float,   nullable=True)
    subvenciones_nacionales = Column(Float,   nullable=True)
    subvenciones_prtr       = Column(Float,   nullable=True)
    valor_auditado          = Column(Float,   nullable=True)
    cuenta                  = Column(String,  nullable=True)
    motivacion              = Column(String(3), nullable=True)
    avifauna                = Column(Integer, nullable=True)       # 0/1
    identificador_baja      = Column(String,  nullable=True)

    anio_declaracion = Column(Integer, nullable=True)


class CtTransformador(TenantMixin, TimestampMixin, Base):
    """
    Transformador instalado en CT — Formulario B21 (BOE-A-2021-21003).
    """
    __tablename__ = "ct_transformador"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "id_ct", "id_transformador",
            name="uq_ct_transformador_tenant_empresa_ct_trf",
        ),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)

    id_ct            = Column(String, nullable=False, index=True)
    id_transformador = Column(String, nullable=False)
    cini             = Column(String, nullable=True)
    potencia_kva     = Column(Numeric(10, 3), nullable=True)
    anio_fabricacion = Column(Integer, nullable=True)
    en_operacion     = Column(Integer, nullable=True)


class CupsTopologia(TenantMixin, TimestampMixin, Base):
    """
    Punto de suministro — Formulario A1 (BOE-A-2021-21003).

    Índices de campo en el fichero (0-based):
      0    NUDO
      1-3  COORDENADAS X/Y/Z
      4    CNAE
      5    COD_TFA              (código tarifa)
      6    CUPS
      7    MUNICIPIO            (INE C4)
      8    PROVINCIA            (INE C2)
      9    ZONA                 (U/SU/RC/RD)
      10   CONEXION             (A/S)
      11   TENSION              (kV)
      12   ESTADO_CONTRATO      (0/1)
      13   POTENCIA_CONTRATADA  (kW)
      14   POTENCIA_ADSCRITA    (kW)
      15   ENERGIA_ACTIVA_CONSUMIDA (kWh)
      16   ENERGIA_REACTIVA_CONSUMIDA (kVArh)
      17   AUTOCONSUMO          (0/1)
      18   CINI_EQUIPO_MEDIDA
      19   FECHA_INSTALACION
      20   LECTURAS
      21   BAJA_SUMINISTRO      (0/1)
      22   CAMBIO_TITULARIDAD   (0/1)
      23   FACTURAS_ESTIMADAS
      24   FACTURAS_TOTAL
      25   CAU
      26   COD_AUTO
      27   COD_GENERACION_AUTO
      28   CONEXION_AUTOCONSUMO (0/1/2)
      29   ENERGIA_AUTOCONSUMIDA (kWh)
      30   ENERGIA_EXCEDENTARIA  (kWh)
    """
    __tablename__ = "cups_topologia"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "cups", name="uq_cups_topologia_tenant_empresa_cups"),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    # Identificación
    cups      = Column(String, nullable=False, index=True)
    id_ct     = Column(String, nullable=True,  index=True)    # NUDO (nudo al que pertenece)
    id_salida = Column(String, nullable=True)

    # Clasificación
    cnae    = Column(String(5), nullable=True)
    tarifa  = Column(String,    nullable=True)                # COD_TFA

    # Ubicación
    utm_x     = Column(Float,      nullable=True)
    utm_y     = Column(Float,      nullable=True)
    lat       = Column(Float,      nullable=True)
    lon       = Column(Float,      nullable=True)
    municipio = Column(String(4),  nullable=True)
    provincia = Column(String(2),  nullable=True)
    zona      = Column(String(2),  nullable=True)             # U/SU/RC/RD
    conexion  = Column(String(1),  nullable=True)             # A=aérea, S=subterránea

    # Características eléctricas
    tension_kv              = Column(Numeric(6, 3), nullable=True)
    estado_contrato         = Column(Integer,       nullable=True)    # 0=vigente, 1=sin contrato
    potencia_contratada_kw  = Column(Numeric(10, 3), nullable=True)
    potencia_adscrita_kw    = Column(Float,          nullable=True)
    energia_activa_kwh      = Column(Float,          nullable=True)
    energia_reactiva_kvarh  = Column(Float,          nullable=True)

    # Autoconsumo
    autoconsumo              = Column(Integer, nullable=True)         # 0/1
    cini_contador            = Column(String,  nullable=True)         # CINI_EQUIPO_MEDIDA
    telegestado              = Column(Integer, nullable=True)
    cau                      = Column(String,  nullable=True)
    cod_auto                 = Column(String(3), nullable=True)
    cod_generacion_auto      = Column(Integer, nullable=True)
    conexion_autoconsumo     = Column(Integer, nullable=True)         # 0/1/2
    energia_autoconsumida_kwh = Column(Float,  nullable=True)
    energia_excedentaria_kwh  = Column(Float,  nullable=True)

    # Gestión
    fecha_alta           = Column(Date,    nullable=True)             # FECHA_INSTALACION
    lecturas             = Column(Integer, nullable=True)
    baja_suministro      = Column(Integer, nullable=True)             # 0/1
    cambio_titularidad   = Column(Integer, nullable=True)             # 0/1
    facturas_estimadas   = Column(Integer, nullable=True)
    facturas_total       = Column(Integer, nullable=True)

    anio_declaracion = Column(Integer, nullable=True)


class LineaInventario(TenantMixin, TimestampMixin, Base):
    """
    Tramo de línea — Formulario B1 (BOE-A-2021-21003).

    Índices de campo en el fichero (0-based):
      0  IDENTIFICADOR_TRAMO
      1  CINI
      2  CODIGO_CCUU
      3  NUDO_INICIAL
      4  NUDO_FINAL
      5  CCAA_1
      6  CCAA_2              (nivel tensión en la práctica: 07=MT, 08=BT)
      7  PROPIEDAD           (0=terceros, 1=propia)
      8  TENSION_EXPLOTACION (kV)
      9  TENSION_CONSTRUCCION(kV)
      10 LONGITUD            (km)
      11 RESISTENCIA         (Ω)
      12 REACTANCIA          (Ω)
      13 INTENSIDAD          (A)
      14 ESTADO              (0/1/2)
      15 PUNTO_FRONTERA      (0/1)
      16 MODELO              (I/M/D/E)
      17 OPERACION           (0=abierto, 1=activo)
      18 FECHA_APS
      19 CAUSA_BAJA          (0/1/2/3)
      20 FECHA_BAJA
      21 FECHA_IP
      22 TIPO_INVERSION      (0/1)
      23 MOTIVACION
      24 IM_TRAMITES
      25 IM_CONSTRUCCION
      26 IM_TRABAJOS
      27 VALOR_AUDITADO
      28 FINANCIADO
      29 SUBVENCIONES_EUROPEAS
      30 SUBVENCIONES_NACIONALES
      31 SUBVENCIONES_PRTR
      32 CUENTA
      33 AVIFAUNA            (0/1)
      34 IDENTIFICADOR_BAJA
    """
    __tablename__ = "linea_inventario"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_tramo", name="uq_linea_inventario_tenant_empresa_tramo"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    anio_declaracion = Column(Integer, nullable=True)

    # Identificación
    id_tramo    = Column(String,     nullable=False, index=True)  # IDENTIFICADOR_TRAMO
    cini        = Column(String,     nullable=True)
    codigo_ccuu = Column(String,     nullable=True)

    # Topología
    nudo_inicio    = Column(String,     nullable=True)
    nudo_fin       = Column(String,     nullable=True)
    ccaa_1         = Column(String(2),  nullable=True)
    nivel_tension  = Column(String(10), nullable=True)            # CCAA_2 / 07=MT, 08=BT

    # Características eléctricas
    propiedad               = Column(Integer, nullable=True)      # 0=terceros, 1=propia
    tension_kv              = Column(Float,   nullable=True)      # TENSION_EXPLOTACION
    tension_construccion_kv = Column(Float,   nullable=True)
    longitud_km             = Column(Float,   nullable=True)
    resistencia_ohm         = Column(Float,   nullable=True)
    reactancia_ohm          = Column(Float,   nullable=True)
    intensidad_a            = Column(Float,   nullable=True)

    # Estado
    estado         = Column(Integer,    nullable=True)            # 0/1/2
    punto_frontera = Column(Integer,    nullable=True)            # 0/1
    modelo         = Column(String(1),  nullable=True)            # I/M/D/E
    operacion      = Column(Integer,    nullable=True)            # 0=abierto, 1=activo

    # Fechas
    fecha_aps  = Column(Date,    nullable=True)
    causa_baja = Column(Integer, nullable=True)                   # 0/1/2/3
    fecha_baja = Column(Date,    nullable=True)
    fecha_ip   = Column(Date,    nullable=True)

    # Inversión
    tipo_inversion          = Column(Integer,   nullable=True)    # 0/1
    motivacion              = Column(String(3), nullable=True)
    im_tramites             = Column(Float,     nullable=True)
    im_construccion         = Column(Float,     nullable=True)
    im_trabajos             = Column(Float,     nullable=True)
    valor_auditado          = Column(Float,     nullable=True)
    financiado              = Column(Float,     nullable=True)    # % 0-100
    subvenciones_europeas   = Column(Float,     nullable=True)
    subvenciones_nacionales = Column(Float,     nullable=True)
    subvenciones_prtr       = Column(Float,     nullable=True)
    cuenta                  = Column(String,    nullable=True)
    avifauna                = Column(Integer,   nullable=True)    # 0/1
    identificador_baja      = Column(String,    nullable=True)


class LineaTramo(TenantMixin, TimestampMixin, Base):
    """
    Segmento GIS de tramo — Formulario B11 (BOE-A-2021-21003).

    Índices de campo en el fichero (0-based):
      0  SEGMENTO             (id único del segmento)
      1  IDENTIFICADOR_TRAMO  (FK al tramo en B1)
      2  ORDEN_SEGMENTO
      3  N_SEGMENTOS
      4  COORDENADAS_1 X      (UTM ini)
      5  COORDENADAS_1 Y      (UTM ini)
      6  COORDENADAS_1 Z      (ignorado)
      7  COORDENADAS_2 X      (UTM fin)
      8  COORDENADAS_2 Y      (UTM fin)
      9  COORDENADAS_2 Z      (ignorado)
    """
    __tablename__ = "linea_tramo"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_tramo", name="uq_linea_tramo_tenant_empresa_tramo"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    anio_declaracion = Column(Integer, nullable=True)

    id_tramo  = Column(String, nullable=False, index=True)  # SEGMENTO
    id_linea  = Column(String, nullable=False, index=True)  # IDENTIFICADOR_TRAMO

    orden     = Column(Integer, nullable=True)
    num_tramo = Column(Integer, nullable=True)

    utm_x_ini = Column(Float, nullable=True)
    utm_y_ini = Column(Float, nullable=True)
    utm_x_fin = Column(Float, nullable=True)
    utm_y_fin = Column(Float, nullable=True)

    lat_ini = Column(Float, nullable=True)
    lon_ini = Column(Float, nullable=True)
    lat_fin = Column(Float, nullable=True)
    lon_fin = Column(Float, nullable=True)
