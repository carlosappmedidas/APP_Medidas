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


# ── CT Celda ──────────────────────────────────────────────────────────────────

class CtCeldaRead(BaseModel):
    id:               int
    empresa_id:       int
    id_ct:            str
    id_celda:         str
    id_transformador: Optional[str]
    cini:             Optional[str]
    posicion:         Optional[int]
    en_servicio:      Optional[int]
    anio_instalacion: Optional[int]
    cini_p1_tipo_instalacion: Optional[str]
    cini_p2_actividad:        Optional[str]
    cini_p3_tipo_equipo:      Optional[str]
    cini_p4_tension_rango:    Optional[str]
    cini_p5_tipo_posicion:    Optional[str]
    cini_p6_ubicacion:        Optional[str]
    cini_p7_funcion:          Optional[str]
    cini_p8_tension_nominal:  Optional[str]
    created_at:       datetime
    updated_at:       datetime

    class Config:
        from_attributes = True


# ── CT Detalle (CT + trafos + celdas) ────────────────────────────────────────

class CtDetalleRead(BaseModel):
    ct:              CtInventarioRead
    transformadores: List[CtTransformadorRead]
    celdas:          List[CtCeldaRead]


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
    id_ct_asignado:           Optional[str]
    metodo_asignacion_ct:     Optional[str]
    fase:                     Optional[str]
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
    celdas_insertadas:   int = 0
    celdas_actualizadas: int = 0
    celdas_errores:      int = 0
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


# ── Asociación CT — request y response ───────────────────────────────────────

class AsignacionCtRequest(BaseModel):
    """Payload para reasignación manual de CT en línea o CUPS."""
    id_ct: Optional[str] = None


class AsignacionFaseRequest(BaseModel):
    """Payload para asignación manual de fase en CUPS."""
    fase: Optional[str] = None  # 'R', 'S', 'T', 'RST' o None para limpiar


class CalcAsignacionCtResponse(BaseModel):
    """Resultado del cálculo automático de asociación CT BT."""
    lineas_bfs:        int
    lineas_proximidad: int
    lineas_sin_asoc:   int
    lineas_total:      int
    cups_asignados:    int
    cups_sin_asoc:     int
    cups_total:        int


class CalcAsignacionCtMtResponse(BaseModel):
    """Resultado del cálculo automático de asociación CT MT."""
    lineas_mt_asignadas: int
    lineas_mt_sin_asoc:  int
    lineas_mt_total:     int
    cups_mt_asignados:   int
    cups_mt_sin_asoc:    int


# ── Tabla líneas — para la vista de gestión ───────────────────────────────────

class LineaTablaRead(BaseModel):
    id_tramo:               str
    cini:                   Optional[str]
    codigo_ccuu:            Optional[str]
    nudo_inicio:            Optional[str]
    nudo_fin:               Optional[str]
    ccaa_1:                 Optional[str]
    ccaa_2:                 Optional[str]
    propiedad:              Optional[int]
    tension_kv:             Optional[float]
    tension_construccion_kv: Optional[float]
    longitud_km:            Optional[float]
    resistencia_ohm:        Optional[float]
    reactancia_ohm:         Optional[float]
    intensidad_a:           Optional[float]
    estado:                 Optional[int]
    punto_frontera:         Optional[int]
    modelo:                 Optional[str]
    operacion:              Optional[int]
    fecha_aps:              Optional[date]
    causa_baja:             Optional[int]
    fecha_baja:             Optional[date]
    fecha_ip:               Optional[date]
    tipo_inversion:         Optional[int]
    motivacion:             Optional[str]
    im_tramites:            Optional[float]
    im_construccion:        Optional[float]
    im_trabajos:            Optional[float]
    valor_auditado:         Optional[float]
    financiado:             Optional[float]
    subvenciones_europeas:  Optional[float]
    subvenciones_nacionales: Optional[float]
    subvenciones_prtr:      Optional[float]
    cuenta:                 Optional[str]
    avifauna:               Optional[int]
    identificador_baja:     Optional[str]
    id_ct:                  Optional[str]
    metodo_asignacion_ct:   Optional[str]

    class Config:
        from_attributes = True


# ── Tabla Celdas — para la vista de gestión ───────────────────────────────────

class CeldaTablaRead(BaseModel):
    id_ct:                    str
    id_celda:                 str
    id_transformador:         Optional[str]
    cini:                     Optional[str]
    posicion:                 Optional[int]
    en_servicio:              Optional[int]
    anio_instalacion:         Optional[int]
    cini_p4_tension_rango:    Optional[str]
    cini_p5_tipo_posicion:    Optional[str]
    cini_p6_ubicacion:        Optional[str]
    cini_p7_funcion:          Optional[str]
    cini_p8_tension_nominal:  Optional[str]

    class Config:
        from_attributes = True


# ── Tabla CUPS — para la vista de gestión ─────────────────────────────────────

class CupsTablaRead(BaseModel):
    cups:                     str
    id_ct:                    Optional[str]
    cnae:                     Optional[str]
    tarifa:                   Optional[str]
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
    id_ct_asignado:           Optional[str]
    metodo_asignacion_ct:     Optional[str]
    fase:                     Optional[str]

    class Config:
        from_attributes = True


# ── Tabla Tramos (B11) — para la vista de gestión ────────────────────────────

class TramoTablaRead(BaseModel):
    id_tramo:    str
    id_linea:    Optional[str]
    orden:       Optional[int]
    num_tramo:   Optional[int]
    lat_ini:     Optional[float]
    lon_ini:     Optional[float]
    lat_fin:     Optional[float]
    lon_fin:     Optional[float]
    # Campos de LineaInventario (join)
    cini:                    Optional[str]    = None
    codigo_ccuu:             Optional[str]    = None
    nudo_inicio:             Optional[str]    = None
    nudo_fin:                Optional[str]    = None
    ccaa_1:                  Optional[str]    = None
    ccaa_2:                  Optional[str]    = None
    tension_kv:              Optional[float]  = None
    longitud_km:             Optional[float]  = None
    id_ct:                   Optional[str]    = None
    metodo_asignacion_ct:    Optional[str]    = None

    class Config:
        from_attributes = True

# ── Crear CT manual ───────────────────────────────────────────────────────────

class CtCreateRequest(BaseModel):
    """Payload para crear un CT manualmente — todos los campos del B2."""
    id_ct:                  str
    nombre:                 str
    cini:                   Optional[str]   = None
    codigo_ccuu:            Optional[str]   = None
    nudo_alta:              Optional[str]   = None
    nudo_baja:              Optional[str]   = None
    tension_kv:             Optional[float] = None
    tension_construccion_kv: Optional[float] = None
    potencia_kva:           Optional[float] = None
    lat:                    Optional[float] = None
    lon:                    Optional[float] = None
    municipio_ine:          Optional[str]   = None
    provincia:              Optional[str]   = None
    ccaa:                   Optional[str]   = None
    zona:                   Optional[str]   = None
    propiedad:              Optional[str]   = None
    estado:                 Optional[int]   = None
    modelo:                 Optional[str]   = None
    punto_frontera:         Optional[int]   = None
    fecha_aps:              Optional[date]  = None
    causa_baja:             Optional[int]   = None
    fecha_baja:             Optional[date]  = None
    fecha_ip:               Optional[date]  = None
    tipo_inversion:         Optional[int]   = None
    financiado:             Optional[float] = None
    im_tramites:            Optional[float] = None
    im_construccion:        Optional[float] = None
    im_trabajos:            Optional[float] = None
    subvenciones_europeas:  Optional[float] = None
    subvenciones_nacionales: Optional[float] = None
    subvenciones_prtr:      Optional[float] = None
    valor_auditado:         Optional[float] = None
    cuenta:                 Optional[str]   = None
    motivacion:             Optional[str]   = None
    avifauna:               Optional[int]   = None
    identificador_baja:     Optional[str]   = None


class CtCreateResponse(BaseModel):
    """Respuesta tras crear un CT."""
    ok:     bool
    id_ct:  str
    accion: str  # "insertado"


# ── Mapa — CT ─────────────────────────────────────────────────────────────────

# ── Tabla CTs — para la vista de gestión ──────────────────────────────────────

class CtTablaRead(BaseModel):
    id_ct:                  str
    nombre:                 str
    cini:                   Optional[str]
    codigo_ccuu:            Optional[str]
    nudo_alta:              Optional[str]
    nudo_baja:              Optional[str]
    tension_kv:             Optional[float]
    tension_construccion_kv: Optional[float]
    potencia_kva:           Optional[float]
    municipio_ine:          Optional[str]
    provincia:              Optional[str]
    ccaa:                   Optional[str]
    zona:                   Optional[str]
    propiedad:              Optional[str]
    estado:                 Optional[int]
    modelo:                 Optional[str]
    punto_frontera:         Optional[int]
    fecha_aps:              Optional[date]
    causa_baja:             Optional[int]
    fecha_baja:             Optional[date]
    fecha_ip:               Optional[date]
    tipo_inversion:         Optional[int]
    financiado:             Optional[float]
    im_tramites:            Optional[float]
    im_construccion:        Optional[float]
    im_trabajos:            Optional[float]
    subvenciones_europeas:  Optional[float]
    subvenciones_nacionales: Optional[float]
    subvenciones_prtr:      Optional[float]
    valor_auditado:         Optional[float]
    cuenta:                 Optional[str]
    motivacion:             Optional[str]
    avifauna:               Optional[int]
    identificador_baja:     Optional[str]
    num_trafos:             Optional[int] = None
    num_celdas:             Optional[int] = None
    num_cups:               Optional[int] = None

    class Config:
        from_attributes = True



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
    id_ct_asignado:         Optional[str]
    metodo_asignacion_ct:   Optional[str]
    fase:                   Optional[str]
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
    id_tramo:  str
    id_linea:  Optional[str]
    orden:     Optional[int]
    num_tramo: Optional[int]
    lat_ini:   Optional[float]
    lon_ini:   Optional[float]
    lat_fin:   Optional[float]
    lon_fin:   Optional[float]

    cini:                    Optional[str]
    codigo_ccuu:             Optional[str]
    nudo_inicio:             Optional[str]
    nudo_fin:                Optional[str]
    ccaa_1:                  Optional[str]
    ccaa_2:                  Optional[str]
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

    id_ct:                Optional[str]
    metodo_asignacion_ct: Optional[str]

    class Config:
        from_attributes = True
