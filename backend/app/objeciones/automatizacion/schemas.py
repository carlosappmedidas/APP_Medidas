# app/objeciones/automatizacion/schemas.py
# pyright: reportMissingImports=false

"""
Schemas Pydantic del submódulo Automatización de objeciones.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


# ═════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═════════════════════════════════════════════════════════════════════════════

class AutomatizacionConfigRead(BaseModel):
    """Respuesta de GET/PATCH /objeciones/automatizacion/config."""
    tenant_id:      int
    tipo:           str
    activa:         bool
    ultimo_run_at:  Optional[datetime] = None
    ultimo_run_ok:  Optional[bool]     = None
    ultimo_run_msg: Optional[str]      = None

    model_config = ConfigDict(from_attributes=True)


class AutomatizacionConfigPatch(BaseModel):
    """Payload del PATCH /objeciones/automatizacion/config."""
    activa: Optional[bool] = None


class RevisarAhoraResponse(BaseModel):
    """Respuesta del POST /objeciones/automatizacion/revisar-ahora."""
    ok:               bool
    mensaje:          str
    alertas_creadas:  int
    hitos_procesados: int


# ═════════════════════════════════════════════════════════════════════════════
# ALERTAS
# ═════════════════════════════════════════════════════════════════════════════

class AlertaRead(BaseModel):
    """Fila de alerta que devuelve GET /objeciones/alertas."""
    id:             int
    tenant_id:      int
    empresa_id:     int
    tipo:           str
    periodo:        str          # YYYYMM
    fecha_hito:     Optional[datetime] = None
    num_pendientes: int
    severidad:      str
    estado:         str          # "activa" | "resuelta" | "descartada"
    detalle:        Optional[List[Any]] = None   # lista parseada de detalle_json
    resuelta_at:    Optional[datetime]  = None
    resuelta_by:    Optional[int]       = None
    created_at:     Optional[datetime]  = None
    updated_at:     Optional[datetime]  = None

    # Datos "enriquecidos" que el router añade al serializar (no vienen del modelo):
    empresa_nombre:     Optional[str] = None
    empresa_codigo_ree: Optional[str] = None


class AlertasResumen(BaseModel):
    """
    Respuesta de GET /objeciones/alertas/resumen.
    Pensado para alimentar el banner del Dashboard de Objeciones.
    """
    total_alertas:         int
    empresas_afectadas:    int
    periodos_afectados:    int
    total_aobs_pendientes: int