# app/measures/m1_models.py
# pyright: reportMissingImports=false

from sqlalchemy import (
    Column,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    func,
)

from app.core.models_base import Base


class M1PeriodContribution(Base):
    """
    Guarda contribuciones de facturación M1 por periodo (año/mes) y por fichero de ingestion,
    para evitar duplicidades y permitir control de refacturas.

    Tabla: m1_period_contributions
    """
    __tablename__ = "m1_period_contributions"

    id = Column(Integer, primary_key=True)

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    empresa_id = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False)

    ingestion_file_id = Column(
        Integer,
        ForeignKey("ingestion_files.id", ondelete="CASCADE"),
        nullable=False,
    )

    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)

    energia_kwh = Column(Float, nullable=False, server_default="0")
    is_principal = Column(Boolean, nullable=False, server_default="false")

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "empresa_id",
            "ingestion_file_id",
            "anio",
            "mes",
            name="uq_m1_contrib_file_period",
        ),
        Index("ix_m1_contrib_ingestion_file", "ingestion_file_id"),
        Index("ix_m1_contrib_tenant_empresa_period", "tenant_id", "empresa_id", "anio", "mes"),
    )