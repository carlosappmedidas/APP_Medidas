# app/topologia/models.py
# pyright: reportMissingImports=false
"""
Modelos de BD para el módulo de topología de red.
Todos los campos corresponden a los definidos en la Circular CNMC 8/2021
(BOE-A-2021-21003) para los ficheros B1, B2, B11, A1, B21 y B22.
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


class CtCelda(TenantMixin, TimestampMixin, Base):
    """
    Celda instalada en CT — Formulario B22 (BOE-A-2021-21003).

    Campos cini_p1..cini_p8 = decodificación completa del CINI I28
    según la tabla del Anexo II de la Circular 8/2021 (págs. 156048-156050).

    Ejemplo: I28C2A2M
      p1=I  → Instalación
      p2=2  → Distribución
      p3=8  → Parques de distribución y posiciones equipadas
      p4=C  → 36 kV > U ≥ 1 kV
      p5=2  → Posición con interruptor
      p6=A  → Interior - Blindada
      p7=2  → Transformación
      p8=M  → 15 kV
    """
    __tablename__ = "ct_celda"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "id_celda",
            name="uq_ct_celda_tenant_empresa_celda",
        ),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    id_ct            = Column(String,  nullable=False, index=True)
    id_celda         = Column(String,  nullable=False, index=True)
    id_transformador = Column(String,  nullable=True)   # vacío en celdas de línea
    cini             = Column(String,  nullable=True)   # I28C2A1M / I28C2A2M / I28C3A1M
    posicion         = Column(Integer, nullable=True)   # valor raw del B22
    en_servicio      = Column(Integer, nullable=True)   # siempre 1 en ficheros actuales
    anio_instalacion = Column(Integer, nullable=True)

    # ── Campos decodificados del CINI I28 (Circular 8/2021, Anexo II) ────────
    # Pos 1 (1er carácter): tipo de instalación — siempre "I" = Instalación
    cini_p1_tipo_instalacion = Column(String(30), nullable=True)
    # Pos 2 (2º carácter): actividad — siempre "2" = Distribución
    cini_p2_actividad        = Column(String(30), nullable=True)
    # Pos 3 (3er carácter): tipo de equipo — siempre "8" = Parques y posiciones equipadas
    cini_p3_tipo_equipo      = Column(String(60), nullable=True)
    # Pos 4 (4º carácter): rango de tensión (2/3/4/A/B/C)
    cini_p4_tension_rango    = Column(String(30), nullable=True)
    # Pos 5 (5º carácter): tipo de posición (1=Parque, 2=Con interruptor, 3=Sin interruptor, 4=SE reparto, 5=Punto Frontera)
    cini_p5_tipo_posicion    = Column(String(40), nullable=True)
    # Pos 6 (6º carácter): ubicación/tipología — depende de pos5
    #   Si parque (pos5=1): 1=Convencional, 2=Blindada, 3=Híbrida
    #   Si posición (pos5=2..5): A=Interior-Blindada, B=Intemperie-Blindada,
    #     C=Interior-Convencional, D=Intemperie-Convencional,
    #     E=Interior-Híbrida, F=Intemperie-Híbrida, G=Móvil-Blindada
    cini_p6_ubicacion        = Column(String(40), nullable=True)
    # Pos 7 (7º carácter): función — depende de pos5
    #   Si parque (pos5=1): A=Simple barra, B=Simple barra partida,
    #     C=Doble barra, D=Doble barra partida, E=Tipo H, Z=Otras
    #   Si posición (pos5=2..5): 1=Línea, 2=Transformación,
    #     3=Acoplamiento, 4=Medida, 5=Reserva
    cini_p7_funcion          = Column(String(30), nullable=True)
    # Pos 8 (8º carácter): tensión nominal en kV
    #   C=1, D=3, E=5, F=5.5, G=6, H=6.6, I=10, J=11, K=12, L=13.2,
    #   M=15, N=16, O=20, P=22, Q=24, R=25, S=30, T=33,
    #   U=45, V=50, W=55, X=66, Y=110, Z=130, 1=132, 2=150, 5=Otros
    cini_p8_tension_nominal  = Column(String(10), nullable=True)


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
    ccaa_2         = Column(String(2),  nullable=True)

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


class CtCuadroBT(TenantMixin, TimestampMixin, Base):
    """
    Cuadro BT precalculado de un CT — embarrados y salidas BT con CUPS.
    Se recalcula al importar B1/B11 y al ejecutar calcular_asociacion_ct.
    """
    __tablename__ = "ct_cuadro_bt"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "id_ct", "linea_bt",
            name="uq_ct_cuadro_bt_tenant_empresa_ct_linea",
        ),
    )

    id         = Column(Integer, primary_key=True)
    empresa_id = Column(Integer, nullable=False, index=True)

    id_ct      = Column(String,  nullable=False, index=True)
    nudo_baja  = Column(String,  nullable=True)
    embarrado  = Column(String,  nullable=True)
    linea_bt   = Column(String,  nullable=False)
    num_cups   = Column(Integer, nullable=False, default=0)
