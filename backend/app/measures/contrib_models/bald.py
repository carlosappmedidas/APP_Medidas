# app/measures/contrib_models/bald.py
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
    CheckConstraint,
    func,
)

from app.core.models_base import Base


class BaldPeriodContribution(Base):
    """
    Guarda contribuciones BALD por periodo (año/mes) y ventana de publicación.
    Ventanas soportadas: M2, M7, M11, ART15.
    """
    __tablename__ = "bald_period_contributions"

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
    ventana_publicacion = Column(String(10), nullable=False)
    energia_publicada_kwh = Column(Float, nullable=False, server_default="0")
    energia_autoconsumo_kwh = Column(Float, nullable=False, server_default="0")
    energia_pf_kwh = Column(Float, nullable=False, server_default="0")
    energia_frontera_dd_kwh = Column(Float, nullable=False, server_default="0")
    energia_generada_kwh = Column(Float, nullable=False, server_default="0")
    is_principal = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "anio", "mes", "ventana_publicacion",
            name="uq_bald_contrib_period_window",
        ),
        CheckConstraint(
            "ventana_publicacion IN ('M2', 'M7', 'M11', 'ART15')",
            name="ck_bald_contrib_window",
        ),
        Index("ix_bald_contrib_ingestion_file", "ingestion_file_id"),
        Index(
            "ix_bald_contrib_tenant_empresa_period",
            "tenant_id", "empresa_id", "anio", "mes",
        ),
        Index(
            "ix_bald_contrib_tenant_empresa_window_period",
            "tenant_id", "empresa_id", "ventana_publicacion", "anio", "mes",
        ),
    )