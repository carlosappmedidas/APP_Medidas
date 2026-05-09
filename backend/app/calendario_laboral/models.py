# app/calendario_laboral/models.py
# pyright: reportMissingImports=false
"""
Modelo para gestionar los días festivos de Madrid (capital + comunidad + nacionales)
que se utilizan para calcular los plazos REE de envíos M1, M2 y M7.

- Los festivos pueden venir calculados automáticamente (origen='AUTO') a partir
  del algoritmo de Pascua + festivos nacionales y locales conocidos.
- También pueden ser manuales (origen='MANUAL'), p.ej. si el BOE publica un
  festivo excepcional o el usuario quiere sobrescribir un festivo concreto.
- Cada festivo tiene un 'ámbito' (NACIONAL / CCAA / LOCAL) para informar.
- 'activo' permite marcar/desmarcar un festivo sin borrarlo.

La clave de unicidad lógica es (tenant_id, anio, fecha): no puede haber dos
festivos para el mismo tenant en la misma fecha.
"""
from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)

from app.core.models_base import Base, TimestampMixin


class DiaFestivoMadrid(TimestampMixin, Base):
    __tablename__ = "dias_festivos_madrid"

    # ── Ámbitos ───────────────────────────────────────────────────────────
    AMBITO_NACIONAL = "NACIONAL"
    AMBITO_CCAA = "CCAA"
    AMBITO_LOCAL = "LOCAL"

    # ── Origen del festivo ────────────────────────────────────────────────
    ORIGEN_AUTO = "AUTO"
    ORIGEN_MANUAL = "MANUAL"

    id = Column(Integer, primary_key=True, index=True)

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    anio = Column(Integer, nullable=False, index=True)
    fecha = Column(Date, nullable=False, index=True)

    nombre = Column(String(150), nullable=False)
    ambito = Column(String(20), nullable=False, default=AMBITO_NACIONAL)
    origen = Column(String(20), nullable=False, default=ORIGEN_AUTO)

    activo = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "anio", "fecha",
            name="uq_dias_festivos_madrid_tenant_anio_fecha",
        ),
    )
