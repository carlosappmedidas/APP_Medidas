# app/objeciones/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── Base común de respuesta ──────────────────────────────────────────────────

class RespuestaUpdate(BaseModel):
    """Campos que el usuario rellena al gestionar una objeción."""
    aceptacion:             str              # "S" | "N"
    motivo_no_aceptacion:   Optional[str] = None
    comentario_respuesta:   Optional[str] = None
    respuesta_publicada:    Optional[int] = 0


# ── AOBAGRECL ────────────────────────────────────────────────────────────────

class ObjecionAGRECLRead(BaseModel):
    id:                     int
    tenant_id:              int
    empresa_id:             int
    nombre_fichero:         Optional[str]    = None
    id_objecion:            Optional[str]    = None
    distribuidor:           Optional[str]    = None
    comercializador:        Optional[str]    = None
    nivel_tension:          Optional[str]    = None
    tarifa_acceso:          Optional[str]    = None
    disc_horaria:           Optional[str]    = None
    tipo_punto:             Optional[str]    = None
    provincia:              Optional[str]    = None
    tipo_demanda:           Optional[str]    = None
    periodo:                Optional[str]    = None
    motivo:                 Optional[str]    = None
    magnitud:               Optional[str]    = None
    e_publicada:            Optional[Decimal] = None
    e_propuesta:            Optional[Decimal] = None
    comentario_emisor:      Optional[str]    = None
    autoobjecion:           Optional[str]    = None
    aceptacion:             Optional[str]    = None
    motivo_no_aceptacion:   Optional[str]    = None
    comentario_respuesta:   Optional[str]    = None
    respuesta_publicada:    Optional[int]    = None
    comentario_interno:     Optional[str]    = None
    created_at:             Optional[datetime] = None
    updated_at:             Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── OBJEINCL ─────────────────────────────────────────────────────────────────

class ObjecionINCLRead(BaseModel):
    id:                     int
    tenant_id:              int
    empresa_id:             int
    nombre_fichero:         Optional[str]    = None
    cups:                   Optional[str]    = None
    periodo:                Optional[str]    = None
    motivo:                 Optional[str]    = None
    ae_publicada:           Optional[Decimal] = None
    ae_propuesta:           Optional[Decimal] = None
    as_publicada:           Optional[Decimal] = None
    as_propuesta:           Optional[Decimal] = None
    comentario_emisor:      Optional[str]    = None
    autoobjecion:           Optional[str]    = None
    aceptacion:             Optional[str]    = None
    motivo_no_aceptacion:   Optional[str]    = None
    comentario_respuesta:   Optional[str]    = None
    respuesta_publicada:    Optional[int]    = None
    comentario_interno:     Optional[str]    = None
    created_at:             Optional[datetime] = None
    updated_at:             Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── AOBCUPS ──────────────────────────────────────────────────────────────────

class ObjecionCUPSRead(BaseModel):
    id:                     int
    tenant_id:              int
    empresa_id:             int
    nombre_fichero:         Optional[str]    = None
    id_objecion:            Optional[str]    = None
    cups:                   Optional[str]    = None
    periodo:                Optional[str]    = None
    motivo:                 Optional[str]    = None
    e_publicada:            Optional[Decimal] = None
    e_propuesta:            Optional[Decimal] = None
    comentario_emisor:      Optional[str]    = None
    autoobjecion:           Optional[str]    = None
    magnitud:               Optional[str]    = None
    aceptacion:             Optional[str]    = None
    motivo_no_aceptacion:   Optional[str]    = None
    comentario_respuesta:   Optional[str]    = None
    respuesta_publicada:    Optional[int]    = None
    comentario_interno:     Optional[str]    = None
    created_at:             Optional[datetime] = None
    updated_at:             Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── AOBCIL ───────────────────────────────────────────────────────────────────

class ObjecionCILRead(BaseModel):
    id:                     int
    tenant_id:              int
    empresa_id:             int
    nombre_fichero:         Optional[str]    = None
    id_objecion:            Optional[str]    = None
    cil:                    Optional[str]    = None
    periodo:                Optional[str]    = None
    motivo:                 Optional[str]    = None
    eas_publicada:          Optional[Decimal] = None
    eas_propuesta:          Optional[Decimal] = None
    eq2_publicada:          Optional[Decimal] = None
    eq2_propuesta:          Optional[Decimal] = None
    eq3_publicada:          Optional[Decimal] = None
    eq3_propuesta:          Optional[Decimal] = None
    comentario_emisor:      Optional[str]    = None
    autoobjecion:           Optional[str]    = None
    aceptacion:             Optional[str]    = None
    motivo_no_aceptacion:   Optional[str]    = None
    comentario_respuesta:   Optional[str]    = None
    respuesta_publicada:    Optional[int]    = None
    comentario_interno:     Optional[str]    = None
    created_at:             Optional[datetime] = None
    updated_at:             Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Respuestas de importación ─────────────────────────────────────────────────

class ImportResponse(BaseModel):
    tipo:       str
    fichero:    str
    registros:  int
    empresa_id: int


# ── Comentario interno (uso propio del usuario, no se envía a REE) ────────────

class ComentarioInternoUpdate(BaseModel):
    """Body para actualizar el comentario interno de una objeción o de un REOB.
    Pasar `null` o cadena vacía para limpiar el comentario."""
    comentario_interno: Optional[str] = None
