# app/alerts/models.py
# pyright: reportMissingImports=false

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
)

from app.core.models_base import Base, TimestampMixin


class AlertRuleCatalog(TimestampMixin, Base):
    """
    Catálogo base de alertas disponibles en la plataforma.
    Define:
      - código único
      - nombre
      - descripción
      - campo de medida asociado
      - unidad
      - umbral por defecto
      - severidad por defecto
      - si está activa por defecto
    """

    __tablename__ = "alert_rule_catalog"

    id = Column(Integer, primary_key=True)
    code = Column(String(100), nullable=False, unique=True, index=True)

    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)

    # Campo real de MedidaGeneral que evalúa esta alerta
    metric_field = Column(String(100), nullable=False)

    # "%" o "pp"
    diff_unit = Column(String(10), nullable=False)

    default_threshold = Column(Float, nullable=False)
    default_severity = Column(String(20), nullable=False, default="warning")
    active_by_default = Column(Boolean, nullable=False, default=True)


class EmpresaAlertRuleConfig(TimestampMixin, Base):
    """
    Configuración de alertas por empresa.
    Permite activar/desactivar y sobrescribir umbral / severidad.
    """

    __tablename__ = "empresa_alert_rule_configs"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    alert_code = Column(
        String(100),
        ForeignKey("alert_rule_catalog.code"),
        nullable=False,
        index=True,
    )

    is_enabled = Column(Boolean, nullable=False, default=True)
    threshold_value = Column(Float, nullable=True)
    severity = Column(String(20), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "empresa_id",
            "alert_code",
            name="uq_empresa_alert_rule_config",
        ),
    )


class AlertResult(TimestampMixin, Base):
    """
    Resultado calculado de una alerta para empresa + año + mes.

    Solo guardamos resultados relevantes:
      - triggered
      - no_reference
    """

    __tablename__ = "alert_results"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    alert_code = Column(
        String(100),
        ForeignKey("alert_rule_catalog.code"),
        nullable=False,
        index=True,
    )

    anio = Column(Integer, nullable=False, index=True)
    mes = Column(Integer, nullable=False, index=True)

    # triggered | no_reference
    status = Column(String(30), nullable=False, index=True)

    # info | warning | critical
    severity = Column(String(20), nullable=False)

    current_value = Column(Float, nullable=True)
    previous_value = Column(Float, nullable=True)
    diff_value = Column(Float, nullable=True)

    # "%" o "pp"
    diff_unit = Column(String(10), nullable=False)

    threshold_value = Column(Float, nullable=False)

    message = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "empresa_id",
            "alert_code",
            "anio",
            "mes",
            name="uq_alert_result_unique_period",
        ),
        Index(
            "ix_alert_results_empresa_period",
            "tenant_id",
            "empresa_id",
            "anio",
            "mes",
        ),
    )