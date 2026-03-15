# app/measures/ps_models.py
# pyright: reportMissingImports=false

from sqlalchemy import (
    Column,
    Integer,
    Float,
    Boolean,
    ForeignKey,
    Index,
    UniqueConstraint,
)

from app.core.models_base import Base, TimestampMixin


class PSPeriodContribution(TimestampMixin, Base):
    """
    Contribución agregada de un fichero PS a un periodo concreto.

    Clave lógica:
      tenant_id + empresa_id + ingestion_file_id + anio + mes
    """

    __tablename__ = "ps_period_contributions"

    id = Column(Integer, primary_key=True, nullable=False)

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
    )
    ingestion_file_id = Column(
        Integer,
        ForeignKey("ingestion_files.id", ondelete="CASCADE"),
        nullable=False,
    )

    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)

    is_principal = Column(Boolean, nullable=False, default=False)

    # --- ENERGÍA POR TIPO DE PS (poliza 1..5) ---
    energia_ps_tipo_1_kwh = Column(Float, nullable=False, default=0.0)
    energia_ps_tipo_2_kwh = Column(Float, nullable=False, default=0.0)
    energia_ps_tipo_3_kwh = Column(Float, nullable=False, default=0.0)
    energia_ps_tipo_4_kwh = Column(Float, nullable=False, default=0.0)
    energia_ps_tipo_5_kwh = Column(Float, nullable=False, default=0.0)
    energia_ps_total_kwh = Column(Float, nullable=False, default=0.0)

    # --- CUPS POR TIPO DE PS ---
    cups_tipo_1 = Column(Integer, nullable=False, default=0)
    cups_tipo_2 = Column(Integer, nullable=False, default=0)
    cups_tipo_3 = Column(Integer, nullable=False, default=0)
    cups_tipo_4 = Column(Integer, nullable=False, default=0)
    cups_tipo_5 = Column(Integer, nullable=False, default=0)
    cups_total = Column(Integer, nullable=False, default=0)

    # --- IMPORTE POR TIPO DE PS ---
    importe_tipo_1_eur = Column(Float, nullable=False, default=0.0)
    importe_tipo_2_eur = Column(Float, nullable=False, default=0.0)
    importe_tipo_3_eur = Column(Float, nullable=False, default=0.0)
    importe_tipo_4_eur = Column(Float, nullable=False, default=0.0)
    importe_tipo_5_eur = Column(Float, nullable=False, default=0.0)
    importe_total_eur = Column(Float, nullable=False, default=0.0)

    # --- BLOQUES POR TARIFA (energía, cups, importe) ---
    # 2.0TD
    energia_tarifa_20td_kwh = Column(Float, nullable=False, default=0.0)
    cups_tarifa_20td = Column(Integer, nullable=False, default=0)
    importe_tarifa_20td_eur = Column(Float, nullable=False, default=0.0)

    # 3.0TD
    energia_tarifa_30td_kwh = Column(Float, nullable=False, default=0.0)
    cups_tarifa_30td = Column(Integer, nullable=False, default=0)
    importe_tarifa_30td_eur = Column(Float, nullable=False, default=0.0)

    # 3.0TDVE
    energia_tarifa_30tdve_kwh = Column(Float, nullable=False, default=0.0)
    cups_tarifa_30tdve = Column(Integer, nullable=False, default=0)
    importe_tarifa_30tdve_eur = Column(Float, nullable=False, default=0.0)

    # 6.1TD
    energia_tarifa_61td_kwh = Column(Float, nullable=False, default=0.0)
    cups_tarifa_61td = Column(Integer, nullable=False, default=0)
    importe_tarifa_61td_eur = Column(Float, nullable=False, default=0.0)

    # 6.2TD
    energia_tarifa_62td_kwh = Column(Float, nullable=False, default=0.0)
    cups_tarifa_62td = Column(Integer, nullable=False, default=0)
    importe_tarifa_62td_eur = Column(Float, nullable=False, default=0.0)

    # 6.3TD
    energia_tarifa_63td_kwh = Column(Float, nullable=False, default=0.0)
    cups_tarifa_63td = Column(Integer, nullable=False, default=0)
    importe_tarifa_63td_eur = Column(Float, nullable=False, default=0.0)

    # 6.4TD
    energia_tarifa_64td_kwh = Column(Float, nullable=False, default=0.0)
    cups_tarifa_64td = Column(Integer, nullable=False, default=0)
    importe_tarifa_64td_eur = Column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "empresa_id",
            "ingestion_file_id",
            "anio",
            "mes",
            name="uq_ps_contrib_file_period",
        ),
        Index(
            "ix_ps_contrib_tenant_empresa_period",
            "tenant_id",
            "empresa_id",
            "anio",
            "mes",
        ),
        Index(
            "ix_ps_contrib_ingestion_file",
            "ingestion_file_id",
        ),
    )