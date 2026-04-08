# app/comunicaciones/models.py
# pyright: reportMissingImports=false

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func

from app.core.models_base import Base


class FtpConfig(Base):
    __tablename__ = "ftp_configs"

    id               = Column(Integer, primary_key=True, index=True)
    tenant_id        = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    empresa_id       = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True)
    host             = Column(String(255), nullable=False)
    puerto           = Column(Integer, nullable=False, default=22221)
    usuario          = Column(String(100), nullable=False)
    password_cifrada = Column(Text, nullable=False)
    directorio_remoto = Column(String(500), nullable=False, default="/")
    usar_tls         = Column(Boolean, nullable=False, default=True)   # ← NUEVO
    activo           = Column(Boolean, nullable=False, default=True)
    created_at       = Column(DateTime, nullable=False, server_default=func.now())
    updated_at       = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FtpSyncLog(Base):
    __tablename__ = "ftp_sync_log"

    id              = Column(Integer, primary_key=True, index=True)
    tenant_id       = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    empresa_id      = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre_fichero  = Column(String(500), nullable=False)
    tamanio         = Column(Integer, nullable=True)
    estado          = Column(String(10), nullable=False, default="ok")
    mensaje_error   = Column(Text, nullable=True)
    created_at      = Column(DateTime, nullable=False, server_default=func.now())
