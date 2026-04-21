# app/objeciones/automatizacion/models.py
# pyright: reportMissingImports=false

"""
Modelos del submódulo "Automatización de objeciones".

Contiene 2 tablas:
  - objeciones_automatizaciones: configuración por tenant de la automatización
    (activa/desactiva, último run). UNA fila por (tenant_id, tipo).
  - objeciones_alertas: alertas generadas por el job. UNA fila por
    (tenant_id, empresa_id, tipo, periodo) — el UNIQUE evita duplicados
    cuando el job se ejecuta en los días de red de seguridad.
"""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
)

from app.core.models_base import Base, TimestampMixin


# ── Tipos de automatización soportados ───────────────────────────────────────
TIPO_FIN_RECEPCION = "fin_recepcion"
# En el futuro se añadirá:
# TIPO_FIN_RESOLUCION = "fin_resolucion"


class ObjecionesAutomatizacion(TimestampMixin, Base):
    """
    Configuración de la automatización de objeciones por tenant.

    Cada tenant puede tener UNA fila por cada `tipo` de chequeo.
    Si no existe fila → la automatización se considera desactivada
    para ese tenant/tipo.

    Se actualiza con cada ejecución del job (último run y resultado).
    """

    __tablename__ = "objeciones_automatizaciones"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    # ── Tipo de automatización ────────────────────────────────────────────
    # Por ahora solo "fin_recepcion". Campo preparado para ampliar a
    # "fin_resolucion" u otros chequeos.
    tipo = Column(String(30), nullable=False, index=True)

    # ── Estado ────────────────────────────────────────────────────────────
    activa = Column(Integer, nullable=False, default=0)  # 0/1 — semántica bool

    # ── Registro del último run ───────────────────────────────────────────
    ultimo_run_at  = Column(DateTime, nullable=True)
    ultimo_run_ok  = Column(Integer,  nullable=True)   # 0/1 nullable — null = nunca ha corrido
    ultimo_run_msg = Column(Text,     nullable=True)   # mensaje legible del resultado

    __table_args__ = (
        UniqueConstraint("tenant_id", "tipo", name="uq_objeciones_automatizaciones_tenant_tipo"),
    )


class ObjecionesAlerta(TimestampMixin, Base):
    """
    Alerta generada por el job de automatización.

    Granularidad: UNA alerta por (tenant_id, empresa_id, tipo, periodo).
    El UNIQUE evita duplicados cuando el cron revisa varios días en la
    ventana de seguridad (D+1, D+2, D+3).

    El flujo es:
      1. Job detecta AOBs pendientes para (empresa, periodo)
         → crea o actualiza la alerta con estado = "activa".
      2. El usuario la ve y puede:
         - Descargar los AOBs desde el panel Descarga
           (la alerta sigue activa hasta que se marca manualmente).
         - Pulsar "Resolver" → estado = "resuelta".
         - Pulsar "Descartar" → estado = "descartada".
    """

    __tablename__ = "objeciones_alertas"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ── Clasificación ─────────────────────────────────────────────────────
    tipo    = Column(String(30), nullable=False, index=True)   # "fin_recepcion" por ahora
    periodo = Column(String(10), nullable=False, index=True)   # YYYYMM, ej "202507"

    # ── Contexto del hito que generó la alerta ────────────────────────────
    fecha_hito = Column(DateTime, nullable=True)  # fecha de FIN_RECEPCION_OBJECIONES

    # ── Detalle ───────────────────────────────────────────────────────────
    num_pendientes = Column(Integer, nullable=False, default=0)
    detalle_json   = Column(Text,    nullable=True)  # lista de AOBs + estado serializada

    # ── Severidad y ciclo de vida ─────────────────────────────────────────
    severidad = Column(String(20), nullable=False, default="warning")   # info|warning|critical
    estado    = Column(String(20), nullable=False, default="activa", index=True)  # activa|resuelta|descartada

    # ── Gestión manual ────────────────────────────────────────────────────
    resuelta_at = Column(DateTime, nullable=True)
    resuelta_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "tipo", "periodo",
            name="uq_objeciones_alertas_empresa_tipo_periodo",
        ),
        Index("ix_objeciones_alertas_tenant_estado", "tenant_id", "estado"),
    )