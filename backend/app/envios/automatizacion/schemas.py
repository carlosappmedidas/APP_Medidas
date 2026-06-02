# app/envios/automatizacion/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

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
    revisar_alertas_envios:   AutomatizacionConfigRead


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


# ═══════════════════════════════════════════════════════════════════════════
# Schemas de ALERTAS de envíos
# ═══════════════════════════════════════════════════════════════════════════


class EnvioAlertaRead(BaseModel):
    """Alerta tal como se devuelve en GET /envios/alertas."""
    id: int
    tenant_id: int
    empresa_id: int
    empresa_nombre: Optional[str] = None
    empresa_codigo_ree: Optional[str] = None

    tipo: Literal[
        "plazo_proximo",
        "plazo_vencido_bad",
        "plazo_vencido_pendiente",
        "respuesta_ree",
        "respuesta_ree_inventario",
    ]
    m_clas: Literal["M1", "M2", "M7", "diario", "mensual"]
    periodo: str

    plazo_fecha: Optional[datetime] = None
    num_pendientes: int
    detalle: Optional[Any] = None  # lista o dict según el tipo de alerta

    severidad: Literal["info", "warning", "critical"]
    estado: Literal["activa", "resuelta", "descartada"]

    resuelta_at: Optional[datetime] = None
    resuelta_by: Optional[int] = None

    created_at: datetime
    updated_at: datetime


class EnvioAlertaAccionResp(BaseModel):
    """Respuesta de los endpoints /resolver y /descartar."""
    id: int
    estado: Literal["resuelta", "descartada"]
    resuelta_at: Optional[datetime] = None
    resuelta_by: Optional[int] = None


class RecalcularAlertasResp(BaseModel):
    """Respuesta de POST /envios/alertas/recalcular."""
    creadas: int
    actualizadas: int
    auto_resueltas: int
    detalle: dict  # contador por tipo: {"plazo_proximo": N, ...}