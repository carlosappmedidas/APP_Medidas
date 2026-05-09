# app/envios/automatizacion/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Lectura de la configuración de un tipo ───────────────────────────────────

class AutomatizacionConfigRead(BaseModel):
    activa: bool
    ultimo_run_at:  Optional[datetime] = None
    ultimo_run_ok:  Optional[bool]     = None
    ultimo_run_msg: Optional[str]      = None


# ── Lectura de TODAS las configs del tenant (1 por tipo) ─────────────────────

class AutomatizacionConfigAll(BaseModel):
    buscar_respuestas_envios: AutomatizacionConfigRead


# ── Patch (toggle ON/OFF) ─────────────────────────────────────────────────────

class AutomatizacionConfigPatch(BaseModel):
    activa: Optional[bool] = None


# ── Respuesta del endpoint "Revisar ahora" ───────────────────────────────────

class RevisarAhoraResponse(BaseModel):
    respuestas_revisadas: int
    ok_marcados: int
    bad_marcados: int
    bad_borrados: int
    errores: list[str]