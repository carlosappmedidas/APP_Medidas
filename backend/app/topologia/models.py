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

    id_ct      = Column(String, nullable=False, index=True)
    nombre      = Column(String, nullable=False)
    cini        = Column(String, nullable=True)
    codigo_ti   = Column(String, nullable=True)

    potencia_kva = Column(Integer, nullable=True)
    tension_kv   = Column(Numeric(6, 3), nullable=True)
    propiedad   = Column(String(1), nullable=True)

    utm_x       = Column(Float, nullable=True)
    utm_y       = Column(Float, nullable=True)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)

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

    cups        = Column(String, nullable=False, index=True)
    id_ct       = Column(String, nullable=True, index=True)
    id_salida   = Column(String, nullable=True)

    tarifa      = Column(String, nullable=True)
    tension_kv  = Column(Numeric(6, 3), nullable=True)
    potencia_contratada_kw = Column(Numeric(10, 3), nullable=True)
    autoconsumo = Column(Integer, nullable=True)
    telegestado = Column(Integer, nullable=True)
    cini_contador = Column(String, nullable=True)

    utm_x       = Column(Float, nullable=True)
    utm_y       = Column(Float, nullable=True)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)

    fecha_alta       = Column(Date, nullable=True)
    anio_declaracion = Column(Integer, nullable=True)


class LineaInventario(TenantMixin, TimestampMixin, Base):
    """
    Tramo de línea declarado en el fichero B1 (Formulario B1, BOE-A-2021-21003).
    Campos según la circular:
      IDENTIFICADOR_TRAMO → id_tramo
      CINI                → cini
      CODIGO_CCUU         → codigo_ccuu
      NUDO_INICIAL        → nudo_inicio
      NUDO_FINAL          → nudo_fin
      nivel tensión (campo 6) → nivel_tension
      TENSION_EXPLOTACION → tension_kv
      LONGITUD            → longitud_km
    """
    __tablename__ = "linea_inventario"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_tramo", name="uq_linea_inventario_tenant_empresa_tramo"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    anio_declaracion = Column(Integer, nullable=True)

    id_tramo         = Column(String, nullable=False, index=True)   # IDENTIFICADOR_TRAMO
    cini             = Column(String, nullable=True)
    codigo_ccuu      = Column(String, nullable=True)                # tipología instalación
    nudo_inicio      = Column(String, nullable=True)
    nudo_fin         = Column(String, nullable=True)
    nivel_tension    = Column(String(10), nullable=True)            # 07=MT, 08=BT
    tension_kv       = Column(Float, nullable=True)
    longitud_km      = Column(Float, nullable=True)


class LineaTramo(TenantMixin, TimestampMixin, Base):
    """
    Segmento GIS declarado en el fichero B11 (Formulario B1.1, BOE-A-2021-21003).
    Campos según la circular:
      SEGMENTO             → id_tramo  (id único del segmento)
      IDENTIFICADOR_TRAMO  → id_linea  (agrupa segmentos del mismo tramo B1)
      ORDEN_SEGMENTO       → orden
      N_SEGMENTOS          → num_tramo
      COORDENADAS_1 X/Y    → utm_x_ini / utm_y_ini → lat_ini / lon_ini
      COORDENADAS_2 X/Y    → utm_x_fin / utm_y_fin → lat_fin / lon_fin
    """
    __tablename__ = "linea_tramo"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_tramo", name="uq_linea_tramo_tenant_empresa_tramo"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    anio_declaracion = Column(Integer, nullable=True)

    id_tramo         = Column(String, nullable=False, index=True)   # SEGMENTO
    id_linea         = Column(String, nullable=False, index=True)   # IDENTIFICADOR_TRAMO

    orden            = Column(Integer, nullable=True)
    num_tramo        = Column(Integer, nullable=True)

    utm_x_ini        = Column(Float, nullable=True)
    utm_y_ini        = Column(Float, nullable=True)
    utm_x_fin        = Column(Float, nullable=True)
    utm_y_fin        = Column(Float, nullable=True)

    lat_ini          = Column(Float, nullable=True)
    lon_ini          = Column(Float, nullable=True)
    lat_fin          = Column(Float, nullable=True)
    lon_fin          = Column(Float, nullable=True)
