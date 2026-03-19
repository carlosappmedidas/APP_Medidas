# app/measures/contrib_models/ps_detail.py
# pyright: reportMissingImports=false
from sqlalchemy import (
    Column,
    Integer,
    Float,
    String,
    Boolean,
    ForeignKey,
    Index,
    UniqueConstraint,
)

from app.core.models_base import Base, TimestampMixin


class PSPeriodDetail(TimestampMixin, Base):
    """
    Detalle PS por fichero + periodo + CUPS.
    Permite contar CUPS únicos reales para reconstruir medidas_ps sin inflar.
    """
    __tablename__ = "ps_period_detail"

    id = Column(Integer, primary_key=True, nullable=False)
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
    is_principal = Column(Boolean, nullable=False, default=False)
    cups = Column(String(255), nullable=False)
    poliza = Column(String(10), nullable=True)
    tarifa_acceso = Column(String(50), nullable=True)
    energia_facturada_kwh = Column(Float, nullable=False, default=0.0)
    importe_total_eur = Column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "ingestion_file_id", "anio", "mes", "cups",
            name="uq_ps_period_detail_file_period_cups",
        ),
        Index(
            "ix_ps_period_detail_tenant_empresa_period",
            "tenant_id", "empresa_id", "anio", "mes",
        ),
        Index(
            "ix_ps_period_detail_cups_period",
            "tenant_id", "empresa_id", "cups", "anio", "mes",
        ),
        Index("ix_ps_period_detail_ingestion_file", "ingestion_file_id"),
        Index("ix_ps_period_detail_poliza", "poliza"),
        Index("ix_ps_period_detail_tarifa_acceso", "tarifa_acceso"),
    )