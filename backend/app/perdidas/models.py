# app/perdidas/models.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime,
    ForeignKey, Integer, Numeric, String, UniqueConstraint,
)

from app.core.models_base import Base, TimestampMixin, TenantMixin


class Concentrador(TenantMixin, TimestampMixin, Base):
    """
    Configuración de un concentrador/CT por empresa.
    Un concentrador gestiona uno o varios contadores de clientes
    y tiene un contador supervisor (cabecera del transformador).
    """
    __tablename__ = "concentrador"

    id              = Column(Integer, primary_key=True)
    empresa_id      = Column(Integer, nullable=False, index=True)
    nombre_ct       = Column(String, nullable=False)                  # nombre libre del CT
    id_concentrador = Column(String, nullable=False)                  # ej: CIR4622509200
    id_supervisor   = Column(String, nullable=True)                   # ej: CIR2082514122
    magn_supervisor = Column(Integer, nullable=False, default=1000)   # factor multiplicador
    directorio_ftp  = Column(String, nullable=True)                   # ej: /202604/
    ftp_config_id   = Column(Integer, ForeignKey("ftp_configs.id", ondelete="SET NULL"), nullable=True, index=True)
    fecha_ultimo_proceso = Column(Date, nullable=True)
    activo          = Column(Boolean, nullable=False, default=True)


class PerdidaDiaria(TenantMixin, Base):
    """
    Resultado del cálculo de pérdidas para un concentrador en un día concreto.
    Se genera procesando el fichero S02 del concentrador.

    Fórmula:
        perdida_wh = ai_supervisor - (ai_clientes - ae_clientes)
        perdida_pct = perdida_wh / ai_supervisor * 100
    """
    __tablename__ = "perdida_diaria"
    __table_args__ = (
        UniqueConstraint("concentrador_id", "fecha", name="uq_perdida_diaria_concentrador_fecha"),
    )

    id               = Column(Integer, primary_key=True)
    empresa_id       = Column(Integer, nullable=False, index=True)
    concentrador_id  = Column(Integer, ForeignKey("concentrador.id", ondelete="CASCADE"), nullable=False, index=True)
    fecha            = Column(Date, nullable=False, index=True)
    nombre_fichero_s02 = Column(String, nullable=True)               # nombre del fichero procesado
    ai_supervisor    = Column(BigInteger, nullable=False, default=0)  # Wh entrada transformador
    ae_supervisor    = Column(BigInteger, nullable=False, default=0)  # Wh exportación supervisor
    ai_clientes      = Column(BigInteger, nullable=False, default=0)  # Wh suma importación clientes
    ae_clientes      = Column(BigInteger, nullable=False, default=0)  # Wh suma exportación clientes (autoconsumos)
    energia_neta_wh  = Column(BigInteger, nullable=False, default=0)  # ai_supervisor × magn_supervisor
    perdida_wh       = Column(BigInteger, nullable=False, default=0)  # energía pérdida en Wh
    perdida_pct      = Column(Numeric(8, 4), nullable=True)           # % pérdida
    num_contadores   = Column(Integer, nullable=False, default=0)     # contadores leídos
    horas_con_datos  = Column(Integer, nullable=False, default=0)     # horas con lectura (de 24)
    estado           = Column(String(20), nullable=False, default="ok")  # ok / incompleto / sin_datos
    created_at       = Column(DateTime, nullable=False, default=datetime.utcnow)
