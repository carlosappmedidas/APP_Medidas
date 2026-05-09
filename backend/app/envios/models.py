# app/envios/models.py
# pyright: reportMissingImports=false

from __future__ import annotations

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)

from app.core.models_base import Base


class EnvioM(Base):
    """
    Histórico de ficheros AGRECL/INMECL/MAGCL enviados al SFTP REE
    desde APP Medidas, con seguimiento de respuestas (.ok / .bad).

    Patrón de nombres soportado:
      - AGRECL_{empresa}_{fechagen}.{ver}.bz2
        ej: AGRECL_0277_20251229.0.bz2
      - MAGCL_{empresa}_{periodo}_{fechagen}.{ver}.bz2
        ej: MAGCL_0277_202511_20251229.0.bz2
      - INMECL_{empresa}_{comerc}_{periodo}_{fechagen}.{ver}.bz2
        ej: INMECL_0277_0091_202511_20251229.0.bz2
    """

    __tablename__ = "envios_m"

    id = Column(Integer, primary_key=True, index=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id",  ondelete="CASCADE"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True)
    codigo_ree_empresa = Column(String(10), nullable=False)

    # ── Tipo de fichero ───────────────────────────────────────────────────
    tipo = Column(String(10), nullable=False, index=True)        # AGRECL / INMECL / MAGCL
    comercializadora_codigo = Column(String(10), nullable=True)  # solo INMECL

    # ── Periodo de los datos (AGRECL no tiene) ────────────────────────────
    periodo_anio = Column(Integer, nullable=True)
    periodo_mes  = Column(Integer, nullable=True)

    # ── Fecha de generación + versión (siempre presentes) ────────────────
    fecha_generacion = Column(Date, nullable=False)
    version          = Column(Integer, nullable=False, default=0)

    # ── Clasificación M1/M2/M7 ────────────────────────────────────────────
    # Para INMECL/MAGCL: calculada desde fechagen vs periodo
    # Para AGRECL: seleccionada por el usuario al subir
    m_clasificacion = Column(String(5), nullable=False, index=True)

    # ── Fichero ───────────────────────────────────────────────────────────
    nombre_fichero = Column(String(500), nullable=False, index=True)

    # ── Trazabilidad SFTP ─────────────────────────────────────────────────
    ftp_log_id      = Column(Integer, ForeignKey("ftp_sync_log.id", ondelete="SET NULL"), nullable=True)
    subido_sftp_at  = Column(DateTime, nullable=False, server_default=func.now())

    # ── Estado REE ────────────────────────────────────────────────────────
    estado_ree                = Column(String(10), nullable=True)   # None | 'ok' | 'bad'
    estado_ree_n              = Column(Integer,   nullable=True)    # 2 = .bad2, 3 = .bad3
    respuesta_recibida_at     = Column(DateTime,  nullable=True)
    respuesta_nombre_fichero  = Column(String(500), nullable=True)
    reintentos                = Column(Integer, nullable=False, default=0)

    # ── Timestamps ────────────────────────────────────────────────────────
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())