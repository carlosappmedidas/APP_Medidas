# app/envios/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel


# ── EnvioM (lectura/respuesta API) ────────────────────────────────────────────

class EnvioMRead(BaseModel):
    id: int

    empresa_id: int
    empresa_nombre: str
    codigo_ree_empresa: str

    tipo: str                                   # AGRECL/INMECL/MAGCL
    comercializadora_codigo: Optional[str]      # solo INMECL

    periodo_anio: Optional[int]                 # solo INMECL/MAGCL
    periodo_mes:  Optional[int]                 # solo INMECL/MAGCL

    fecha_generacion: date
    version: int

    m_clasificacion: str                        # M1 / M2 / M7

    nombre_fichero: str

    subido_sftp_at: datetime

    estado_ree: Optional[str]                   # None | 'ok' | 'bad'
    estado_ree_n: Optional[int]
    respuesta_recibida_at: Optional[datetime]
    respuesta_nombre_fichero: Optional[str]
    reintentos: int

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Resultado del parser (uso interno backend) ────────────────────────────────

class ParsedEnvio(BaseModel):
    """
    Resultado de parsear un nombre de fichero AGRECL/INMECL/MAGCL/F1/MCIL345QH/F1QH/MCIL345.
    El parser devuelve este objeto si el nombre encaja, o None si no.
    """
    tipo: Literal["AGRECL", "INMECL", "MAGCL", "F1", "MCIL345QH", "F1QH", "MCIL345"]
    codigo_ree_empresa: str
    comercializadora_codigo: Optional[str]      # solo INMECL
    periodo_anio: Optional[int]                 # solo INMECL/MAGCL/F1/MCIL345QH/F1QH/MCIL345
    periodo_mes:  Optional[int]                 # solo INMECL/MAGCL/F1/MCIL345QH/F1QH/MCIL345
    fecha_generacion: date
    version: int
    nombre_base: str                            # sin extensión .bz2 ni respuesta
    es_respuesta: bool                          # True si es .ok / .bad
    respuesta_tipo: Optional[Literal["ok", "bad"]]
    respuesta_n: Optional[int]                  # bad2 → 2, bad3 → 3