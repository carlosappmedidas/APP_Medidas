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
# Por ahora solo 1 tipo. Campo preparado para ampliar a futuros chequeos.
TIPO_BUSCAR_RESPUESTAS_ENVIOS = "buscar_respuestas_envios"


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