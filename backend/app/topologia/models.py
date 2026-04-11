# app/topologia/models.py
# pyright: reportMissingImports=false
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
    Centro de transformación declarado en el fichero B2 de la Circular CNMC 8/2021.
    Una fila por CT y empresa. La reimportación actualiza registro a registro.
    """
    __tablename__ = "ct_inventario"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_ct", name="uq_ct_inventario_tenant_empresa_ct"),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    id_ct        = Column(String, nullable=False, index=True)
    nombre       = Column(String, nullable=False)
    cini         = Column(String, nullable=True)
    codigo_ti    = Column(String, nullable=True)

    potencia_kva = Column(Integer, nullable=True)
    tension_kv   = Column(Numeric(6, 3), nullable=True)
    propiedad    = Column(String(1), nullable=True)

    utm_x = Column(Float, nullable=True)
    utm_y = Column(Float, nullable=True)
    lat   = Column(Float, nullable=True)
    lon   = Column(Float, nullable=True)

    municipio_ine    = Column(String, nullable=True)
    fecha_aps        = Column(Date, nullable=True)
    anio_declaracion = Column(Integer, nullable=True)


class CtTransformador(TenantMixin, TimestampMixin, Base):
    """
    Máquina (transformador) instalada en un CT, declarada en el fichero B21.
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
    Punto de suministro declarado en el fichero A1 de la Circular CNMC 8/2021.
    """
    __tablename__ = "cups_topologia"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "cups", name="uq_cups_topologia_tenant_empresa_cups"),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    cups      = Column(String, nullable=False, index=True)
    id_ct     = Column(String, nullable=True, index=True)
    id_salida = Column(String, nullable=True)

    tarifa                 = Column(String, nullable=True)
    tension_kv             = Column(Numeric(6, 3), nullable=True)
    potencia_contratada_kw = Column(Numeric(10, 3), nullable=True)
    autoconsumo            = Column(Integer, nullable=True)
    telegestado            = Column(Integer, nullable=True)
    cini_contador          = Column(String, nullable=True)

    utm_x = Column(Float, nullable=True)
    utm_y = Column(Float, nullable=True)
    lat   = Column(Float, nullable=True)
    lon   = Column(Float, nullable=True)

    fecha_alta       = Column(Date, nullable=True)
    anio_declaracion = Column(Integer, nullable=True)


class LineaInventario(TenantMixin, TimestampMixin, Base):
    """
    Tramo de línea declarado en el fichero B1 (Formulario B1, BOE-A-2021-21003).

    Mapeo de campos (índice 0-based):
      [0]  IDENTIFICADOR_TRAMO → id_tramo
      [1]  CINI                → cini
      [2]  CODIGO_CCUU         → codigo_ccuu
      [3]  NUDO_INICIAL        → nudo_inicio
      [4]  NUDO_FINAL          → nudo_fin
      [5]  CCAA_1              → ccaa_1
      [6]  CCAA_2              → nivel_tension (07=MT, 08=BT)
      [7]  PROPIEDAD           → propiedad (0=terceros, 1=propia)
      [8]  TENSION_EXPLOTACION → tension_kv (kV)
      [9]  TENSION_CONSTRUCCION→ tension_construccion_kv
      [10] LONGITUD            → longitud_km
      [11] RESISTENCIA         → resistencia_ohm
      [12] REACTANCIA          → reactancia_ohm
      [13] INTENSIDAD          → intensidad_a
      [15] PUNTO_FRONTERA      → punto_frontera
      [16] MODELO              → modelo (I=inventario, M=modelo red)
      [17] OPERACION           → operacion (0=abierto, 1=activo)
      [18] FECHA_APS           → fecha_aps
      [19] CAUSA_BAJA          → causa_baja (0=activo, 1/2/3=baja)
      [20] FECHA_BAJA          → fecha_baja
    """
    __tablename__ = "linea_inventario"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_tramo", name="uq_linea_inventario_tenant_empresa_tramo"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    anio_declaracion = Column(Integer, nullable=True)

    # Identificación
    id_tramo    = Column(String, nullable=False, index=True)  # IDENTIFICADOR_TRAMO
    cini        = Column(String, nullable=True)
    codigo_ccuu = Column(String, nullable=True)               # tipología instalación

    # Topología
    nudo_inicio = Column(String, nullable=True)
    nudo_fin    = Column(String, nullable=True)
    ccaa_1      = Column(String(2), nullable=True)

    # Características eléctricas
    nivel_tension         = Column(String(10), nullable=True)  # 07=MT, 08=BT
    propiedad             = Column(Integer, nullable=True)     # 0=terceros, 1=propia
    tension_kv            = Column(Float, nullable=True)       # kV explotación
    tension_construccion_kv = Column(Float, nullable=True)     # kV construcción
    longitud_km           = Column(Float, nullable=True)
    resistencia_ohm       = Column(Float, nullable=True)
    reactancia_ohm        = Column(Float, nullable=True)
    intensidad_a          = Column(Float, nullable=True)

    # Estado
    punto_frontera = Column(Integer, nullable=True)            # 0=no, 1=sí
    modelo         = Column(String(1), nullable=True)          # I=inventario, M=modelo
    operacion      = Column(Integer, nullable=True)            # 0=abierto, 1=activo
    causa_baja     = Column(Integer, nullable=True)            # 0=activo, 1/2/3=baja

    # Fechas
    fecha_aps  = Column(Date, nullable=True)
    fecha_baja = Column(Date, nullable=True)


class LineaTramo(TenantMixin, TimestampMixin, Base):
    """
    Segmento GIS declarado en el fichero B11 (Formulario B1.1, BOE-A-2021-21003).

    Mapeo de campos:
      [0] SEGMENTO             → id_tramo  (id único del segmento)
      [1] IDENTIFICADOR_TRAMO  → id_linea  (agrupa segmentos del mismo tramo B1)
      [2] ORDEN_SEGMENTO       → orden
      [3] N_SEGMENTOS          → num_tramo
      [4] COORDENADAS_1 X      → utm_x_ini
      [5] COORDENADAS_1 Y      → utm_y_ini
      [7] COORDENADAS_2 X      → utm_x_fin
      [8] COORDENADAS_2 Y      → utm_y_fin
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
