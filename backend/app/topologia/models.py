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
    """
    __tablename__ = "ct_inventario"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_ct", name="uq_ct_inventario_tenant_empresa_ct"),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    id_ct      = Column(String,    nullable=False, index=True)
    cini       = Column(String,    nullable=True)
    nombre     = Column(String,    nullable=False)
    codigo_ccuu = Column(String,   nullable=True)

    nudo_alta  = Column(String,    nullable=True)
    nudo_baja  = Column(String,    nullable=True)

    tension_kv              = Column(Numeric(6, 3), nullable=True)
    tension_construccion_kv = Column(Float,         nullable=True)
    potencia_kva            = Column(Float,         nullable=True)

    utm_x        = Column(Float,      nullable=True)
    utm_y        = Column(Float,      nullable=True)
    lat          = Column(Float,      nullable=True)
    lon          = Column(Float,      nullable=True)
    municipio_ine = Column(String,    nullable=True)
    provincia    = Column(String(2),  nullable=True)
    ccaa         = Column(String(2),  nullable=True)
    zona         = Column(String(2),  nullable=True)

    propiedad      = Column(String(1),  nullable=True)
    estado         = Column(Integer,    nullable=True)
    modelo         = Column(String(1),  nullable=True)
    punto_frontera = Column(Integer,    nullable=True)

    fecha_aps  = Column(Date, nullable=True)
    causa_baja = Column(Integer, nullable=True)
    fecha_baja = Column(Date, nullable=True)
    fecha_ip   = Column(Date, nullable=True)

    tipo_inversion          = Column(Integer, nullable=True)
    financiado              = Column(Float,   nullable=True)
    im_tramites             = Column(Float,   nullable=True)
    im_construccion         = Column(Float,   nullable=True)
    im_trabajos             = Column(Float,   nullable=True)
    subvenciones_europeas   = Column(Float,   nullable=True)
    subvenciones_nacionales = Column(Float,   nullable=True)
    subvenciones_prtr       = Column(Float,   nullable=True)
    valor_auditado          = Column(Float,   nullable=True)
    cuenta                  = Column(String,  nullable=True)
    motivacion              = Column(String(3), nullable=True)
    avifauna                = Column(Integer, nullable=True)
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
    """
    __tablename__ = "cups_topologia"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "cups", name="uq_cups_topologia_tenant_empresa_cups"),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    cups      = Column(String, nullable=False, index=True)
    id_ct     = Column(String, nullable=True,  index=True)    # NUDO del A1
    id_salida = Column(String, nullable=True)

    # ── Asociación CT calculada ──────────────────────────────────────────────
    id_ct_asignado       = Column(String, nullable=True, index=True)
    metodo_asignacion_ct = Column(String, nullable=True)      # 'nudo_linea'/'manual'

    # ── Fase del CT (R/S/T/RST) — asignación manual o inferida por M1 ───────
    fase = Column(String(3), nullable=True)                   # 'R','S','T','RST'

    cnae    = Column(String(5), nullable=True)
    tarifa  = Column(String,    nullable=True)

    utm_x     = Column(Float,      nullable=True)
    utm_y     = Column(Float,      nullable=True)
    lat       = Column(Float,      nullable=True)
    lon       = Column(Float,      nullable=True)
    municipio = Column(String(4),  nullable=True)
    provincia = Column(String(2),  nullable=True)
    zona      = Column(String(2),  nullable=True)
    conexion  = Column(String(1),  nullable=True)

    tension_kv              = Column(Numeric(6, 3), nullable=True)
    estado_contrato         = Column(Integer,       nullable=True)
    potencia_contratada_kw  = Column(Numeric(10, 3), nullable=True)
    potencia_adscrita_kw    = Column(Float,          nullable=True)
    energia_activa_kwh      = Column(Float,          nullable=True)
    energia_reactiva_kvarh  = Column(Float,          nullable=True)

    autoconsumo              = Column(Integer, nullable=True)
    cini_contador            = Column(String,  nullable=True)
    telegestado              = Column(Integer, nullable=True)
    cau                      = Column(String,  nullable=True)
    cod_auto                 = Column(String(3), nullable=True)
    cod_generacion_auto      = Column(Integer, nullable=True)
    conexion_autoconsumo     = Column(Integer, nullable=True)
    energia_autoconsumida_kwh = Column(Float,  nullable=True)
    energia_excedentaria_kwh  = Column(Float,  nullable=True)

    fecha_alta           = Column(Date,    nullable=True)
    lecturas             = Column(Integer, nullable=True)
    baja_suministro      = Column(Integer, nullable=True)
    cambio_titularidad   = Column(Integer, nullable=True)
    facturas_estimadas   = Column(Integer, nullable=True)
    facturas_total       = Column(Integer, nullable=True)

    anio_declaracion = Column(Integer, nullable=True)


class LineaInventario(TenantMixin, TimestampMixin, Base):
    """
    Tramo de línea — Formulario B1 (BOE-A-2021-21003).
    """
    __tablename__ = "linea_inventario"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_tramo", name="uq_linea_inventario_tenant_empresa_tramo"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    anio_declaracion = Column(Integer, nullable=True)

    id_tramo    = Column(String,     nullable=False, index=True)
    cini        = Column(String,     nullable=True)
    codigo_ccuu = Column(String,     nullable=True)

    nudo_inicio    = Column(String,     nullable=True)
    nudo_fin       = Column(String,     nullable=True)
    ccaa_1         = Column(String(2),  nullable=True)
    nivel_tension  = Column(String(10), nullable=True)

    propiedad               = Column(Integer, nullable=True)
    tension_kv              = Column(Float,   nullable=True)
    tension_construccion_kv = Column(Float,   nullable=True)
    longitud_km             = Column(Float,   nullable=True)
    resistencia_ohm         = Column(Float,   nullable=True)
    reactancia_ohm          = Column(Float,   nullable=True)
    intensidad_a            = Column(Float,   nullable=True)

    estado         = Column(Integer,    nullable=True)
    punto_frontera = Column(Integer,    nullable=True)
    modelo         = Column(String(1),  nullable=True)
    operacion      = Column(Integer,    nullable=True)

    fecha_aps  = Column(Date,    nullable=True)
    causa_baja = Column(Integer, nullable=True)
    fecha_baja = Column(Date,    nullable=True)
    fecha_ip   = Column(Date,    nullable=True)

    tipo_inversion          = Column(Integer,   nullable=True)
    motivacion              = Column(String(3), nullable=True)
    im_tramites             = Column(Float,     nullable=True)
    im_construccion         = Column(Float,     nullable=True)
    im_trabajos             = Column(Float,     nullable=True)
    valor_auditado          = Column(Float,     nullable=True)
    financiado              = Column(Float,     nullable=True)
    subvenciones_europeas   = Column(Float,     nullable=True)
    subvenciones_nacionales = Column(Float,     nullable=True)
    subvenciones_prtr       = Column(Float,     nullable=True)
    cuenta                  = Column(String,    nullable=True)
    avifauna                = Column(Integer,   nullable=True)
    identificador_baja      = Column(String,    nullable=True)

    id_ct                = Column(String, nullable=True, index=True)
    metodo_asignacion_ct = Column(String, nullable=True)


class LineaTramo(TenantMixin, TimestampMixin, Base):
    """
    Segmento GIS de tramo — Formulario B11 (BOE-A-2021-21003).
    """
    __tablename__ = "linea_tramo"
    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "id_tramo", name="uq_linea_tramo_tenant_empresa_tramo"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    anio_declaracion = Column(Integer, nullable=True)

    id_tramo  = Column(String, nullable=False, index=True)
    id_linea  = Column(String, nullable=False, index=True)

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
