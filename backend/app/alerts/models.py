# app/alerts/models.py
# pyright: reportMissingImports=false
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, Index,
)
from app.core.models_base import Base, TimestampMixin


class AlertRuleCatalog(TimestampMixin, Base):
    """
    Catálogo global de reglas de alerta.

    category:
        "mes_anterior"  — compara con el mes anterior
        "absoluta"      — compara contra umbral fijo
        "anio_anterior" — compara con el mismo mes del año anterior

    comparison_type:
        "vs_prev_month"   — |valor_actual - valor_mes_anterior|
        "absolute_above"  — triggered si valor_actual > umbral
        "absolute_below"  — triggered si valor_actual < umbral (negativos)
        "vs_prev_year"    — |valor_actual - valor_mismo_mes_año_anterior|
    """
    __tablename__ = "alert_rule_catalog"

    id                = Column(Integer, primary_key=True)
    code              = Column(String(100), nullable=False, unique=True, index=True)
    nombre            = Column(String(255), nullable=False)
    descripcion       = Column(Text, nullable=True)
    metric_field      = Column(String(100), nullable=False)
    diff_unit         = Column(String(10), nullable=False)
    default_threshold = Column(Float, nullable=False)
    default_severity  = Column(String(20), nullable=False, default="warning")
    active_by_default = Column(Boolean, nullable=False, default=True)
    category          = Column(String(50), nullable=False, default="mes_anterior")
    comparison_type   = Column(String(30), nullable=False, default="vs_prev_month")


class EmpresaAlertRuleConfig(TimestampMixin, Base):
    """
    Configuración de umbrales y severidad por empresa.
    Si no hay fila para una regla, se usan los valores del catálogo.
    """
    __tablename__ = "empresa_alert_rule_configs"

    id              = Column(Integer, primary_key=True)
    tenant_id       = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id      = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    alert_code      = Column(String(100), ForeignKey("alert_rule_catalog.code"), nullable=False, index=True)
    is_enabled      = Column(Boolean, nullable=False, default=True)
    threshold_value = Column(Float, nullable=True)
    severity        = Column(String(20), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "empresa_id", "alert_code", name="uq_empresa_alert_rule_config"),
    )


class AlertResult(TimestampMixin, Base):
    """
    Resultado calculado de una alerta para empresa + año + mes.

    status:
        "triggered" — la alerta se disparó

    lifecycle_status:
        "nueva"       — recién calculada, nadie la ha gestionado
        "en_revision" — alguien está investigando
        "resuelta"    — cerrada con comentario de resolución
    """
    __tablename__ = "alert_results"

    id               = Column(Integer, primary_key=True)
    tenant_id        = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id       = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    alert_code       = Column(String(100), ForeignKey("alert_rule_catalog.code"), nullable=False, index=True)
    anio             = Column(Integer, nullable=False, index=True)
    mes              = Column(Integer, nullable=False, index=True)
    status           = Column(String(30), nullable=False, index=True)
    severity         = Column(String(20), nullable=False)
    current_value    = Column(Float, nullable=True)
    previous_value   = Column(Float, nullable=True)
    diff_value       = Column(Float, nullable=True)
    diff_unit        = Column(String(10), nullable=False)
    threshold_value  = Column(Float, nullable=False)
    message          = Column(Text, nullable=True)
    lifecycle_status = Column(String(30), nullable=False, default="nueva", index=True)
    resolved_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolved_at      = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "alert_code", "anio", "mes",
            name="uq_alert_result_unique_period",
        ),
        Index("ix_alert_results_empresa_period", "tenant_id", "empresa_id", "anio", "mes"),
    )


class AlertComment(Base):
    """
    Historial de comentarios por alerta.
    Cada cambio de estado lleva un comentario obligatorio.
    """
    __tablename__ = "alert_comments"

    id                       = Column(Integer, primary_key=True)
    alert_id                 = Column(Integer, ForeignKey("alert_results.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id                  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    comment                  = Column(Text, nullable=False)
    lifecycle_status_at_time = Column(String(30), nullable=True)
    created_at               = Column(DateTime, nullable=False, server_default="now()")