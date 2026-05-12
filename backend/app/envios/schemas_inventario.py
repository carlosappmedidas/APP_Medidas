# app/envios/schemas_inventario.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel


# ── EnvioInventario (lectura/respuesta API) ──────────────────────────────────

class EnvioInventarioRead(BaseModel):
    id: int

    empresa_id: int
    empresa_nombre: str
    codigo_ree_empresa: str

    tipo: str               # AUTOCONSUMO/CUPSCAU/CUPS45/CUPSDAT
    frecuencia: str         # 'mensual' | 'diario'

    fecha_generacion: date
    version: int

    nombre_fichero: str

    subido_sftp_at: datetime

    estado_ree: Optional[str]               # None | 'ok' | 'bad'
    estado_ree_n: Optional[int]
    respuesta_recibida_at: Optional[datetime]
    respuesta_nombre_fichero: Optional[str]
    reintentos: int

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Resultado del parser de inventario (uso interno backend) ──────────────────

class ParsedInventario(BaseModel):
    """
    Resultado de parsear un nombre de fichero AUTOCONSUMO/CUPSCAU/CUPS45/CUPSDAT.
    El parser devuelve este objeto si el nombre encaja, o None si no.
    """
    tipo: Literal["AUTOCONSUMO", "CUPSCAU", "CUPS45", "CUPSDAT"]
    frecuencia: Literal["mensual", "diario"]
    codigo_ree_empresa: str
    fecha_generacion: date
    version: int
    nombre_base: str                    # sin extensión .bz2 ni respuesta
    es_respuesta: bool                  # True si es .ok / .bad
    respuesta_tipo: Optional[Literal["ok", "bad"]]
    respuesta_n: Optional[int]          # bad2 → 2, bad3 → 3