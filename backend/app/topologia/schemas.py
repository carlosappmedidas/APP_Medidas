# app/topologia/schemas.py
# pyright: reportMissingImports=false
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


# ── CT Inventario (completo) ──────────────────────────────────────────────────

class CtInventarioRead(BaseModel):
    id:               int
    empresa_id:       int
    id_ct:            str
    nombre:           str
    cini:             Optional[str]
    codigo_ccuu:      Optional[str]
    nudo_alta:        Optional[str]
    nudo_baja:        Optional[str]
    tension_kv:       Optional[float]
    tension_construccion_kv: Optional[float]
    potencia_kva:     Optional[float]
    lat:              Optional[float]
    lon:              Optional[float]
    municipio_ine:    Optional[str]
    provincia:        Optional[str]
    ccaa:             Optional[str]
    zona:             Optional[str]
    estado:           Optional[int]
    modelo:           Optional[str]
    punto_frontera:   Optional[int]
    fecha_aps:        Optional[date]
    causa_baja:       Optional[int]
    fecha_baja:       Optional[date]
    fecha_ip:         Optional[date]
    tipo_inversion:   Optional[int]
    financiado:       Optional[float]
    im_tramites:      Optional[float]
    im_construccion:  Optional[float]
    im_trabajos:      Optional[float]
    subvenciones_europeas:   Optional[float]
    subvenciones_nacionales: Optional[float]
    subvenciones_prtr:       Optional[float]
    valor_auditado:   Optional[float]
    cuenta:           Optional[str]
    motivacion:       Optional[str]
    avifauna:         Optional[int]
    identificador_baja: Optional[str]
    anio_declaracion: Optional[int]
    created_at:       datetime
    updated_at:       datetime

    class Config:
        from_attributes = True


# ── CT Transformador ──────────────────────────────────────────────────────────

class CtTransformadorRead(BaseModel):
    id:               int
    empresa_id:       int
    id_ct:            str
    id_transformador: str
    cini:             Optional[str]
    potencia_kva:     Optional[float]
    anio_fabricacion: Optional[int]
    en_operacion:     Optional[int]
    created_at:       datetime
    updated_at:       datetime

    class Config:
        from_attributes = True


# ── CUPS Topología (completa) ─────────────────────────────────────────────────

class CupsTopologiaRead(BaseModel):
    id:                       int
    empresa_id:               int
    cups:                     str
    id_ct:                    Optional[str]
    cnae:                     Optional[str]
    tarifa:                   Optional[str]
    lat:                      Optional[float]
    lon:                      Optional[float]
    municipio:                Optional[str]
    provincia:                Optional[str]
    zona:                     Optional[str]
    conexion:                 Optional[str]
    tension_kv:               Optional[float]
    estado_contrato:          Optional[int]
    potencia_contratada_kw:   Optional[float]
    potencia_adscrita_kw:     Optional[float]
    energia_activa_kwh:       Optional[float]
    energia_reactiva_kvarh:   Optional[float]
    autoconsumo:              Optional[int]
    cini_contador:            Optional[str]
    fecha_alta:               Optional[date]
    lecturas:                 Optional[int]
    baja_suministro:          Optional[int]
    cambio_titularidad:       Optional[int]
    facturas_estimadas:       Optional[int]
    facturas_total:           Optional[int]
    cau:                      Optional[str]
    cod_auto:                 Optional[str]
    cod_generacion_auto:      Optional[int]
    conexion_autoconsumo:     Optional[int]
    energia_autoconsumida_kwh: Optional[float]
    energia_excedentaria_kwh:  Optional[float]
    anio_declaracion:         Optional[int]
    created_at:               datetime
    updated_at:               datetime

    class Config:
        from_attributes = True


# ── Importación ───────────────────────────────────────────────────────────────

class ImportarTopologiaResponse(BaseModel):
    cts_insertados:      int
    cts_actualizados:    int
    cts_errores:         int
    trfs_insertados:     int
    trfs_actualizados:   int
    trfs_errores:        int
    cups_insertados:     int
    cups_actualizados:   int
    cups_errores:        int
    lineas_insertadas:   int = 0
    lineas_actualizadas: int = 0
    lineas_errores:      int = 0
    tramos_insertados:   int = 0
    tramos_actualizados: int = 0
    tramos_errores:      int = 0
    ficheros:            List[str]


# ── Mapa — CT ─────────────────────────────────────────────────────────────────

class CtMapaRead(BaseModel):
    id_ct:        str
    nombre:       str
    cini:         Optional[str]
    codigo_ccuu:  Optional[str]
    potencia_kva: Optional[float]
    tension_kv:   Optional[float]
    tension_construccion_kv: Optional[float]
    lat:          Optional[float]
    lon:          Optional[float]
    municipio_ine: Optional[str]
    provincia:    Optional[str]
    ccaa:         Optional[str]
    zona:         Optional[str]
    propiedad:    Optional[str]
    estado:       Optional[int]
    modelo:       Optional[str]
    punto_frontera: Optional[int]
    fecha_aps:    Optional[date]
    causa_baja:   Optional[int]
    fecha_baja:   Optional[date]
    fecha_ip:     Optional[date]
    tipo_inversion: Optional[int]
    financiado:   Optional[float]
    im_tramites:  Optional[float]
    im_construccion: Optional[float]
    im_trabajos:  Optional[float]
    subvenciones_europeas:   Optional[float]
    subvenciones_nacionales: Optional[float]
    subvenciones_prtr:       Optional[float]
    valor_auditado: Optional[float]
    cuenta:       Optional[str]
    motivacion:   Optional[str]
    avifauna:     Optional[int]
    identificador_baja: Optional[str]
    nudo_alta:    Optional[str]
    nudo_baja:    Optional[str]

    class Config:
        from_attributes = True


# ── Mapa — CUPS ───────────────────────────────────────────────────────────────

class CupsMapaRead(BaseModel):
    cups:                   str
    id_ct:                  Optional[str]
    cnae:                   Optional[str]
    tarifa:                 Optional[str]
    lat:                    Optional[float]
    lon:                    Optional[float]
    municipio:              Optional[str]
    provincia:              Optional[str]
    zona:                   Optional[str]
    conexion:               Optional[str]
    tension_kv:             Optional[float]
    estado_contrato:        Optional[int]
    potencia_contratada_kw: Optional[float]
    potencia_adscrita_kw:   Optional[float]
    energia_activa_kwh:     Optional[float]
    energia_reactiva_kvarh: Optional[float]
    autoconsumo:            Optional[int]
    cini_contador:          Optional[str]
    fecha_alta:             Optional[date]
    lecturas:               Optional[int]
    baja_suministro:        Optional[int]
    cambio_titularidad:     Optional[int]
    facturas_estimadas:     Optional[int]
    facturas_total:         Optional[int]
    cau:                    Optional[str]
    cod_auto:               Optional[str]
    cod_generacion_auto:    Optional[int]
    conexion_autoconsumo:   Optional[int]
    energia_autoconsumida_kwh: Optional[float]
    energia_excedentaria_kwh:  Optional[float]

    class Config:
        from_attributes = True


# ── Mapa — Tramo ──────────────────────────────────────────────────────────────

class TramoMapaRead(BaseModel):
    """
    Segmento GIS (B11) con campos del B1 para tooltip configurable.
    orden y num_tramo permiten identificar inicio/fin de cada línea.
    """
    # B11 — segmento GIS
    id_tramo:  str
    id_linea:  Optional[str]
    orden:     Optional[int]   # ORDEN_SEGMENTO — posición del segmento en la línea
    num_tramo: Optional[int]   # N_SEGMENTOS — total de segmentos de la línea
    lat_ini:   Optional[float]
    lon_ini:   Optional[float]
    lat_fin:   Optional[float]
    lon_fin:   Optional[float]

    # B1 — datos de la línea
    cini:                    Optional[str]
    codigo_ccuu:             Optional[str]
    nudo_inicio:             Optional[str]
    nudo_fin:                Optional[str]
    ccaa_1:                  Optional[str]
    tension_kv:              Optional[float]
    tension_construccion_kv: Optional[float]
    longitud_km:             Optional[float]
    resistencia_ohm:         Optional[float]
    reactancia_ohm:          Optional[float]
    intensidad_a:            Optional[float]
    propiedad:               Optional[int]
    estado:                  Optional[int]
    operacion:               Optional[int]
    punto_frontera:          Optional[int]
    modelo:                  Optional[str]
    causa_baja:              Optional[int]
    fecha_aps:               Optional[date]
    fecha_baja:              Optional[date]
    fecha_ip:                Optional[date]
    tipo_inversion:          Optional[int]
    motivacion:              Optional[str]
    im_tramites:             Optional[float]
    im_construccion:         Optional[float]
    im_trabajos:             Optional[float]
    valor_auditado:          Optional[float]
    financiado:              Optional[float]
    subvenciones_europeas:   Optional[float]
    subvenciones_nacionales: Optional[float]
    subvenciones_prtr:       Optional[float]
    cuenta:                  Optional[str]
    avifauna:                Optional[int]
    identificador_baja:      Optional[str]

    class Config:
        from_attributes = True
