# app/erp/models.py
# pyright: reportMissingImports=false
"""
Modelos SQLAlchemy del módulo ERP.

Módulo 1 — Maestro de Suministros y Contratos.
Paq E-1: 2 tablas:
  - erp_titular     → persona/empresa titular de los suministros
  - erp_suministro  → punto de suministro físico (CUPS)

La familia contrato (erp_contrato, erp_contrato_*) llega en Paq E-6.
Todas llevan tenant_id + empresa_id (mismo patrón que stg/models.py).
"""
from sqlalchemy import (
    Boolean, Column, Date, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint,
)

from app.core.models_base import Base, TimestampMixin


# ---------------------------------------------------------------------------
# 1) ErpTitular  -- persona/empresa titular
# ---------------------------------------------------------------------------
class ErpTitular(TimestampMixin, Base):
    """
    Titular de uno o varios suministros.

    tipo_persona: "fisica" | "juridica"
    """
    __tablename__ = "erp_titular"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    tipo_persona = Column(String(20), nullable=False, default="juridica")
    nif_cif      = Column(String(20), nullable=True, index=True)
    nombre       = Column(String(255), nullable=False)

    # Dirección fiscal (inline)
    dir_tipo_via  = Column(String(50), nullable=True)
    dir_via       = Column(String(255), nullable=True)
    dir_numero    = Column(String(20), nullable=True)
    dir_resto     = Column(String(255), nullable=True)   # escalera/planta/puerta/bloque
    dir_cp        = Column(String(10), nullable=True)
    dir_municipio = Column(String(120), nullable=True)
    dir_provincia = Column(String(120), nullable=True)
    dir_pais      = Column(String(120), nullable=True, default="España")

    ref_catastral = Column(String(30), nullable=True)

    telefono = Column(String(30), nullable=True)
    movil    = Column(String(30), nullable=True)
    email    = Column(String(255), nullable=True)

    notas          = Column(Text, nullable=True)
    codigo_interno = Column(String(50), nullable=True)
    activo         = Column(Boolean, nullable=False, default=True)


# ---------------------------------------------------------------------------
# 2) ErpSuministro  -- punto de suministro físico (CUPS)
# ---------------------------------------------------------------------------
class ErpSuministro(TimestampMixin, Base):
    """
    Punto de suministro (CUPS). SOLO datos físicos / de conexión.

    Lo contractual (titular, tarifa, potencia contratada, comercializadora)
    NO vive aquí: se deriva del contrato activo (erp_contrato, Paq E-6).

    tipo_punto_medida: tipo de punto de medida regulado (1–5).
    """
    __tablename__ = "erp_suministro"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    cups              = Column(String(22), nullable=False, index=True)
    distribuidora     = Column(String(120), nullable=True)
    tipo_punto_medida = Column(Integer, nullable=True)   # 1–5 (regulado)
    acometida         = Column(String(255), nullable=True)

    # Dirección del suministro
    dir_tipo_via         = Column(String(50), nullable=True)
    dir_via              = Column(String(255), nullable=True)
    dir_numero           = Column(String(20), nullable=True)
    dir_resto            = Column(String(255), nullable=True)
    dir_aclarador        = Column(String(255), nullable=True)
    dir_cp               = Column(String(10), nullable=True)
    dir_municipio        = Column(String(120), nullable=True)
    dir_poblacion        = Column(String(120), nullable=True)
    dir_provincia        = Column(String(120), nullable=True)
    municipio_codigo_ine = Column(String(10), nullable=True)
    poligono             = Column(String(50), nullable=True)   # zona industrial
    parcela              = Column(String(50), nullable=True)   # zona industrial
    ref_catastral        = Column(String(30), nullable=True)
    latitud              = Column(Float, nullable=True)
    longitud             = Column(Float, nullable=True)

    # Trazabilidad de red
    zona                 = Column(String(120), nullable=True)
    orden                = Column(String(50), nullable=True)
    centro_transformador = Column(String(120), nullable=True)  # str ahora; FK a CT en el futuro
    linea                = Column(String(120), nullable=True)

    # Datos eléctricos
    tension_normalizada         = Column(String(50), nullable=True)
    tension_v                   = Column(Integer, nullable=True)
    pot_max_admisible_cie_kw    = Column(Float, nullable=True)
    potencia_adscrita_kw        = Column(Float, nullable=True)
    potencia_adscrita_bloqueada = Column(Boolean, nullable=False, default=False)
    fecha_vigencia_adscrita     = Column(Date, nullable=True)

    # Fases (pestaña Información Eléctrica)
    fase_1 = Column(Boolean, nullable=False, default=False)
    fase_2 = Column(Boolean, nullable=False, default=False)
    fase_3 = Column(Boolean, nullable=False, default=False)
    neutro = Column(Boolean, nullable=False, default=False)

    fecha_alta = Column(Date, nullable=True)
    fecha_baja = Column(Date, nullable=True)

    notas  = Column(Text, nullable=True)
    activo = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("empresa_id", "cups", name="uq_erp_suministro_empresa_cups"),
    )