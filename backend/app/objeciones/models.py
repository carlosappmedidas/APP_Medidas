# app/objeciones/models.py
# pyright: reportMissingImports=false

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Index,
)
from app.core.models_base import Base, TimestampMixin


class ObjecionAGRECL(TimestampMixin, Base):
    """
    Objeciones agregadas recibidas por la distribuidora.
    Fichero entrada:  AOBAGRECL_DDDD_CCCC_AAAAMM_FFFFFFFF.0
    Fichero respuesta: REOBAGRECL_DDDD_CCCC1_CCCC2_AAAAMM.0
    """

    __tablename__ = "objeciones_agrecl"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ── Metadatos del fichero ─────────────────────────────────────────────
    nombre_fichero = Column(String(255), nullable=True)   # nombre original del fichero

    # ── Cabeceras de entrada (AOBAGRECL) ─────────────────────────────────
    id_objecion    = Column(String(100), nullable=True, index=True)
    distribuidor   = Column(String(20),  nullable=True)
    comercializador = Column(String(20), nullable=True)
    nivel_tension  = Column(String(10),  nullable=True)
    tarifa_acceso  = Column(String(20),  nullable=True)
    disc_horaria   = Column(String(10),  nullable=True)
    tipo_punto     = Column(String(10),  nullable=True)
    provincia      = Column(String(10),  nullable=True)
    tipo_demanda   = Column(String(10),  nullable=True)
    periodo        = Column(String(10),  nullable=True, index=True)  # AAAA/MM
    motivo         = Column(String(10),  nullable=True)
    magnitud       = Column(String(10),  nullable=True)
    e_publicada    = Column(Numeric(18, 3), nullable=True)
    e_propuesta    = Column(Numeric(18, 3), nullable=True)
    comentario_emisor   = Column(Text, nullable=True)
    autoobjecion   = Column(String(1),  nullable=True)  # S/N

    # ── Campos de respuesta (se rellenan al gestionar) ────────────────────
    aceptacion             = Column(String(1),  nullable=True)   # S/N
    motivo_no_aceptacion   = Column(String(50), nullable=True)
    comentario_respuesta   = Column(Text, nullable=True)
    respuesta_publicada    = Column(Integer, nullable=True, default=0)  # 0/1

    # ── Envío SFTP ────────────────────────────────────────────────────────
    enviado_sftp_at        = Column(DateTime, nullable=True)
    enviado_sftp_config_id = Column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_objeciones_agrecl_tenant_empresa_periodo",
              "tenant_id", "empresa_id", "periodo"),
    )


class ObjecionINCL(TimestampMixin, Base):
    """
    Objeciones incrementales por CUPS.
    Fichero entrada:  OBJEINCL_CCCC_DDDD_AAAAMM_FFFFFFFF.0
    Fichero respuesta: REOBJEINCL_DDDD_CCCC1_CCCC2_AAAAMM.0
    """

    __tablename__ = "objeciones_incl"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ── Metadatos del fichero ─────────────────────────────────────────────
    nombre_fichero = Column(String(255), nullable=True)

    # ── Cabeceras de entrada (OBJEINCL) ───────────────────────────────────
    cups           = Column(String(30),  nullable=True, index=True)
    periodo        = Column(String(20),  nullable=True, index=True)  # "AAAAMMDD HH - AAAAMMDD HH"
    motivo         = Column(String(10),  nullable=True)
    ae_publicada   = Column(Numeric(18, 3), nullable=True)
    ae_propuesta   = Column(Numeric(18, 3), nullable=True)
    as_publicada   = Column(Numeric(18, 3), nullable=True)
    as_propuesta   = Column(Numeric(18, 3), nullable=True)
    comentario_emisor   = Column(Text, nullable=True)
    autoobjecion   = Column(String(1),  nullable=True)  # S/N

    # ── Campos de respuesta ───────────────────────────────────────────────
    aceptacion             = Column(String(1),  nullable=True)
    motivo_no_aceptacion   = Column(String(50), nullable=True)
    comentario_respuesta   = Column(Text, nullable=True)
    respuesta_publicada    = Column(Integer, nullable=True, default=0)

    # ── Envío SFTP ────────────────────────────────────────────────────────
    enviado_sftp_at        = Column(DateTime, nullable=True)
    enviado_sftp_config_id = Column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_objeciones_incl_tenant_empresa_cups",
              "tenant_id", "empresa_id", "cups"),
    )


class ObjecionCUPS(TimestampMixin, Base):
    """
    Objeciones por CUPS con ID.
    Fichero entrada:  AOBCUPS_DDDD_CCCC_AAAAMM_FFFFFFFF.0
    Fichero respuesta: REOBCUPS_DDDD_CCCC1_CCCC2_AAAAMM.0
    Nota: el fichero de entrada ya incluye los campos de respuesta (vacíos).
    """

    __tablename__ = "objeciones_cups"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ── Metadatos del fichero ─────────────────────────────────────────────
    nombre_fichero = Column(String(255), nullable=True)

    # ── Cabeceras de entrada (AOBCUPS) ────────────────────────────────────
    id_objecion    = Column(String(100), nullable=True, index=True)
    cups           = Column(String(30),  nullable=True, index=True)
    periodo        = Column(String(10),  nullable=True, index=True)  # AAAA/MM
    motivo         = Column(String(10),  nullable=True)
    e_publicada    = Column(Numeric(18, 3), nullable=True)
    e_propuesta    = Column(Numeric(18, 3), nullable=True)
    comentario_emisor   = Column(Text, nullable=True)
    autoobjecion   = Column(String(1),  nullable=True)  # S/N
    magnitud       = Column(String(10),  nullable=True)

    # ── Campos de respuesta ───────────────────────────────────────────────
    aceptacion             = Column(String(1),  nullable=True)
    motivo_no_aceptacion   = Column(String(50), nullable=True)
    comentario_respuesta   = Column(Text, nullable=True)
    respuesta_publicada    = Column(Integer, nullable=True, default=0)

    # ── Envío SFTP ────────────────────────────────────────────────────────
    enviado_sftp_at        = Column(DateTime, nullable=True)
    enviado_sftp_config_id = Column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_objeciones_cups_tenant_empresa_periodo",
              "tenant_id", "empresa_id", "periodo"),
    )


class ObjecionCIL(TimestampMixin, Base):
    """
    Objeciones por CIL (energía saliente + reactiva).
    Fichero entrada:  AOBCIL_DDDD_CCCC_AAAAMM_FFFFFFFF.0
    Fichero respuesta: REOBCIL_DDDD_RRRR1_RRRR2_AAAAMM.0
    """

    __tablename__ = "objeciones_cil"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ── Metadatos del fichero ─────────────────────────────────────────────
    nombre_fichero = Column(String(255), nullable=True)

    # ── Cabeceras de entrada (AOBCIL) ─────────────────────────────────────
    id_objecion    = Column(String(100), nullable=True, index=True)
    cil            = Column(String(30),  nullable=True, index=True)
    periodo        = Column(String(10),  nullable=True, index=True)  # AAAA/MM
    motivo         = Column(String(10),  nullable=True)
    eas_publicada  = Column(Numeric(18, 3), nullable=True)   # E. activa saliente publicada
    eas_propuesta  = Column(Numeric(18, 3), nullable=True)   # E. activa saliente propuesta
    eq2_publicada  = Column(Numeric(18, 3), nullable=True)   # E. reactiva Q2 publicada
    eq2_propuesta  = Column(Numeric(18, 3), nullable=True)   # E. reactiva Q2 propuesta
    eq3_publicada  = Column(Numeric(18, 3), nullable=True)   # E. reactiva Q3 publicada
    eq3_propuesta  = Column(Numeric(18, 3), nullable=True)   # E. reactiva Q3 propuesta
    comentario_emisor   = Column(Text, nullable=True)
    autoobjecion   = Column(String(1),  nullable=True)  # S/N

    # ── Campos de respuesta ───────────────────────────────────────────────
    aceptacion             = Column(String(1),  nullable=True)
    motivo_no_aceptacion   = Column(String(50), nullable=True)
    comentario_respuesta   = Column(Text, nullable=True)
    respuesta_publicada    = Column(Integer, nullable=True, default=0)

    # ── Envío SFTP ────────────────────────────────────────────────────────
    enviado_sftp_at        = Column(DateTime, nullable=True)
    enviado_sftp_config_id = Column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_objeciones_cil_tenant_empresa_periodo",
              "tenant_id", "empresa_id", "periodo"),
    )


class ReobGenerado(TimestampMixin, Base):
    __tablename__ = "objeciones_reob_generados"

    id                        = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id                 = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id                = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    tipo                      = Column(String(10),  nullable=False)
    nombre_fichero_aob        = Column(String(200), nullable=False)
    nombre_fichero_reob       = Column(String(200), nullable=False)
    comercializadora          = Column(String(10),  nullable=True)
    aaaamm                    = Column(String(6),   nullable=True)
    num_registros             = Column(Integer,     nullable=True)
    generado_at               = Column(DateTime,    nullable=True)
    descargado_at             = Column(DateTime,    nullable=True)
    enviado_sftp_at           = Column(DateTime,    nullable=True)
    config_sftp_id            = Column(Integer,     nullable=True)
    enviado_comunicaciones_at = Column(DateTime,    nullable=True)
    estado_ree                = Column(String(10),  nullable=True)  # NULL / 'ok' / 'bad'

    __table_args__ = (
        Index("ix_reob_generados_tenant_empresa", "tenant_id", "empresa_id"),
    )