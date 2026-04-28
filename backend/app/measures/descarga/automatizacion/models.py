# app/measures/descarga/automatizacion/models.py
# pyright: reportMissingImports=false

"""
Modelos del submódulo "Automatización de descarga de publicaciones REE".

Contiene 2 tablas:
  - publicaciones_automatizaciones: configuración por tenant (activa/desactiva,
    último run). UNA fila por (tenant_id, tipo).
  - publicaciones_alertas: alertas generadas por el job. UNA fila por
    (tenant_id, empresa_id, tipo, periodo) — el UNIQUE evita duplicados
    cuando el cron revisa varios días en la ventana de seguridad.

Patrón clonado de app/objeciones/automatizacion/models.py.
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
# Por ahora solo 1 tipo. Campo preparado para ampliar a futuros chequeos.
TIPO_BUSCAR_PUBLICACIONES_REE = "buscar_publicaciones_ree"


class PublicacionesAutomatizacion(TimestampMixin, Base):
    """
    Configuración de la automatización de descarga de publicaciones por tenant.

    Cada tenant puede tener UNA fila por cada `tipo` de chequeo.
    Si no existe fila → la automatización se considera desactivada.

    Se actualiza con cada ejecución del job (último run y resultado).
    """

    __tablename__ = "publicaciones_automatizaciones"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    # ── Tipo de automatización ────────────────────────────────────────────
    tipo = Column(String(40), nullable=False, index=True)

    # ── Estado ────────────────────────────────────────────────────────────
    activa = Column(Integer, nullable=False, default=0)  # 0/1 — semántica bool

    # ── Registro del último run ───────────────────────────────────────────
    ultimo_run_at  = Column(DateTime, nullable=True)
    ultimo_run_ok  = Column(Integer,  nullable=True)   # 0/1 nullable — null = nunca ha corrido
    ultimo_run_msg = Column(Text,     nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "tipo", name="uq_publicaciones_automatizaciones_tenant_tipo"),
    )


class PublicacionesAlerta(TimestampMixin, Base):
    """
    Alerta generada por el job de automatización de publicaciones.

    Granularidad: UNA alerta por (tenant_id, empresa_id, tipo, periodo).

    Aquí `tipo` es el hito REE que la generó:
      - "publicacion_m2"
      - "publicacion_m7"
      - "publicacion_m11"
      - "publicacion_art15"

    El UNIQUE evita duplicados cuando el cron revisa los días siguientes.

    Flujo:
      1. Job detecta BALDs nuevos en SFTP tras un hito → crea/actualiza alerta.
      2. El usuario pulsa la campanita → ve la alerta → la pulsa → llega al
         panel de descarga ya filtrado.
      3. Tras importar manualmente, puede marcarla como "resuelta".
    """

    __tablename__ = "publicaciones_alertas"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ── Clasificación ─────────────────────────────────────────────────────
    tipo    = Column(String(40), nullable=False, index=True)   # "publicacion_m2" / m7 / m11 / art15
    periodo = Column(String(10), nullable=False, index=True)   # YYYYMM, ej "202506"

    # ── Contexto del hito que generó la alerta ────────────────────────────
    fecha_hito = Column(DateTime, nullable=True)

    # ── Detalle ───────────────────────────────────────────────────────────
    num_pendientes = Column(Integer, nullable=False, default=0)
    detalle_json   = Column(Text,    nullable=True)

    # ── Severidad y ciclo de vida ─────────────────────────────────────────
    severidad = Column(String(20), nullable=False, default="info")     # info|warning|critical
    estado    = Column(String(20), nullable=False, default="activa", index=True)

    # ── Gestión manual ────────────────────────────────────────────────────
    resuelta_at = Column(DateTime, nullable=True)
    resuelta_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "tipo", "periodo",
            name="uq_publicaciones_alertas_empresa_tipo_periodo",
        ),
        Index("ix_publicaciones_alertas_tenant_estado", "tenant_id", "estado"),
    )