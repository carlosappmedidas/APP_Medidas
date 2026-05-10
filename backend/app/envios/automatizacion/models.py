# app/envios/automatizacion/models.py
# pyright: reportMissingImports=false

"""
Modelo del submódulo "Automatización de búsqueda de respuestas REE".

Patrón clonado de app/measures/descarga/automatizacion/models.py.

Aquí no hace falta una tabla `envios_alertas` separada porque las
"alertas" son los propios envíos de `envios_m` con estado='pendiente'
o 'bad' antiguos.
"""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.core.models_base import Base


# ── Tipos de automatización soportados ───────────────────────────────────────
TIPO_BUSCAR_RESPUESTAS_ENVIOS = "buscar_respuestas_envios"
TIPO_REVISAR_ALERTAS_ENVIOS   = "revisar_alertas_envios"


class EnviosAutomatizacion(Base):
    """
    Configuración de la automatización de búsqueda de respuestas REE
    (.ok / .bad) por tenant.

    Cada tenant puede tener UNA fila por cada `tipo` de chequeo.
    Si no existe fila → la automatización se considera desactivada.

    Se actualiza con cada ejecución del job (último run y resultado).
    """

    __tablename__ = "envios_automatizaciones"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    # ── Tipo de automatización ────────────────────────────────────────────
    tipo = Column(String(40), nullable=False, index=True)

    # ── Estado ────────────────────────────────────────────────────────────
    activa = Column(Integer, nullable=False, default=0)  # 0/1 — semántica bool

    # ── Registro del último run ───────────────────────────────────────────
    ultimo_run_at  = Column(DateTime, nullable=True)
    ultimo_run_ok  = Column(Integer,  nullable=True)   # 0/1 nullable — null = nunca ha corrido
    ultimo_run_msg = Column(Text,     nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("tenant_id", "tipo", name="uq_envios_automatizaciones_tenant_tipo"),
    )

    # ═══════════════════════════════════════════════════════════════════════════
# Tabla de ALERTAS de envíos (creadas por jobs / detectadas en runtime)
# ═══════════════════════════════════════════════════════════════════════════

# ── Tipos de alerta ──────────────────────────────────────────────────────────
TIPO_PLAZO_PROXIMO            = "plazo_proximo"
TIPO_PLAZO_VENCIDO_BAD        = "plazo_vencido_bad"
TIPO_PLAZO_VENCIDO_PENDIENTE  = "plazo_vencido_pendiente"
TIPO_RESPUESTA_REE            = "respuesta_ree"

# ── Severidades ──────────────────────────────────────────────────────────────
SEVERIDAD_INFO     = "info"
SEVERIDAD_WARNING  = "warning"
SEVERIDAD_CRITICAL = "critical"

# ── Estados ──────────────────────────────────────────────────────────────────
ESTADO_ACTIVA     = "activa"
ESTADO_RESUELTA   = "resuelta"
ESTADO_DESCARTADA = "descartada"


class EnvioAlerta(Base):
    """
    Alerta sobre envíos M1/M2/M7.

    Granularidad: UNA alerta por (tenant_id, empresa_id, tipo, m_clas, periodo).
    El UNIQUE evita duplicados cuando el cron se ejecuta varias veces.

    Tipos:
      - plazo_proximo:           faltan ≤3 días al plazo Y empresa sin envíos
      - plazo_vencido_bad:       pasó plazo Y hay algún .bad
      - plazo_vencido_pendiente: pasó plazo Y empresa sin envíos
      - respuesta_ree:           consolidada de respuestas REE recibidas

    Flujo:
      1. Job detecta condición → crea/actualiza alerta con estado="activa"
      2. Usuario:
         - Pulsa "Resolver"  → estado="resuelta"
         - Pulsa "Descartar" → estado="descartada"
      3. plazo_proximo se auto-resuelve cuando se detecta envío del M.
    """

    __tablename__ = "envios_alertas"

    id = Column(Integer, primary_key=True)

    # ── Multi-tenant ──────────────────────────────────────────────────────
    tenant_id  = Column(Integer, ForeignKey("tenants.id"),  nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)

    # ── Clasificación ─────────────────────────────────────────────────────
    tipo    = Column(String(40), nullable=False, index=True)  # ver TIPO_*
    m_clas  = Column(String(4),  nullable=False, index=True)  # M1 | M2 | M7
    periodo = Column(String(10), nullable=False, index=True)  # YYYY-MM (mes_envio)

    # ── Contexto del hito que generó la alerta ────────────────────────────
    plazo_fecha    = Column(DateTime, nullable=True)
    num_pendientes = Column(Integer, nullable=False, default=0)
    detalle_json   = Column(Text, nullable=True)

    # ── Severidad y ciclo de vida ─────────────────────────────────────────
    severidad = Column(String(20), nullable=False, default=SEVERIDAD_WARNING)
    estado    = Column(String(20), nullable=False, default=ESTADO_ACTIVA, index=True)

    # ── Gestión manual ────────────────────────────────────────────────────
    resuelta_at = Column(DateTime, nullable=True)
    resuelta_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "empresa_id", "tipo", "m_clas", "periodo",
            name="uq_envios_alertas_clave",
        ),
    )