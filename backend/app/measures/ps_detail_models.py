# app/measures/ps_detail_models.py
# pyright: reportMissingImports=false

from sqlalchemy import Column, Integer, Float, String, Boolean, ForeignKey

from app.core.models_base import Base, TimestampMixin


class PSPeriodDetail(TimestampMixin, Base):
    """
    Detalle PS por fichero + periodo + CUPS.

    Esta tabla será la fuente correcta para reconstruir medidas_ps
    sin inflar CUPS, porque permite contar CUPS únicos reales.
    """

    __tablename__ = "ps_period_detail"

    id = Column(Integer, primary_key=True, nullable=False)

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    ingestion_file_id = Column(
        Integer,
        ForeignKey("ingestion_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    anio = Column(Integer, nullable=False, index=True)
    mes = Column(Integer, nullable=False, index=True)

    is_principal = Column(Boolean, nullable=False, default=False)

    cups = Column(String(255), nullable=False, index=True)
    poliza = Column(String(10), nullable=True, index=True)
    tarifa_acceso = Column(String(50), nullable=True, index=True)

    energia_facturada_kwh = Column(Float, nullable=False, default=0.0)
    importe_total_eur = Column(Float, nullable=False, default=0.0)