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

    # Identificación
    id_ct      = Column(String, nullable=False, index=True)   # ej: 087.CTR.T901000003
    nombre      = Column(String, nullable=False)               # ej: 002 CT FUENTENOVILLA
    cini        = Column(String, nullable=True)                # ej: I22452MG
    codigo_ti   = Column(String, nullable=True)                # ej: TI-27V

    # Características técnicas
    potencia_kva = Column(Integer, nullable=True)              # potencia nominal total del CT (kVA)
    tension_kv   = Column(Numeric(6, 3), nullable=True)        # tensión primaria (kV)

    # Propiedad (I = propia, E = cedida por tercero)
    propiedad   = Column(String(1), nullable=True)

    # Coordenadas originales UTM ETRS89 huso 30
    utm_x       = Column(Float, nullable=True)
    utm_y       = Column(Float, nullable=True)

    # Coordenadas WGS84 convertidas (usadas por el mapa)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)

    # Localización administrativa
    municipio_ine = Column(String, nullable=True)              # código INE municipio

    # Fecha de puesta en servicio declarada en el B2
    fecha_aps   = Column(Date, nullable=True)

    # Año de declaración del fichero (campo AAAA del nombre de fichero)
    anio_declaracion = Column(Integer, nullable=True)


class CtTransformador(TenantMixin, TimestampMixin, Base):
    """
    Máquina (transformador) instalada en un CT, declarada en el fichero B21.
    Un CT puede tener varias máquinas. La reimportación actualiza registro a registro.
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

    id_ct            = Column(String, nullable=False, index=True)   # FK lógica → ct_inventario.id_ct
    id_transformador = Column(String, nullable=False)               # ej: 087.TRF.T901000001
    cini             = Column(String, nullable=True)
    potencia_kva     = Column(Numeric(10, 3), nullable=True)        # potencia de placa (kVA)
    anio_fabricacion = Column(Integer, nullable=True)
    en_operacion     = Column(Integer, nullable=True)               # 1 = en servicio, 0 = reserva fría


class CupsTopologia(TenantMixin, TimestampMixin, Base):
    """
    Punto de suministro declarado en el fichero A1 de la Circular CNMC 8/2021.
    Una fila por CUPS y empresa. La reimportación actualiza registro a registro.
    """
    __tablename__ = "cups_topologia"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "cups", name="uq_cups_topologia_tenant_empresa_cups"),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    # Identificación del suministro
    cups        = Column(String, nullable=False, index=True)   # ej: ES0148000000010003QJ0F
    id_ct       = Column(String, nullable=True, index=True)    # FK lógica → ct_inventario.id_ct (nudo MT del A1)
    id_salida   = Column(String, nullable=True)                # id salida BT (campo 6 del A1)

    # Características del suministro
    tarifa      = Column(String, nullable=True)                # ej: RC, RD...
    tension_kv  = Column(Numeric(6, 3), nullable=True)         # tensión de suministro (kV)
    potencia_contratada_kw = Column(Numeric(10, 3), nullable=True)
    autoconsumo = Column(Integer, nullable=True)               # 0/1
    telegestado = Column(Integer, nullable=True)               # 0/1
    cini_contador = Column(String, nullable=True)

    # Coordenadas originales UTM ETRS89 huso 30
    utm_x       = Column(Float, nullable=True)
    utm_y       = Column(Float, nullable=True)

    # Coordenadas WGS84 convertidas (usadas por el mapa)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)

    # Fecha de alta del suministro
    fecha_alta  = Column(Date, nullable=True)

    # Año de declaración del fichero
    anio_declaracion = Column(Integer, nullable=True)
