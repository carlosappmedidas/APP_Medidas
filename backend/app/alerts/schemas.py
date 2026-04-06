# app/alerts/schemas.py
# pyright: reportMissingImports=false
from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


# ── Catálogo ──────────────────────────────────────────────────────────────

class AlertRuleCatalogRead(BaseModel):
    id: int
    code: str
    nombre: str
    descripcion: Optional[str] = None
    metric_field: str
    diff_unit: str
    default_threshold: float
    default_severity: str
    active_by_default: bool
    category: str
    comparison_type: str
    model_config = ConfigDict(from_attributes=True)


# ── Configuración por empresa ─────────────────────────────────────────────

class EmpresaAlertRuleConfigItem(BaseModel):
    alert_code: str
    nombre: str
    descripcion: Optional[str] = None
    is_enabled: bool
    threshold_value: float
    severity: str
    diff_unit: str
    default_threshold: float
    default_severity: str
    category: str
    comparison_type: str


class EmpresaAlertRuleConfigUpdateItem(BaseModel):
    alert_code: str
    is_enabled: bool
    threshold_value: Optional[float] = None
    severity: Optional[str] = None


class EmpresaAlertRuleConfigUpdatePayload(BaseModel):
    items: List[EmpresaAlertRuleConfigUpdateItem]


# ── Resultados ────────────────────────────────────────────────────────────

class AlertResultRead(BaseModel):
    id: int
    tenant_id: int
    empresa_id: int
    empresa_nombre: Optional[str] = None
    alert_code: str
    alerta: str
    category: str
    comparison_type: str
    anio: int
    mes: int
    status: str
    severity: str
    current_value: Optional[float] = None
    previous_value: Optional[float] = None
    diff_value: Optional[float] = None
    diff_unit: str
    threshold_value: float
    message: Optional[str] = None
    lifecycle_status: str
    resolved_by: Optional[int] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# ── Ciclo de vida ─────────────────────────────────────────────────────────

class AlertLifecyclePayload(BaseModel):
    lifecycle_status: str   # "nueva" | "en_revision" | "resuelta"
    comment: str            # obligatorio siempre


# ── Comentarios ───────────────────────────────────────────────────────────

class AlertCommentRead(BaseModel):
    id: int
    alert_id: int
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    comment: str
    lifecycle_status_at_time: Optional[str] = None
    created_at: datetime


class AlertCommentCreate(BaseModel):
    comment: str


# ── Recálculo ─────────────────────────────────────────────────────────────

class AlertRecalculatePayload(BaseModel):
    empresa_id: int
    anio: int
    mes: int


class AlertRecalculateAllPayload(BaseModel):
    anio: int
    mes: int
    tenant_id: Optional[int] = None  # solo superusuario


class AlertRecalculateResponse(BaseModel):
    empresa_id: int
    anio: int
    mes: int
    triggered: int


class AlertRecalculateAllResponse(BaseModel):
    anio: int
    mes: int
    empresas_procesadas: int
    total_triggered: int


# ── Periodos disponibles ──────────────────────────────────────────────────

class AlertAvailablePeriodsRead(BaseModel):
    empresa_id: int
    anios: List[int]
    meses: List[int]