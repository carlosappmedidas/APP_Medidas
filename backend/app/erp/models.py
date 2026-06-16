# app/erp/models.py
# pyright: reportMissingImports=false
"""
Modelos SQLAlchemy del módulo ERP.

Módulo 1 — Maestro de Suministros y Contratos.
Paq E-1: erp_titular + erp_suministro (multi-tenant).
Paq E-6a: catálogos COMPARTIDOS (sin multi-tenant): erp_tarifa,
  erp_tarifa_periodo, erp_comercializadora.
La familia contrato (erp_contrato, erp_contrato_potencia) llega en Paq E-6b.

Campos de identidad/dirección alineados con normativa ATR (CNMC Res. 16-may-2024,
bloque Cliente del C1/A3) y RPUM (RD 1110/2007). Trazabilidad campo→norma en
ERP_APP_Medidas_Diseno.md §6ter; esquemas en §7.7 y §8.1/§8.2.
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


# ---------------------------------------------------------------------------
# 3) Catálogos COMPARTIDOS (regulados a nivel nacional — SIN multi-tenant)
# ---------------------------------------------------------------------------
# Estas tablas NO llevan tenant_id/empresa_id: son iguales para todas las
# empresas (peajes regulados, comercializadoras con código REE). Se seedean
# una vez y las consume erp_contrato (Paq E-6b). Mantenimiento: ante un cambio
# normativo se caduca la fila (vigencia_hasta) y se da de alta la nueva.

class ErpTarifa(TimestampMixin, Base):
    """
    Tarifa de acceso / peaje (2.0TD, 3.0TD, 3.0TDVE, 6.1TD…6.4TD), compartida.
    Base legal: CNMC Circular 3/2020, art. 6. Código REE: gestionatr TABLA_17.
    """
    __tablename__ = "erp_tarifa"

    id = Column(Integer, primary_key=True)

    codigo                = Column(String(10), nullable=False, unique=True, index=True)  # "2.0TD", "6.1TD"…
    descripcion           = Column(String(255), nullable=False)
    codigo_ree            = Column(String(10), nullable=True, index=True)   # TABLA_17: 018=2.0TD, 019=3.0TD…
    nivel_tension         = Column(String(2), nullable=False)    # "BT" | "AT"
    num_periodos_energia  = Column(Integer, nullable=False)      # 3 (2.0TD) | 6
    num_periodos_potencia = Column(Integer, nullable=False)      # 2 (2.0TD) | 6
    referencia_normativa  = Column(String(255), nullable=True)   # p.ej. "CNMC Circular 3/2020 art. 6"
    vigencia_desde        = Column(Date, nullable=True)
    vigencia_hasta        = Column(Date, nullable=True)          # null = vigente
    orden                 = Column(Integer, nullable=True)
    activo                = Column(Boolean, nullable=False, default=True)
    notas                 = Column(Text, nullable=True)


class ErpTarifaPeriodo(TimestampMixin, Base):
    """
    Periodos válidos de cada tarifa (P1…P6, energía/potencia). Compartida.
    Lo consume erp_contrato_potencia (E-6b) para validar qué periodos admite
    la tarifa (2.0TD → P1/P2 potencia; resto → P1…P6).
    """
    __tablename__ = "erp_tarifa_periodo"

    id          = Column(Integer, primary_key=True)
    tarifa_id   = Column(Integer, ForeignKey("erp_tarifa.id", ondelete="CASCADE"), nullable=False, index=True)
    periodo     = Column(String(2), nullable=False)    # "P1"…"P6"
    tipo        = Column(String(10), nullable=False)   # "energia" | "potencia"
    orden       = Column(Integer, nullable=False)
    descripcion = Column(String(120), nullable=True)   # punta/llano/valle…

    __table_args__ = (
        UniqueConstraint("tarifa_id", "periodo", "tipo", name="uq_erp_tarifa_periodo"),
    )


class ErpComercializadora(TimestampMixin, Base):
    """
    Comercializadora (con código REE/CUR), compartida.
    Los datos se importan del registro CNMC/REE; el modelo no bloquea por
    estar vacío. es_cur = comercializadora de referencia (COR/CUR).
    """
    __tablename__ = "erp_comercializadora"

    id         = Column(Integer, primary_key=True)
    nombre     = Column(String(255), nullable=False)
    cif        = Column(String(20), nullable=False, index=True)
    codigo_ree              = Column(String(10), nullable=False, index=True)  # código REE (4 díg.)
    codigo_cnmc             = Column(String(20), nullable=True)   # orden CNMC comercializadora eléctrica (R2-XXX)
    codigo_liquidacion_cnmc = Column(String(40), nullable=True)   # sujeto de liquidación CNMC (asignado)
    fecha_alta_cnmc         = Column(Date, nullable=True)         # inicio autorización CNMC
    fecha_baja_cnmc         = Column(Date, nullable=True)         # fin autorización CNMC ("Fecha final CNMC")
    es_cur     = Column(Boolean, nullable=False, default=False)   # comercializadora de referencia
    activo     = Column(Boolean, nullable=False, default=True)
    notas      = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("codigo_ree", name="uq_erp_comercializadora_codigo_ree"),
    )

# ---------------------------------------------------------------------------
# 4) ErpContrato + ErpContratoPotencia (E-6b) — multi-tenant
# ---------------------------------------------------------------------------
# El contrato enlaza por FK a titular/suministro/tarifa/comercializadora y NO
# duplica los datos del CUPS (se leen por join). Un suministro puede tener N
# contratos en el tiempo, con uno activo a la vez. Campo->norma en §6ter.3.
# Facturación (periodicidad, lectura, pagos) -> Módulo 3.

class ErpContrato(TimestampMixin, Base):
    __tablename__ = "erp_contrato"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # --- Identificación (RD 88/2026 art. 30/37) ---
    numero_contrato           = Column(String(40), nullable=False, index=True)
    codigo_interno            = Column(String(40), nullable=True)
    tipo_contrato_atr         = Column(String(20), nullable=False)
    estado                    = Column(String(20), nullable=False, default="activo")  # borrador|activo|baja
    fecha_alta                = Column(Date, nullable=True)
    fecha_activacion_prevista = Column(Date, nullable=True)
    fecha_firma               = Column(Date, nullable=True)
    fecha_baja                = Column(Date, nullable=True)
    fecha_finalizacion        = Column(Date, nullable=True)
    renovacion_automatica     = Column(Boolean, nullable=False, default=False)

    # --- Partes (FK) ---
    titular_id                  = Column(Integer, ForeignKey("erp_titular.id"), nullable=False, index=True)
    pagador_id                  = Column(Integer, ForeignKey("erp_titular.id"), nullable=True)
    comercializadora_id         = Column(Integer, ForeignKey("erp_comercializadora.id"), nullable=True)
    referencia_comercializadora = Column(String(120), nullable=True)

    # --- Suministro (FK; sin duplicar datos del CUPS) ---
    suministro_id = Column(Integer, ForeignKey("erp_suministro.id"), nullable=False, index=True)

    # --- Tarifa / potencia (CNMC Circular 3/2020; RD 1110/2007) ---
    tarifa_id             = Column(Integer, ForeignKey("erp_tarifa.id"), nullable=False, index=True)
    tension_normalizada   = Column(String(50), nullable=True)
    modo_control_potencia = Column(String(20), nullable=True)   # ICP | maximetro
    agree_tarifa = Column(Date, nullable=True)
    agree_dh     = Column(Date, nullable=True)
    agree_tensio = Column(Date, nullable=True)
    agree_tipus  = Column(Date, nullable=True)

    # --- Régimen regulado ---
    autoconsumo_tipo                  = Column(String(20), nullable=True)   # Ley 24/2013 art.9 + RD 244/2019 art.4
    es_autoconsumo                    = Column(Boolean, nullable=False, default=False)
    autoconsumo_colectivo             = Column(Boolean, nullable=False, default=False)
    potencia_generacion_kw            = Column(Float, nullable=True)
    bono_social                       = Column(Boolean, nullable=False, default=False)   # RD 897/2017
    suministro_minimo_vital           = Column(Boolean, nullable=False, default=False)
    tipo_vivienda                     = Column(String(20), nullable=True)   # habitual | no_habitual
    tipo_subseccion                   = Column(String(10), nullable=True)
    peaje_directo                     = Column(Boolean, nullable=False, default=False)
    telegestion                       = Column(Boolean, nullable=False, default=False)
    tipo_medida                       = Column(String(20), nullable=True)
    electrointensivo                  = Column(Boolean, nullable=False, default=False)   # RD 1106/2020
    codigo_solicitud_electrointensivo = Column(String(50), nullable=True)
    no_cortable                       = Column(Boolean, nullable=False, default=False)   # Ley 24/2013 art.52.4
    art_56                            = Column(Boolean, nullable=False, default=False)   # corte a vulnerables
    art_56_motivo                     = Column(String(255), nullable=True)
    art_56_porcentaje                 = Column(Float, nullable=True)
    no_cesion_sips                    = Column(Boolean, nullable=False, default=False)   # RD 88/2026 D.A.9ª/10ª
    no_cesion_sips_fecha              = Column(Date, nullable=True)
    cie                               = Column(String(40), nullable=True)   # Certificado Instalación Eléctrica (REBT)

    # --- Otros ---
    cnae   = Column(String(10), nullable=True)   # CNAE-2009 (actividad económica; paridad GISCE polissa.cnae)
    notas  = Column(Text, nullable=True)
    activo = Column(Boolean, nullable=False, default=True)


class ErpContratoPotencia(TimestampMixin, Base):
    """Potencia contratada por periodo (P1…P6). Validada contra erp_tarifa_periodo."""
    __tablename__ = "erp_contrato_potencia"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    contrato_id = Column(Integer, ForeignKey("erp_contrato.id", ondelete="CASCADE"), nullable=False, index=True)
    periodo     = Column(String(2), nullable=False)    # "P1"…"P6"
    potencia_kw = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("contrato_id", "periodo", name="uq_erp_contrato_potencia"),
    )
