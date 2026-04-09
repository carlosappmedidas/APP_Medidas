# app/comunicaciones/models.py
# pyright: reportMissingImports=false

from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, func

from app.core.models_base import Base


class FtpConfig(Base):
    __tablename__ = "ftp_configs"

    id                = Column(Integer, primary_key=True, index=True)
    tenant_id         = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    empresa_id        = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre            = Column(String(200), nullable=True)
    host              = Column(String(255), nullable=False)
    puerto            = Column(Integer, nullable=False, default=22221)
    usuario           = Column(String(100), nullable=False)
    password_cifrada  = Column(Text, nullable=False)
    directorio_remoto = Column(String(500), nullable=False, default="/")
    usar_tls          = Column(Boolean, nullable=False, default=True)
    activo            = Column(Boolean, nullable=False, default=True)
    created_at        = Column(DateTime, nullable=False, server_default=func.now())
    updated_at        = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FtpSyncRule(Base):
    """
    Regla de descarga automática por conexión FTP.
    Una conexión puede tener múltiples reglas — cada una
    descarga ficheros que coincidan con un patrón y directorio.
    """
    __tablename__ = "ftp_sync_rules"

    id                  = Column(Integer, primary_key=True, index=True)
    tenant_id           = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    config_id           = Column(Integer, ForeignKey("ftp_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre              = Column(String(200), nullable=True)               # nombre descriptivo de la regla
    directorio          = Column(String(500), nullable=False, default="/") # path FTP a escanear
    patron_nombre       = Column(String(200), nullable=True)               # ej: "BALD_", "" = todos
    intervalo_horas     = Column(Integer, nullable=False, default=1)       # 1, 6, 12, 24
    activo              = Column(Boolean, nullable=False, default=True)
    ultima_ejecucion    = Column(DateTime, nullable=True)
    proxima_ejecucion   = Column(DateTime, nullable=True)
    descargar_desde     = Column(Date, nullable=True)
    created_at          = Column(DateTime, nullable=False, server_default=func.now())
    updated_at          = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FtpSyncLog(Base):
    __tablename__ = "ftp_sync_log"

    id             = Column(Integer, primary_key=True, index=True)
    tenant_id      = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    empresa_id     = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True)
    config_id      = Column(Integer, ForeignKey("ftp_configs.id", ondelete="SET NULL"), nullable=True, index=True)  # ← NUEVO
    rule_id        = Column(Integer, ForeignKey("ftp_sync_rules.id", ondelete="SET NULL"), nullable=True, index=True)  # ← NUEVO
    origen         = Column(String(10), nullable=False, default="manual")  # ← NUEVO: "manual" | "auto"
    nombre_fichero = Column(String(500), nullable=False)
    tamanio        = Column(Integer, nullable=True)
    estado         = Column(String(10), nullable=False, default="ok")
    mensaje_error  = Column(Text, nullable=True)
    created_at     = Column(DateTime, nullable=False, server_default=func.now())
