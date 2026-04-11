# app/topologia/schemas.py
# pyright: reportMissingImports=false
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel


# ── CT Inventario ────────────────────────────────────────────────────────────

class CtInventarioRead(BaseModel):
    id:               int
    empresa_id:       int
    id_ct:            str
    nombre:           str
    cini:             Optional[str]
    codigo_ti:        Optional[str]
    potencia_kva:     Optional[int]
    tension_kv:       Optional[float]
    propiedad:        Optional[str]
    lat:              Optional[float]
    lon:              Optional[float]
    municipio_ine:    Optional[str]
    fecha_aps:        Optional[date]
    anio_declaracion: Optional[int]
    created_at:       datetime
    updated_at:       datetime

    class Config:
        from_attributes = True


# ── CT Transformador ─────────────────────────────────────────────────────────

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


# ── CUPS Topología ───────────────────────────────────────────────────────────

class CupsTopologiaRead(BaseModel):
    id:                      int
    empresa_id:              int
    cups:                    str
    id_ct:                   Optional[str]
    id_salida:               Optional[str]
    tarifa:                  Optional[str]
    tension_kv:              Optional[float]
    potencia_contratada_kw:  Optional[float]
    autoconsumo:             Optional[int]
    telegestado:             Optional[int]
    cini_contador:           Optional[str]
    lat:                     Optional[float]
    lon:                     Optional[float]
    fecha_alta:              Optional[date]
    anio_declaracion:        Optional[int]
    created_at:              datetime
    updated_at:              datetime

    class Config:
        from_attributes = True


# ── Importación ──────────────────────────────────────────────────────────────

class ImportarTopologiaResponse(BaseModel):
    """Respuesta del endpoint de importación de ficheros CNMC."""

    # B2 — CTs
    cts_insertados:     int
    cts_actualizados:   int
    cts_errores:        int

    # B21 — Transformadores
    trfs_insertados:    int
    trfs_actualizados:  int
    trfs_errores:       int

    # A1 — CUPS
    cups_insertados:    int
    cups_actualizados:  int
    cups_errores:       int

    # Ficheros procesados
    ficheros:           List[str]


# ── Mapa — respuesta compacta para el frontend ───────────────────────────────

class CtMapaRead(BaseModel):
    """CT con su potencia total real (suma de transformadores en servicio)."""

    id_ct:        str
    nombre:       str
    potencia_kva: Optional[int]       # potencia nominal del CT (B2)
    lat:          Optional[float]
    lon:          Optional[float]
    propiedad:    Optional[str]

    class Config:
        from_attributes = True


class CupsMapaRead(BaseModel):
    """CUPS con los datos mínimos para el popup del mapa."""

    cups:      str
    id_ct:     Optional[str]
    tarifa:    Optional[str]
    tension_kv: Optional[float]
    lat:       Optional[float]
    lon:       Optional[float]

    class Config:
        from_attributes = True
