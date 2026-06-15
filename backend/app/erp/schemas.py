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
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# CUPS: ES + 16 dígitos + 2 letras de control (+ 2 opcional de punto frontera)
_CUPS_RE = re.compile(r"^ES\d{16}[A-Z]{2}([A-Z0-9]{2})?$")

TipoPersona = Literal["fisica", "juridica"]
TipoIdentificador = Literal["NI", "NE", "PS", "NV", "OT"]   # TABLA_6 ATR


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

    # Dirección fiscal
    dir_tipo_via: Optional[str] = None
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_resto: Optional[str] = None
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_provincia: Optional[str] = None
    dir_pais: Optional[str] = "España"

    telefono: Optional[str] = None
    movil: Optional[str] = None
    email: Optional[str] = None

    notas: Optional[str] = None
    codigo_interno: Optional[str] = None
    activo: bool = True


class ErpTitularCreate(ErpTitularBase):
    """Crear titular. tenant_id/empresa_id los inyecta el backend."""
    pass


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
    dir_resto: Optional[str] = None
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_provincia: Optional[str] = None
    dir_pais: Optional[str] = None

    telefono: Optional[str] = None
    movil: Optional[str] = None
    email: Optional[str] = None

    notas: Optional[str] = None
    codigo_interno: Optional[str] = None
    activo: Optional[bool] = None


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
    tipo_punto_medida: Optional[int] = Field(default=None, ge=1, le=5)   # 1–5 (RPUM)
    acometida: Optional[str] = None

    # Dirección del suministro
    dir_tipo_via: Optional[str] = None
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_resto: Optional[str] = None
    dir_aclarador: Optional[str] = None
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_poblacion: Optional[str] = None
    dir_provincia: Optional[str] = None
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
    tension_normalizada: Optional[str] = None
    tension_v: Optional[int] = None
    pot_max_admisible_cie_kw: Optional[float] = None
    potencia_adscrita_kw: Optional[float] = None
    potencia_adscrita_bloqueada: bool = False
    fecha_vigencia_adscrita: Optional[date] = None
    potencia_convenio_kw: Optional[float] = None
    criterio_regulatorio: Optional[str] = None

    # Fases
    fase_1: bool = False
    fase_2: bool = False
    fase_3: bool = False
    neutro: bool = False

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
    pass


class ErpSuministroUpdate(BaseModel):
    """Actualización parcial: todos los campos opcionales."""
    cups: Optional[str] = None
    distribuidora: Optional[str] = None
    tipo_punto_medida: Optional[int] = Field(default=None, ge=1, le=5)
    acometida: Optional[str] = None

    dir_tipo_via: Optional[str] = None
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_resto: Optional[str] = None
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

    tension_normalizada: Optional[str] = None
    tension_v: Optional[int] = None
    pot_max_admisible_cie_kw: Optional[float] = None
    potencia_adscrita_kw: Optional[float] = None
    potencia_adscrita_bloqueada: Optional[bool] = None
    fecha_vigencia_adscrita: Optional[date] = None
    potencia_convenio_kw: Optional[float] = None
    criterio_regulatorio: Optional[str] = None

    fase_1: Optional[bool] = None
    fase_2: Optional[bool] = None
    fase_3: Optional[bool] = None
    neutro: Optional[bool] = None

    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None

    notas: Optional[str] = None
    activo: Optional[bool] = None

    @field_validator("cups")
    @classmethod
    def _cups_ok(cls, v):
        return _validar_cups(v)


class ErpSuministroOut(ErpSuministroBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None