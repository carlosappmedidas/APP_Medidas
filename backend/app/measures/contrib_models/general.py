# app/measures/contrib_models/general.py
# pyright: reportMissingImports=false
from sqlalchemy import (
    Column,
    Integer,
    Float,
    Boolean,
    String,
    DateTime,
    ForeignKey,
    Index,
    UniqueConstraint,
    func,
)

from app.core.models_base import Base


class GeneralPeriodContribution(Base):
    """
    Guarda contribuciones de medidas_general por periodo (año/mes) y por fichero
    de ingestion, para evitar duplicidades al reprocesar y permitir recálculo
    determinista.
    Se usa para tipos: ACUMCIL, ACUM_H2_GRD, ACUM_H2_GEN, ACUM_H2_RDD_P1,
    ACUM_H2_RDD_P2, ACUM_H2_RDD_PF, ACUM_H2_TRD_PF, y futuros tipos agregables.
    """
    __tablename__ = "general_period_contributions"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(
        Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False,
    )
    empresa_id = Column(
        Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False,
    )
    ingestion_file_id = Column(
        Integer, ForeignKey("ingestion_files.id", ondelete="CASCADE"), nullable=False,
    )
    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)
    source_tipo = Column(String(50), nullable=False)
    energia_generada_kwh = Column(Float, nullable=False, server_default="0")
    energia_frontera_dd_kwh = Column(Float, nullable=False, server_default="0")
    energia_pf_kwh = Column(Float, nullable=False, server_default="0")
    is_principal = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "ingestion_file_id", "anio", "mes", "source_tipo",
            name="uq_general_contrib_file_period_tipo",
        ),
        Index("ix_general_contrib_ingestion_file", "ingestion_file_id"),
        Index(
            "ix_general_contrib_tenant_empresa_period",
            "tenant_id", "empresa_id", "anio", "mes",
        ),
        Index(
            "ix_general_contrib_tenant_empresa_tipo_period",
            "tenant_id", "empresa_id", "source_tipo", "anio", "mes",
        ),
    )