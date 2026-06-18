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
from sqlalchemy.dialects.postgresql import JSONB

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
    tipo_identificador = Column(String(2), nullable=True)   # SIPS idTipoTitular X(2) · TABLA_6
    identificador      = Column(String(14), nullable=True, index=True)  # SIPS idTitular X(14)

    # Nombre desglosado según normativa (longitudes SIPS)
    nombre_de_pila   = Column(String(30), nullable=True)    # SIPS nombreTitular X(30)
    primer_apellido  = Column(String(40), nullable=True)    # SIPS apellido1Titular X(40)
    segundo_apellido = Column(String(30), nullable=True)    # SIPS apellido2Titular X(30)
    razon_social     = Column(String(255), nullable=True)   # interno generoso; truncar a X(30) al exportar SIPS
    nombre           = Column(String(255), nullable=True)   # display autocompuesto (no es campo SIPS)

    # --- Dirección fiscal / notificación (inline) ---
    # Campos codificados guardan el CÓDIGO CNMC (desplegable contra erp_cnmc_*).
    dir_tipo_via       = Column(String(2), nullable=True)     # SIPS X(2) · CNMC Tabla 12
    dir_via            = Column(String(30), nullable=True)    # SIPS X(30)
    dir_numero         = Column(String(5), nullable=True)     # SIPS X(5)
    dir_duplicador     = Column(String(3), nullable=True)     # SIPS X(3) (BIS)
    dir_escalera       = Column(String(3), nullable=True)     # SIPS X(3) · Tabla 13 (libre)
    dir_piso           = Column(String(3), nullable=True)     # SIPS X(3) · CNMC Tabla 14
    dir_puerta         = Column(String(3), nullable=True)     # SIPS X(3) · CNMC Tabla 15
    dir_tipo_aclarador = Column(String(2), nullable=True)     # SIPS X(2) · CNMC Tabla 16
    dir_aclarador      = Column(String(40), nullable=True)    # SIPS X(40) libre: "Bar", "Peluquería"
    dir_cp             = Column(String(10), nullable=True)
    dir_municipio      = Column(String(120), nullable=True)
    dir_provincia      = Column(String(120), nullable=True)
    dir_pais           = Column(String(120), nullable=True, default="España")

    # --- Contacto ---
    persona_contacto = Column(String(120), nullable=True)  # propio (no SIPS); solo jurídica
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

    codigo_fases: conexión M=Monofásica / T=Trifásica (SIPS codigoFases, CNMC).
    (tipo_punto_medida se traslada a erp_contrato — no vive aquí.)
    Geo: UTM (utm_x/utm_y/utm_huso/utm_banda, ETRS89) es la referencia oficial;
    latitud/longitud se mantienen opcionales para mapas.
    """
    __tablename__ = "erp_suministro"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    cups              = Column(String(22), nullable=False, index=True)
    distribuidora     = Column(String(120), nullable=True)
    acometida         = Column(String(255), nullable=True)

    # Dirección del suministro (formato SIPS …PS; códigos CNMC en erp_cnmc_*)
    dir_tipo_via         = Column(String(2), nullable=True)    # CNMC Tabla 12
    dir_via              = Column(String(30), nullable=True)
    dir_numero           = Column(String(5), nullable=True)
    dir_duplicador       = Column(String(3), nullable=True)    # SIPS X(3) (BIS)
    dir_escalera         = Column(String(3), nullable=True)
    dir_piso             = Column(String(3), nullable=True)    # CNMC Tabla 14
    dir_puerta           = Column(String(3), nullable=True)    # CNMC Tabla 15
    dir_tipo_aclarador   = Column(String(2), nullable=True)    # CNMC Tabla 16
    dir_aclarador        = Column(String(40), nullable=True)   # texto libre
    dir_cp               = Column(String(10), nullable=True)
    dir_municipio        = Column(String(120), nullable=True)
    dir_poblacion        = Column(String(120), nullable=True)
    dir_provincia        = Column(String(120), nullable=True)
    dir_pais             = Column(String(120), nullable=True)
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
    pot_max_admisible_cie_kw    = Column(Float, nullable=True)
    potencia_adscrita_kw        = Column(Float, nullable=True)
    potencia_adscrita_bloqueada = Column(Boolean, nullable=False, default=False)
    fecha_vigencia_adscrita     = Column(Date, nullable=True)
    potencia_convenio_kw        = Column(Float, nullable=True)
    criterio_regulatorio        = Column(String(50), nullable=True)

    # Conexión (SIPS codigoFasesEquipoMedida X(1), CNMC: M=Monofásica, T=Trifásica)
    codigo_fases = Column(String(1), nullable=True)

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
# 3bis) Catálogos de NORMATIVA CNMC (erp_cnmc_*) — compartidos, sin multi-tenant
# ---------------------------------------------------------------------------
# Tablas maestras de códigos de la CNMC (docx "Tablas de códigos", y SIPS
# CNMC 4.0). El prefijo erp_cnmc_ deja explícito que son catálogos de norma.
# Estructura común (molde ErpTarifa): codigo + descripcion + orden + activo +
# fecha_baja. `orden` controla el orden del desplegable (no alfabético).
# Se rellenan vía scripts/seed_erp_cnmc.py. Los consumen las direcciones de
# erp_titular y erp_suministro (campos codificados de dirección).

class ErpCnmcTipoVia(TimestampMixin, Base):
    """Catálogo CNMC — Tabla 12 «Tipo de vía» (formato X(2))."""
    __tablename__ = "erp_cnmc_tipo_via"

    id          = Column(Integer, primary_key=True)
    codigo      = Column(String(2), nullable=False, unique=True, index=True)   # CL, AV, CR…
    descripcion = Column(String(120), nullable=False)                          # Calle, Avenida…
    orden       = Column(Integer, nullable=True)
    activo      = Column(Boolean, nullable=False, default=True)
    fecha_baja  = Column(Date, nullable=True)


class ErpCnmcPiso(TimestampMixin, Base):
    """Catálogo CNMC — Tabla 14 «Piso» (formato X(3))."""
    __tablename__ = "erp_cnmc_piso"

    id          = Column(Integer, primary_key=True)
    codigo      = Column(String(3), nullable=False, unique=True, index=True)   # AT, BA, 001…
    descripcion = Column(String(120), nullable=False)                          # Ático, Bajo, Primero…
    orden       = Column(Integer, nullable=True)
    activo      = Column(Boolean, nullable=False, default=True)
    fecha_baja  = Column(Date, nullable=True)


class ErpCnmcPuerta(TimestampMixin, Base):
    """Catálogo CNMC — Tabla 15 «Puerta» (formato X(3))."""
    __tablename__ = "erp_cnmc_puerta"

    id          = Column(Integer, primary_key=True)
    codigo      = Column(String(3), nullable=False, unique=True, index=True)   # ZD, ZH, 001…
    descripcion = Column(String(120), nullable=False)                          # Izq, Ext, Una…
    orden       = Column(Integer, nullable=True)
    activo      = Column(Boolean, nullable=False, default=True)
    fecha_baja  = Column(Date, nullable=True)


class ErpCnmcAclaradorFinca(TimestampMixin, Base):
    """Catálogo CNMC — Tabla 16 «Tipo de aclarador de finca» (formato X(2))."""
    __tablename__ = "erp_cnmc_aclarador_finca"

    id          = Column(Integer, primary_key=True)
    codigo      = Column(String(2), nullable=False, unique=True, index=True)   # BI, KM, NO…
    descripcion = Column(String(120), nullable=False)                          # BIS, Punto kilométrico…
    orden       = Column(Integer, nullable=True)
    activo      = Column(Boolean, nullable=False, default=True)
    fecha_baja  = Column(Date, nullable=True)
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
    potencia_generacion_kw            = Column(Float, nullable=True)
    bono_social                       = Column(Boolean, nullable=False, default=False)   # RD 897/2017
    vivienda_habitual                 = Column(Boolean, nullable=True)   # check vivienda habitual (movido desde titular)
    tipo_subseccion                   = Column(String(10), nullable=True)
    peaje_directo                     = Column(Boolean, nullable=False, default=False)
    telegestion                       = Column(Boolean, nullable=False, default=False)
    electrointensivo                  = Column(Boolean, nullable=False, default=False)   # RD 1106/2020
    codigo_solicitud_electrointensivo = Column(String(50), nullable=True)
    exencion_iese                     = Column(Boolean, nullable=False, default=False)   # exención IESE (Impuesto Especial Electricidad)
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

    # ---------------------------------------------------------------------------
# 5) ErpComercializadoraEmpresa -- relación por empresa con una comercializadora
#    del catálogo global. Los datos identificativos (nombre, CIF, códigos
#    REE/CNMC/liquidación, COR=es_cur) viven SOLO en erp_comercializadora y se
#    muestran derivados vía el FK; aquí solo los datos propios de la relación.
# ---------------------------------------------------------------------------
class ErpComercializadoraEmpresa(TimestampMixin, Base):
    """Relación distribuidora (empresa) ↔ comercializadora del catálogo."""
    __tablename__ = "erp_comercializadora_empresa"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    comercializadora_id = Column(Integer, ForeignKey("erp_comercializadora.id"), nullable=False, index=True)

    # Datos propios de la relación (lo demás se deriva del catálogo)
    direccion       = Column(String(255), nullable=True)   # texto simple
    tipo_pago       = Column(String(120), nullable=True)   # texto libre (de momento)
    datos_acceso_p0 = Column(Text, nullable=True)          # texto; se desarrolla luego
    fecha_alta_erp  = Column(Date, nullable=True)          # alta de la relación (≠ fechas CNMC)
    fecha_baja_erp  = Column(Date, nullable=True)

    activo = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("empresa_id", "comercializadora_id",
                         name="uq_erp_com_empresa_comercializadora"),
    )


# ---------------------------------------------------------------------------
# 6) ErpContratoVersion -- histórico de modificaciones del contrato.
#    Cada fila = una versión = foto (snapshot) del contrato en ese momento +
#    metadatos de la operación ATR + diff respecto a la versión anterior.
#    erp_contrato sigue siendo la fila VIVA (estado actual); esto es archivo.
# ---------------------------------------------------------------------------
class ErpContratoVersion(TimestampMixin, Base):
    """
    Versión histórica de un contrato (pestaña 'Histórico del contrato').

    - snapshot: foto completa del contrato tal como quedó en esta versión
      (alimenta la sub-pestaña 'Modificación'). Guardará también valores de
      display (nombre comercializadora/tarifa/titular, CUPS) para ser fiel
      aunque luego se renombren los catálogos.
    - cambios: diff respecto a la versión anterior (alimenta 'Cambios
      detectados'). NULL en la v1 (alta A3).
    - El estado de la lista (Activa/Histórica) se DERIVA: fecha_baja NULL = activa.
    """
    __tablename__ = "erp_contrato_version"

    id         = Column(Integer, primary_key=True)
    tenant_id  = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    contrato_id   = Column(Integer, ForeignKey("erp_contrato.id", ondelete="CASCADE"), nullable=False, index=True)
    suministro_id = Column(Integer, ForeignKey("erp_suministro.id"), nullable=True, index=True)   # histórico por CUPS

    version = Column(Integer, nullable=False)   # correlativo por contrato (1, 2, 3…)

    # --- Operación ATR ---
    tipo_atr   = Column(String(10), nullable=True)    # A3 | C1 | C2 | M1 | B1 | D1…
    motivo     = Column(String(255), nullable=True)
    referencia = Column(String(80), nullable=True)    # nº de expediente/solicitud ATR

    # --- Vigencia de la versión ---
    fecha_alta         = Column(Date, nullable=True)  # inicio de vigencia de la versión
    fecha_baja         = Column(Date, nullable=True)  # NULL = versión activa
    fecha_modificacion = Column(Date, nullable=True)  # cuándo se registró la modificación

    # --- Foto + diff ---
    snapshot = Column(JSONB, nullable=False)          # foto del contrato en esta versión
    cambios  = Column(JSONB, nullable=True)           # diff vs versión anterior (NULL en alta)

    __table_args__ = (
        UniqueConstraint("contrato_id", "version", name="uq_erp_contrato_version"),
    )


