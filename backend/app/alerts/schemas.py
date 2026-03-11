# app/alerts/schemas.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


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

    model_config = ConfigDict(from_attributes=True)


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


class EmpresaAlertRuleConfigUpdateItem(BaseModel):
    alert_code: str
    is_enabled: bool
    threshold_value: Optional[float] = None
    severity: Optional[str] = None


class EmpresaAlertRuleConfigUpdatePayload(BaseModel):
    items: List[EmpresaAlertRuleConfigUpdateItem]


class AlertResultRead(BaseModel):
    id: int
    tenant_id: int
    empresa_id: int
    empresa_nombre: Optional[str] = None

    alert_code: str
    alerta: str

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

    created_at: datetime
    updated_at: Optional[datetime] = None


class AlertRecalculatePayload(BaseModel):
    empresa_id: int
    anio: int
    mes: int


class AlertRecalculateResponse(BaseModel):
    empresa_id: int
    anio: int
    mes: int
    results_created: int
    results: List[AlertResultRead]


class AlertAvailablePeriodsRead(BaseModel):
    empresa_id: int
    anios: List[int]
    meses: List[int]