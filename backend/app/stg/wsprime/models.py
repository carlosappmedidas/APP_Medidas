# backend/app/stg/wsprime/models.py
# pyright: reportMissingImports=false
"""
Modelo del módulo WS-PRIME (Paquete 11).

Una fila por concentrador con configuración WS-PRIME (URL del Web Service,
credenciales, fabricante). Es una alternativa al canal FTP/SFTP de
stg_conexion_empresa: en vez de descargar ficheros S0X periódicamente, se
consultan datos puntuales al concentrador vía Web Service PRIME.

fabricante:
    "circutor"  -> CIRCUTOR (CIRWATT)
    "ziv"       -> ZIV (4CTI)
    "sagemcom"  -> SAGEMCOM (CX2000)
    "landis"    -> Landis+Gyr
    "mock"      -> adapter simulado para tests sin credenciales reales

ultima_conexion_*:
    Diagnóstico del último test de conexión (rellenado por services.test_conexion).
"""
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.core.models_base import Base, TimestampMixin


# Fabricantes válidos (mantener sincronizado con app/stg/wsprime/factory.py)
FABRICANTE_CIRCUTOR = "circutor"
FABRICANTE_ZIV      = "ziv"
FABRICANTE_SAGEMCOM = "sagemcom"
FABRICANTE_LANDIS   = "landis"
FABRICANTE_MOCK     = "mock"
FABRICANTES_VALIDOS: set[str] = {
    FABRICANTE_CIRCUTOR,
    FABRICANTE_ZIV,
    FABRICANTE_SAGEMCOM,
    FABRICANTE_LANDIS,
    FABRICANTE_MOCK,
}


class StgWsPrimeConfig(TimestampMixin, Base):
    """
    Configuración WS-PRIME de un concentrador (relación 1-1 con stg_concentrador).
    """
    __tablename__ = "stg_wsprime_config"

    id              = Column(Integer, primary_key=True)
    tenant_id       = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id      = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    concentrador_id = Column(
        Integer,
        ForeignKey("stg_concentrador.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    fabricante       = Column(String(20), nullable=False)   # ver FABRICANTES_VALIDOS
    url              = Column(String(500), nullable=False)
    usuario          = Column(String(100), nullable=False)
    password_cifrado = Column(Text, nullable=False)         # Fernet via app/core/crypto.py

    timeout_segundos = Column(Integer, nullable=False, default=30)
    verify_ssl       = Column(Boolean, nullable=False, default=True)
    activo           = Column(Boolean, nullable=False, default=True)

    # Diagnóstico del último test de conexión
    ultima_conexion_at    = Column(DateTime, nullable=True)
    ultima_conexion_ok    = Column(Boolean, nullable=True)
    ultima_conexion_error = Column(Text, nullable=True)

    concentrador = relationship(
        "StgConcentrador",
        back_populates="wsprime_config",
        lazy="joined",
    )

    __table_args__ = (
        UniqueConstraint("concentrador_id", name="uq_stg_wsprime_config_concentrador"),
    )