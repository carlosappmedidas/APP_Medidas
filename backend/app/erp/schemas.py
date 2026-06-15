# app/erp/schemas.py
"""
Schemas Pydantic del módulo ERP.

Módulo 1 — Maestro de Suministros y Contratos.
Paq E-2: schemas de titular (erp_titular) y suministro (erp_suministro).

Convención de nombres:
  - ...Base   → campos comunes editables (propio)
  - ...Create → lo que se acepta al crear (tenant_id/empresa_id los pone el backend)
  - ...Update → todo opcional (patch parcial)
  - ...Out    → lo que se devuelve (incluye id + timestamps)
"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Titular
# ---------------------------------------------------------------------------
class ErpTitularBase(BaseModel):
    tipo_persona: str = "juridica"          # "fisica" | "juridica"
    nif_cif: Optional[str] = None
    nombre: str

    # Dirección fiscal
    dir_tipo_via: Optional[str] = None
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_resto: Optional[str] = None
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_provincia: Optional[str] = None
    dir_pais: Optional[str] = "España"

    ref_catastral: Optional[str] = None

    telefono: Optional[str] = None
    movil: Optional[str] = None
    email: Optional[str] = None

    notas: Optional[str] = None
    codigo_interno: Optional[str] = None
    activo: bool = True


class ErpTitularCreate(ErpTitularBase):
    """Crear titular. `nombre` obligatorio; tenant_id/empresa_id los inyecta el backend."""
    pass


class ErpTitularUpdate(BaseModel):
    """Actualización parcial: todos los campos opcionales."""
    tipo_persona: Optional[str] = None
    nif_cif: Optional[str] = None
    nombre: Optional[str] = None

    dir_tipo_via: Optional[str] = None
    dir_via: Optional[str] = None
    dir_numero: Optional[str] = None
    dir_resto: Optional[str] = None
    dir_cp: Optional[str] = None
    dir_municipio: Optional[str] = None
    dir_provincia: Optional[str] = None
    dir_pais: Optional[str] = None

    ref_catastral: Optional[str] = None

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
    # numero_suministros (derivado) → se añadirá en E-6, cuando exista el enlace vía contrato.


# ---------------------------------------------------------------------------
# Suministro (CUPS)
# ---------------------------------------------------------------------------
class ErpSuministroBase(BaseModel):
    cups: str
    distribuidora: Optional[str] = None
    tipo_punto_medida: Optional[int] = None   # 1–5 (regulado)
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

    # Fases
    fase_1: bool = False
    fase_2: bool = False
    fase_3: bool = False
    neutro: bool = False

    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None

    notas: Optional[str] = None
    activo: bool = True


class ErpSuministroCreate(ErpSuministroBase):
    """Crear suministro. `cups` obligatorio; tenant_id/empresa_id los inyecta el backend."""
    pass


class ErpSuministroUpdate(BaseModel):
    """Actualización parcial: todos los campos opcionales."""
    cups: Optional[str] = None
    distribuidora: Optional[str] = None
    tipo_punto_medida: Optional[int] = None
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

    fase_1: Optional[bool] = None
    fase_2: Optional[bool] = None
    fase_3: Optional[bool] = None
    neutro: Optional[bool] = None

    fecha_alta: Optional[date] = None
    fecha_baja: Optional[date] = None

    notas: Optional[str] = None
    activo: Optional[bool] = None


class ErpSuministroOut(ErpSuministroBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    empresa_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Derivados (titular, contrato_activo, potencia_contratada, numero_contador)
    # → se añadirán en E-6 / módulo 2, cuando existan contrato y equipo de medida.
