# app/measures/descarga/automatizacion/schemas.py
# pyright: reportMissingImports=false

"""
Schemas Pydantic del submódulo Automatización de Publicaciones REE.
Patrón clonado de objeciones/automatizacion/schemas.py.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


# ── Configuración ─────────────────────────────────────────────────────────────

class AutomatizacionConfigRead(BaseModel):
    """Estado de la automatización de un tipo concreto para un tenant."""
    tenant_id:      int
    tipo:           str
    activa:         bool
    ultimo_run_at:  Optional[datetime] = None
    ultimo_run_ok:  Optional[bool]     = None
    ultimo_run_msg: Optional[str]      = None

    model_config = ConfigDict(from_attributes=True)


class AutomatizacionConfigAll(BaseModel):
    """
    Devuelve TODAS las configs del tenant en un objeto con 1 clave por tipo.
    Por ahora solo hay 1 tipo: buscar_publicaciones_ree.
    """
    buscar_publicaciones_ree: AutomatizacionConfigRead


class AutomatizacionConfigPatch(BaseModel):
    """Body del PATCH /config/{tipo} — solo se puede cambiar 'activa'."""
    activa: Optional[bool] = None


class RevisarAhoraResponse(BaseModel):
    """Respuesta del endpoint POST /revisar-ahora/{tipo}."""
    ok:                bool
    mensaje:           str
    alertas_creadas:   int
    hitos_procesados:  int


# ── Alertas ───────────────────────────────────────────────────────────────────

class AlertaRead(BaseModel):
    """Una alerta de publicaciones para mostrar en la campanita o en /alertas."""
    id:              int
    tenant_id:       int
    empresa_id:      int
    empresa_nombre:  Optional[str] = None
    tipo:            str           # publicacion_m2|m7|m11|art15
    periodo:         str           # YYYYMM
    fecha_hito:      Optional[datetime] = None
    num_pendientes:  int
    detalle:         Optional[List[Any]] = None
    severidad:       str
    estado:          str
    created_at:      datetime
    updated_at:      Optional[datetime] = None
    resuelta_at:     Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AlertasListResponse(BaseModel):
    """Respuesta del GET /alertas con resumen + listado."""
    total:    int
    activas:  int
    items:    List[AlertaRead]