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

Campos de identidad/dirección alineados con normativa ATR (CNMC Res. 16-may-2024,
bloque Cliente del C1/A3) y RPUM (RD 1110/2007). Ver ERP_APP_Medidas_Diseno.md §7.5–7.7.
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

    Identificación según normativa ATR (bloque Cliente):
      - tipo_persona: "fisica" | "juridica"
      - tipo_identificador: TABLA_6 ATR -> NI=NIF, NE=NIE, PS=Pasaporte,
        NV=NIVA, OT=Otro
      - identificador: el número del documento (NIF/CIF/NIE/pasaporte)
      - persona física  -> nombre_de_pila + primer_apellido + segundo_apellido
      - persona jurídica -> razon_social
      - nombre: texto completo (display) autocompuesto a partir de los anteriores
    """
    __tablename__ = "erp_titular"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # --- Identificación (normativa ATR · bloque Cliente) ---
    tipo_persona       = Column(String(20), nullable=False, default="juridica")  # "fisica" | "juridica"
    tipo_identificador = Column(String(2), nullable=True)   # TABLA_6: NI/NE/PS/NV/OT
    identificador      = Column(String(20), nullable=True, index=True)  # nº de documento

    # Nombre desglosado según normativa
    nombre_de_pila   = Column(String(120), nullable=True)   # persona física
    primer_apellido  = Column(String(120), nullable=True)   # persona física
    segundo_apellido = Column(String(120), nullable=True)   # persona física
    razon_social     = Column(String(255), nullable=True)   # persona jurídica
    nombre           = Column(String(255), nullable=True)   # display autocompuesto

    # --- Dirección fiscal / notificación (inline) ---
    dir_tipo_via  = Column(String(50), nullable=True)
    dir_via       = Column(String(255), nullable=True)
    dir_numero    = Column(String(20), nullable=True)
    dir_resto     = Column(String(255), nullable=True)   # escalera/planta/puerta/bloque
    dir_cp        = Column(String(10), nullable=True)
    dir_municipio = Column(String(120), nullable=True)
    dir_provincia = Column(String(120), nullable=True)
    dir_pais      = Column(String(120), nullable=True, default="España")

    # --- Contacto ---
    telefono = Column(String(30), nullable=True)
    movil    = Column(String(30), nullable=True)
    email    = Column(String(255), nullable=True)

    # --- Gestión ---
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

    tipo_punto_medida: tipo de punto de medida regulado (1–5, RPUM RD 1110/2007).
    Geo: UTM (utm_x/utm_y/utm_huso/utm_banda, ETRS89) es la referencia oficial;
    latitud/longitud se mantienen opcionales para mapas.
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

    # Geolocalización: UTM oficial (ETRS89) + lat/long opcional
    utm_x      = Column(Float, nullable=True)
    utm_y      = Column(Float, nullable=True)
    utm_huso   = Column(Integer, nullable=True)   # huso UTM (p.ej. 28–31 en España)
    utm_banda  = Column(String(1), nullable=True) # banda/letra UTM
    latitud    = Column(Float, nullable=True)
    longitud   = Column(Float, nullable=True)

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
    potencia_convenio_kw        = Column(Float, nullable=True)
    criterio_regulatorio        = Column(String(50), nullable=True)

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
