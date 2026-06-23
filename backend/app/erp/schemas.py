# app/erp/schemas.py
"""
Schemas Pydantic del módulo ERP.

Módulo 1 — Maestro de Suministros y Contratos.
Paq E-2: schemas de titular (erp_titular) y suministro (erp_suministro).

Identidad del titular según normativa ATR (bloque Cliente):
  tipo_identificador (TABLA_6: NI/NE/PS/NV/OT) + identificador (nº documento);
  física = nombre_de_pila + primer_apellido + segundo_apellido;
  jurídica = razon_social; `nombre` = display autocompuesto (lo rellena services.py).
Validaciones de formato (D5): tipo_persona, tipo_identificador, CUPS, tipo_punto_medida.
"""
import re
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.erp.normativa_atr import (
    TipoIdentificador,                 # TABLA_6 (8 valores)
    validar_enums_contrato,            # tipo_contrato_atr / modo_control_potencia
)
from app.erp.validators import (
    validar_documento, validar_cups_control, validar_cif,
    validar_formatos_titular, validar_formatos_suministro,
    validar_telefono_es,
    normalizar_identificador,
    normalizar_cups, validar_geolocalizacion,
)

# CUPS: ES + 16 dígitos + 2 letras de control (+ 2 opcional de punto frontera)
_CUPS_RE = re.compile(r"^ES\d{16}[A-Z]{2}([A-Z0-9]{2})?$")

TipoPersona = Literal["fisica", "juridica"]
# TipoIdentificador se importa de app.erp.normativa_atr (TABLA_6 completa, 8 valores)


def _validar_cups(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip().upper()
    if not _CUPS_RE.match(v):
        raise ValueError(
            "CUPS inválido: debe ser 'ES' + 16 dígitos + 2 letras de control "
            "(+ 2 caracteres opcionales de punto frontera)."
        )
    return v


# ---------------------------------------------------------------------------
# Titular
# ---------------------------------------------------------------------------
class ErpTitularBase(BaseModel):
    tipo_persona: TipoPersona = "juridica"
    tipo_identificador: Optional[TipoIdentificador] = None   # TABLA_6
    identificador: Optional[str] = None                      # nº NIF/CIF/NIE/pasaporte

    # Nombre según normativa (física: pila+apellidos; jurídica: razon_social)
    nombre_de_pila: Optional[str] = None
    primer_apellido: Optional[str] = None
    segundo_apellido: Optional[str] = None
    razon_social: Optional[str] = None
    nombre: Optional[str] = None                             # display autocompuesto

    # Dirección fiscal (codificados = código CNMC; desplegables erp_cnmc_*)
    dir_tipo_via: Optional[str] = None        # CNMC Tabla 12
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_duplicador: Optional[str] = None      # SIPS X(3) (BIS)
    dir_escalera: Optional[str] = None        # libre
    dir_piso: Optional[str] = None            # CNMC Tabla 14
    dir_puerta: Optional[str] = None          # CNMC Tabla 15
    dir_tipo_aclarador: Optional[str] = None  # CNMC Tabla 16
    dir_aclarador: Optional[str] = None       # texto libre
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_provincia: Optional[str] = None
    dir_pais: Optional[str] = "España"

    persona_contacto: Optional[str] = None  # propio (no SIPS); solo jurídica
    telefono: Optional[str] = None

    movil: Optional[str] = None
    email: Optional[str] = None

    notas: Optional[str] = None
    codigo_interno: Optional[str] = None
    activo: bool = True


class ErpTitularCreate(ErpTitularBase):
    """Crear titular. tenant_id/empresa_id los inyecta el backend."""

    @model_validator(mode="after")
    def _validar_titular(self):
        # Identificador obligatorio (tipo + número) y normalizado a forma canónica
        if not self.tipo_identificador:
            raise ValueError("El tipo de documento es obligatorio")
        self.identificador = normalizar_identificador(self.identificador)
        if not self.identificador:
            raise ValueError("El número de documento es obligatorio")
        ok, msg = validar_documento(self.tipo_identificador, self.identificador)
        if not ok:
            raise ValueError(msg)
        # Nombre obligatorio según tipo de persona
        if self.tipo_persona == "fisica":
            if not (self.nombre_de_pila and self.nombre_de_pila.strip()):
                raise ValueError("El nombre es obligatorio para persona física")
            if not (self.primer_apellido and self.primer_apellido.strip()):
                raise ValueError("El primer apellido es obligatorio para persona física")
        else:
            if not (self.razon_social and self.razon_social.strip()):
                raise ValueError("La razón social es obligatoria para persona jurídica")
        ok, msg = validar_formatos_titular(self.dir_cp, self.email)
        if not ok:
            raise ValueError(msg)
        ok, msg = validar_telefono_es(self.telefono)
        if not ok:
            raise ValueError(msg)
        ok, msg = validar_telefono_es(self.movil, solo_movil=True)
        if not ok:
            raise ValueError(msg)
        return self


class ErpTitularUpdate(BaseModel):
    """Actualización parcial: todos los campos opcionales."""
    tipo_persona: Optional[TipoPersona] = None
    tipo_identificador: Optional[TipoIdentificador] = None
    identificador: Optional[str] = None

    nombre_de_pila: Optional[str] = None
    primer_apellido: Optional[str] = None
    segundo_apellido: Optional[str] = None
    razon_social: Optional[str] = None
    nombre: Optional[str] = None

    dir_tipo_via: Optional[str] = None
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_duplicador: Optional[str] = None
    dir_escalera: Optional[str] = None
    dir_piso: Optional[str] = None
    dir_puerta: Optional[str] = None
    dir_tipo_aclarador: Optional[str] = None
    dir_aclarador: Optional[str] = None
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_provincia: Optional[str] = None
    dir_pais: Optional[str] = None

    persona_contacto: Optional[str] = None
    telefono: Optional[str] = None
    movil: Optional[str] = None
    email: Optional[str] = None

    notas: Optional[str] = None
    codigo_interno: Optional[str] = None
    activo: Optional[bool] = None

    @model_validator(mode="after")
    def _validar_titular(self):
        # Documento: solo en CREATE (y en el servicio si cambia);
        # no se revalida aquí para no bloquear la edición/reactivación de datos heredados.
        # Pero si llega un identificador, se normaliza a forma canónica.
        if self.identificador is not None:
            self.identificador = normalizar_identificador(self.identificador)
        ok, msg = validar_formatos_titular(self.dir_cp, self.email)
        if not ok:
            raise ValueError(msg)
        ok, msg = validar_telefono_es(self.telefono)
        if not ok:
            raise ValueError(msg)
        ok, msg = validar_telefono_es(self.movil, solo_movil=True)
        if not ok:
            raise ValueError(msg)
        return self


class ErpTitularOut(ErpTitularBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Suministro (CUPS)
# ---------------------------------------------------------------------------
class ErpSuministroBase(BaseModel):
    cups: str
    distribuidora: Optional[str] = None
    acometida: Optional[str] = None

    # Dirección del suministro
    dir_tipo_via: Optional[str] = None        # CNMC Tabla 12
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_duplicador: Optional[str] = None      # SIPS X(3) (BIS)
    dir_escalera: Optional[str] = None
    dir_piso: Optional[str] = None            # CNMC Tabla 14
    dir_puerta: Optional[str] = None          # CNMC Tabla 15
    dir_tipo_aclarador: Optional[str] = None  # CNMC Tabla 16
    dir_aclarador: Optional[str] = None       # texto libre
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_poblacion: Optional[str] = None
    dir_provincia: Optional[str] = None
    dir_pais: Optional[str] = None
    municipio_codigo_ine: Optional[str] = None
    poligono: Optional[str] = None
    parcela: Optional[str] = None
    ref_catastral: Optional[str] = None

    # Geolocalización: UTM oficial (ETRS89) + lat/long opcional
    utm_x: Optional[float] = None
    utm_y: Optional[float] = None
    utm_huso: Optional[int] = None
    utm_banda: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None

    # Trazabilidad de red
    zona: Optional[str] = None
    orden: Optional[str] = None
    centro_transformador: Optional[str] = None
    linea: Optional[str] = None

    # Datos eléctricos
    pot_max_admisible_cie_kw: Optional[float] = Field(default=None, gt=0)
    potencia_adscrita_kw: Optional[float] = Field(default=None, gt=0)
    potencia_adscrita_bloqueada: bool = False
    fecha_vigencia_adscrita: Optional[date] = None
    potencia_convenio_kw: Optional[float] = Field(default=None, gt=0)
    criterio_regulatorio: Optional[str] = None

    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None

    notas: Optional[str] = None
    activo: bool = True

    @field_validator("cups")
    @classmethod
    def _cups_ok(cls, v):
        return _validar_cups(v)


class ErpSuministroCreate(ErpSuministroBase):
    """Crear suministro. tenant_id/empresa_id los inyecta el backend."""

    @model_validator(mode="after")
    def _validar_suministro(self):
        # CUPS: normalizar a forma canónica y comprobar control
        cups_norm = normalizar_cups(self.cups)
        if not cups_norm:
            raise ValueError("El CUPS es obligatorio")
        self.cups = cups_norm
        if not validar_cups_control(self.cups):
            raise ValueError("CUPS inválido: las 2 letras de control no corresponden a los 16 dígitos.")
        # dir_numero admite 'SN' (sin número); se normaliza a mayúsculas
        if self.dir_numero:
            self.dir_numero = self.dir_numero.strip().upper()
        # Dirección obligatoria (presencia; los códigos CNMC se validan en services)
        obligatorios = {
            "dir_tipo_via": "el tipo de vía",
            "dir_via": "la vía",
            "dir_numero": "el número",
            "dir_cp": "el código postal",
            "dir_municipio": "el municipio",
            "dir_provincia": "la provincia",
            "dir_poblacion": "la población",
            "dir_pais": "el país",
            "municipio_codigo_ine": "el código INE del municipio",
        }
        for campo, etiqueta in obligatorios.items():
            valor = getattr(self, campo, None)
            if not (valor and str(valor).strip()):
                raise ValueError(f"Falta {etiqueta} (obligatorio)")
        # Potencias obligatorias
        if self.pot_max_admisible_cie_kw is None:
            raise ValueError("Falta la potencia máxima admisible CIE (kW)")
        if self.potencia_adscrita_kw is None:
            raise ValueError("Falta la potencia adscrita (kW)")
        ok, msg = validar_formatos_suministro(self.dir_cp, self.municipio_codigo_ine, self.ref_catastral)
        if not ok:
            raise ValueError(msg)
        ok, msg = validar_geolocalizacion(self.utm_x, self.utm_y, self.utm_huso, self.latitud, self.longitud)
        if not ok:
            raise ValueError(msg)
        return self


class ErpSuministroUpdate(BaseModel):
    """Actualización parcial: todos los campos opcionales."""
    cups: Optional[str] = None
    distribuidora: Optional[str] = None
    acometida: Optional[str] = None

    dir_tipo_via: Optional[str] = None
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_aclarador: Optional[str] = None
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_poblacion: Optional[str] = None
    dir_provincia: Optional[str] = None
    municipio_codigo_ine: Optional[str] = None
    poligono: Optional[str] = None
    parcela: Optional[str] = None
    ref_catastral: Optional[str] = None

    utm_x: Optional[float] = None
    utm_y: Optional[float] = None
    utm_huso: Optional[int] = None
    utm_banda: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None

    zona: Optional[str] = None
    orden: Optional[str] = None
    centro_transformador: Optional[str] = None
    linea: Optional[str] = None

    pot_max_admisible_cie_kw: Optional[float] = Field(default=None, gt=0)
    potencia_adscrita_kw: Optional[float] = Field(default=None, gt=0)
    potencia_adscrita_bloqueada: Optional[bool] = None

    fecha_vigencia_adscrita: Optional[date] = None
    potencia_convenio_kw: Optional[float] = Field(default=None, gt=0)
    criterio_regulatorio: Optional[str] = None

    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None

    notas: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator("cups")
    @classmethod
    def _cups_ok(cls, v):
        return _validar_cups(v)

    @model_validator(mode="after")
    def _validar_suministro(self):
        # Control del CUPS: solo en CREATE (y en el servicio si el cups CAMBIA);
        # no se revalida aquí para no bloquear la edición/reactivación de datos heredados.
        # Si llega un CUPS, se normaliza a forma canónica.
        if self.cups is not None:
            self.cups = normalizar_cups(self.cups)
        if self.dir_numero:
            self.dir_numero = self.dir_numero.strip().upper()
        ok, msg = validar_formatos_suministro(self.dir_cp, self.municipio_codigo_ine, self.ref_catastral)
        if not ok:
            raise ValueError(msg)
        ok, msg = validar_geolocalizacion(self.utm_x, self.utm_y, self.utm_huso, self.latitud, self.longitud)
        if not ok:
            raise ValueError(msg)
        return self


class ErpSuministroOut(ErpSuministroBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # ---------------------------------------------------------------------------
# Catálogos compartidos (E-6a) — tarifa / tarifa_periodo / comercializadora
# ---------------------------------------------------------------------------

# --- Tarifa de acceso (solo lectura: se gestiona por seed) ---
class ErpTarifaPeriodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    periodo: str                 # "P1"…"P6"
    tipo: str                    # "energia" | "potencia"
    orden: int
    descripcion: Optional[str] = None


class ErpTarifaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    descripcion: str
    codigo_ree: Optional[str] = None
    nivel_tension: str           # "BT" | "AT"
    num_periodos_energia: int
    num_periodos_potencia: int
    referencia_normativa: Optional[str] = None
    vigencia_desde: Optional[date] = None
    vigencia_hasta: Optional[date] = None
    orden: Optional[int] = None
    activo: bool
    notas: Optional[str] = None
    periodos: list[ErpTarifaPeriodoOut] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# --- Comercializadora (CRUD completo) ---
class ErpComercializadoraBase(BaseModel):
    nombre: str
    cif: str
    codigo_ree: str                                # código REE (4 díg.)
    codigo_cnmc: str                               # orden CNMC (R2-XXX) — obligatorio
    codigo_liquidacion_cnmc: str                   # sujeto de liquidación CNMC — obligatorio
    fecha_alta_cnmc: Optional[date] = None
    fecha_baja_cnmc: Optional[date] = None
    es_cur: bool = False         # comercializadora de referencia
    activo: bool = True
    notas: Optional[str] = None


class ErpComercializadoraCreate(ErpComercializadoraBase):
    @model_validator(mode="after")
    def _validar_cif(self):
        if not validar_cif(self.cif):
            raise ValueError("CIF inválido (letra de organización + 7 dígitos + control)")
        return self


class ErpComercializadoraUpdate(BaseModel):
    nombre: Optional[str] = None
    cif: Optional[str] = None
    codigo_ree: Optional[str] = None
    codigo_cnmc: Optional[str] = None
    codigo_liquidacion_cnmc: Optional[str] = None
    fecha_alta_cnmc: Optional[date] = None
    fecha_baja_cnmc: Optional[date] = None
    es_cur: Optional[bool] = None
    activo: Optional[bool] = None
    notas: Optional[str] = None

    @model_validator(mode="after")
    def _validar_cif(self):
        if self.cif is not None and not validar_cif(self.cif):
            raise ValueError("CIF inválido (letra de organización + 7 dígitos + control)")
        return self


class ErpComercializadoraOut(ErpComercializadoraBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# ---------------------------------------------------------------------------
# Contrato (E-6b) — erp_contrato + erp_contrato_potencia
# ---------------------------------------------------------------------------
ContratoEstado = Literal["borrador", "activo", "baja"]
TipoVivienda = Literal["habitual", "no_habitual"]
_PERIODO_RE = re.compile(r"^P[1-6]$")


class ErpContratoPotenciaIn(BaseModel):
    periodo: str
    potencia_kw: float = Field(ge=0)

    @field_validator("periodo")
    @classmethod
    def _periodo_ok(cls, v):
        v = (v or "").strip().upper()
        if not _PERIODO_RE.match(v):
            raise ValueError("periodo debe ser P1…P6")
        return v

    @field_validator("potencia_kw")
    @classmethod
    def _escalon_ok(cls, v):
        # RD 88/2026 art. 34.8: contrataciones hasta 15 kW en multiplos de 0,1 kW.
        # Por encima de 15 kW aplican otros escalones (no se valida aqui todavia).
        if v is not None and v <= 15 and abs(v * 10 - round(v * 10)) > 1e-6:
            raise ValueError("La potencia hasta 15 kW debe ir en múltiplos de 0,1 kW (RD 88/2026 art. 34.8)")
        return v


class ErpContratoPotenciaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    periodo: str
    potencia_kw: float


class ErpContratoBase(BaseModel):
    # Identificación
    numero_contrato: str
    codigo_interno: Optional[str] = None
    tipo_contrato_atr: str
    estado: ContratoEstado = "activo"
    fecha_alta: Optional[date] = None
    fecha_activacion_prevista: Optional[date] = None
    fecha_firma: Optional[date] = None
    fecha_baja: Optional[date] = None
    fecha_finalizacion: Optional[date] = None
    renovacion_automatica: bool = False
    # Partes
    titular_id: int
    pagador_id: Optional[int] = None
    comercializadora_empresa_id: Optional[int] = None
    referencia_comercializadora: Optional[str] = None
    # Suministro
    suministro_id: int
    # Tarifa / potencia
    tarifa_id: int
    tension_normalizada: Optional[str] = None
    tension_v: Optional[int] = None
    tipo_punto_medida: Optional[int] = Field(default=None, ge=1, le=5)   # 1–5 (RPUM)
    modo_control_potencia: Optional[str] = None
    agree_tarifa: Optional[date] = None
    agree_dh: Optional[date] = None
    agree_tensio: Optional[date] = None
    agree_tipus: Optional[date] = None
    # Régimen regulado
    es_autoconsumo: bool = False

    bono_social: bool = False
    vivienda_habitual: Optional[bool] = None
    tipo_subseccion: Optional[str] = None
    peaje_directo: bool = False
    telegestion: bool = False
    electrointensivo: bool = False
    codigo_solicitud_electrointensivo: Optional[str] = None
    no_cortable: bool = False
    exencion_iese: bool = False
    art_56: bool = False
    art_56_motivo: Optional[str] = None
    art_56_porcentaje: Optional[float] = None
    no_cesion_sips: bool = False
    no_cesion_sips_fecha: Optional[date] = None
    cie: Optional[str] = None
    # Otros
    cnae: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True


class ErpContratoCreate(ErpContratoBase):
    """tenant_id/empresa_id los inyecta el backend. `potencias` = set de periodos."""
    potencias: list[ErpContratoPotenciaIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _enums_ok(self):
        ok, msg = validar_enums_contrato(
            self.tipo_contrato_atr, self.modo_control_potencia
        )
        if not ok:
            raise ValueError(msg)
        return self


class ErpContratoUpdate(BaseModel):
    """Parcial. Si se envía `potencias`, reemplaza el conjunto completo."""
    numero_contrato: Optional[str] = None
    codigo_interno: Optional[str] = None
    tipo_contrato_atr: Optional[str] = None
    estado: Optional[ContratoEstado] = None
    fecha_alta: Optional[date] = None
    fecha_activacion_prevista: Optional[date] = None
    fecha_firma: Optional[date] = None
    fecha_baja: Optional[date] = None
    fecha_finalizacion: Optional[date] = None
    renovacion_automatica: Optional[bool] = None

    titular_id: Optional[int] = None
    pagador_id: Optional[int] = None
    comercializadora_empresa_id: Optional[int] = None
    referencia_comercializadora: Optional[str] = None

    suministro_id: Optional[int] = None

    tarifa_id: Optional[int] = None
    tension_normalizada: Optional[str] = None
    tension_v: Optional[int] = None
    tipo_punto_medida: Optional[int] = Field(default=None, ge=1, le=5)
    modo_control_potencia: Optional[str] = None
    agree_tarifa: Optional[date] = None
    agree_dh: Optional[date] = None
    agree_tensio: Optional[date] = None
    agree_tipus: Optional[date] = None
    es_autoconsumo: Optional[bool] = None
    bono_social: Optional[bool] = None
    vivienda_habitual: Optional[bool] = None
    tipo_subseccion: Optional[str] = None
    peaje_directo: Optional[bool] = None
    telegestion: Optional[bool] = None
    electrointensivo: Optional[bool] = None
    codigo_solicitud_electrointensivo: Optional[str] = None
    no_cortable: Optional[bool] = None
    exencion_iese: Optional[bool] = None
    art_56: Optional[bool] = None
    art_56_motivo: Optional[str] = None
    art_56_porcentaje: Optional[float] = None
    no_cesion_sips: Optional[bool] = None
    no_cesion_sips_fecha: Optional[date] = None
    cie: Optional[str] = None

    cnae: Optional[str] = None
    notas: Optional[str] = None
    activo: Optional[bool] = None

    potencias: Optional[list[ErpContratoPotenciaIn]] = None

    @model_validator(mode="after")
    def _enums_ok(self):
        ok, msg = validar_enums_contrato(
            self.tipo_contrato_atr, self.modo_control_potencia
        )
        if not ok:
            raise ValueError(msg)
        return self


class ErpContratoOut(ErpContratoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    potencias: list[ErpContratoPotenciaOut] = Field(default_factory=list)

    # Derivados de display (los rellena services.py vía join; no son columnas)
    titular_nombre: Optional[str] = None
    cups: Optional[str] = None
    tarifa_codigo: Optional[str] = None
    comercializadora_nombre: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # ---------------------------------------------------------------------------
# Catálogos de normativa CNMC (dirección)
# ---------------------------------------------------------------------------
class ErpCnmcCodigoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    codigo: str
    descripcion: str


class ErpCnmcCatalogosOut(BaseModel):
    tipo_via: list[ErpCnmcCodigoOut] = []
    piso: list[ErpCnmcCodigoOut] = []
    puerta: list[ErpCnmcCodigoOut] = []
    aclarador_finca: list[ErpCnmcCodigoOut] = []
    propiedad_aparato: list[ErpCnmcCodigoOut] = []
    telegestion: list[ErpCnmcCodigoOut] = []
    tipo_punto_medida: list[ErpCnmcCodigoOut] = []

    # ---------------------------------------------------------------------------
# Comercializadora por empresa (relación distribuidora ↔ comercializadora)
# Los datos identificativos viven en el catálogo erp_comercializadora; aquí
# solo los propios. El Out trae los del catálogo como derivados read-only.
# ---------------------------------------------------------------------------
class ErpComercializadoraEmpresaBase(BaseModel):
    comercializadora_id: int
    direccion: Optional[str] = None
    tipo_pago: Optional[str] = None
    datos_acceso_p0: Optional[str] = None
    fecha_alta_erp: Optional[date] = None
    fecha_baja_erp: Optional[date] = None
    activo: bool = True


class ErpComercializadoraEmpresaCreate(ErpComercializadoraEmpresaBase):
    pass


class ErpComercializadoraEmpresaUpdate(BaseModel):
    # comercializadora_id no se cambia tras crear; solo los campos propios.
    direccion: Optional[str] = None
    tipo_pago: Optional[str] = None
    datos_acceso_p0: Optional[str] = None
    fecha_alta_erp: Optional[date] = None
    fecha_baja_erp: Optional[date] = None
    activo: Optional[bool] = None


class ErpComercializadoraEmpresaOut(ErpComercializadoraEmpresaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int

    # Derivados del catálogo (read-only; los rellena services vía join)
    com_nombre: Optional[str] = None
    com_cif: Optional[str] = None
    com_codigo_ree: Optional[str] = None
    com_codigo_cnmc: Optional[str] = None
    com_codigo_liquidacion_cnmc: Optional[str] = None
    com_es_cur: Optional[bool] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Histórico de versiones del contrato (erp_contrato_version)
# ---------------------------------------------------------------------------
class CambioDetectado(BaseModel):
    """
    Una línea del diff 'Cambios detectados': un campo que cambió, con su
    valor antes y después. `antes`/`despues` son libres (texto, número, bool
    o None) porque cubren cualquier campo del contrato.
    """
    campo: str                      # nombre técnico, p. ej. "tarifa_id", "potencia_p1"
    etiqueta: str                   # etiqueta legible, p. ej. "Tarifa", "Potencia P1"
    antes: Any = None
    despues: Any = None


class ErpContratoVersionListItem(BaseModel):
    """
    Fila de la tabla de la pestaña 'Histórico del contrato'.
    Los campos de display (comercializadora/tarifa/potencia) y `estado` los
    compone services a partir del snapshot; no son columnas de la tabla.
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int
    tipo_atr: Optional[str] = None
    comercializadora: Optional[str] = None     # nombre (del snapshot)
    tarifa: Optional[str] = None               # código (del snapshot)
    potencia: Optional[str] = None             # las 6 en una línea: "P1 / … / P6"
    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None
    fecha_modificacion: Optional[date] = None
    estado: str                                # derivado: "Activa" | "Histórica"


class ErpContratoVersionOut(BaseModel):
    """
    Detalle de una versión: foto completa (snapshot) + diff (cambios).
    - snapshot -> sub-pestaña 'Modificación' (las 4 tarjetas).
    - cambios  -> sub-pestaña 'Cambios detectados' (NULL en la v1/alta).
    `estado` lo deriva services (fecha_baja NULL = Activa).
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    contrato_id: int
    suministro_id: Optional[int] = None
    version: int
    tipo_atr: Optional[str] = None
    motivo: Optional[str] = None
    referencia: Optional[str] = None
    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None
    fecha_modificacion: Optional[date] = None
    estado: str                                # derivado
    snapshot: dict[str, Any]                   # foto del contrato en esta versión
    cambios: Optional[list[CambioDetectado]] = None
    created_at: datetime
    updated_at: datetime


# ===========================================================================
# Modulo 2 — Equipo de medida (E-7a)
# ===========================================================================
class ErpEquipoMedidaBase(BaseModel):
    numero_serie: str = Field(..., max_length=40)
    tipo_equipo: str = Field(default="contador", max_length=20)
    fabricante: Optional[str] = Field(default=None, max_length=120)
    modelo: Optional[str] = Field(default=None, max_length=120)
    version_firmware: Optional[str] = Field(default=None, max_length=60)
    anio_fabricacion: Optional[int] = None

    tipo_telegestion: Optional[str] = Field(default=None, max_length=2)       # CNMC Tabla 111
    propiedad: Optional[str] = Field(default=None, max_length=2)              # CNMC Tabla 32
    propiedad_icp: Optional[str] = Field(default=None, max_length=2)          # CNMC Tabla 32
    modo_control_potencia: Optional[str] = Field(default=None, max_length=20)

    fecha_verificacion: Optional[date] = None
    fecha_caducidad_verificacion: Optional[date] = None

    estado: str = Field(default="en_almacen", max_length=20)
    suministro_id: Optional[int] = None

    baja_fecha: Optional[date] = None
    baja_motivo: Optional[str] = None

    notas: Optional[str] = None
    activo: bool = True


class ErpEquipoMedidaCreate(ErpEquipoMedidaBase):
    pass


class ErpEquipoMedidaUpdate(BaseModel):
    numero_serie: Optional[str] = Field(default=None, max_length=40)
    tipo_equipo: Optional[str] = Field(default=None, max_length=20)
    fabricante: Optional[str] = Field(default=None, max_length=120)
    modelo: Optional[str] = Field(default=None, max_length=120)
    version_firmware: Optional[str] = Field(default=None, max_length=60)
    anio_fabricacion: Optional[int] = None

    tipo_telegestion: Optional[str] = Field(default=None, max_length=2)
    propiedad: Optional[str] = Field(default=None, max_length=2)
    propiedad_icp: Optional[str] = Field(default=None, max_length=2)
    modo_control_potencia: Optional[str] = Field(default=None, max_length=20)

    fecha_verificacion: Optional[date] = None
    fecha_caducidad_verificacion: Optional[date] = None

    estado: Optional[str] = Field(default=None, max_length=20)
    suministro_id: Optional[int] = None

    baja_fecha: Optional[date] = None
    baja_motivo: Optional[str] = None

    notas: Optional[str] = None
    activo: Optional[bool] = None


class ErpEquipoMedidaOut(ErpEquipoMedidaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Derivados via CUPS (no son columnas; los rellena services.py)
    cups: Optional[str] = None                    # del suministro
    contrato_numero: Optional[str] = None          # del contrato activo del CUPS
    contrato_titular: Optional[str] = None         # titular del contrato activo
    contrato_tarifa: Optional[str] = None          # tarifa del contrato activo
    contrato_comercializadora: Optional[str] = None
    tipo_punto_medida: Optional[str] = None        # del contrato (RPUM, por potencia)


# ===========================================================================
# Modulo 2 - Instalacion (E-7b): historico + payloads de acciones
# ===========================================================================
class ErpInstalacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    equipo_id: int
    suministro_id: int
    tipo_movimiento: str
    equipo_sustituido_id: Optional[int] = None
    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None
    lectura_instalacion: Optional[float] = None
    lectura_retirada: Optional[float] = None
    tecnico: Optional[str] = None
    precintos: Optional[str] = None
    motivo: Optional[str] = None
    motivo_baja: Optional[str] = None
    notas: Optional[str] = None
    activo: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Derivados (los rellena services.py para mostrar en el historico)
    cups: Optional[str] = None                 # del suministro
    equipo_numero_serie: Optional[str] = None  # del equipo


class InstalarEquipoPayload(BaseModel):
    suministro_id: int
    fecha: Optional[date] = None
    lectura: Optional[float] = None
    tecnico: Optional[str] = Field(default=None, max_length=120)
    precintos: Optional[str] = None
    motivo: Optional[str] = None
    tipo_movimiento: str = Field(default="instalacion", max_length=20)
    equipo_sustituido_id: Optional[int] = None
    notas: Optional[str] = None


class RetirarEquipoPayload(BaseModel):
    fecha: Optional[date] = None
    lectura: Optional[float] = None
    motivo: Optional[str] = None
    estado_destino: str = Field(default="en_almacen", max_length=20)  # en_almacen|averiado|retirado
