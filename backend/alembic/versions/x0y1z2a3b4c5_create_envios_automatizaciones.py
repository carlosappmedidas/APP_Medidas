"""create envios_automatizaciones table

Revision ID: x0y1z2a3b4c5
Revises: w9x0y1z2a3b4
Create Date: 2026-05-09 03:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "x0y1z2a3b4c5"
down_revision: Union[str, None] = "w9x0y1z2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Crea la tabla `envios_automatizaciones` para guardar la configuración
    por tenant del job que busca respuestas REE (.ok / .bad) en el SFTP.

    UNA fila por (tenant_id, tipo). Si no existe → automatización desactivada.
    """
    op.create_table(
        "envios_automatizaciones",
        sa.Column("id", sa.Integer, primary_key=True, index=True),

        # Multi-tenant
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),

        # Tipo de automatización (por ahora solo 'buscar_respuestas_envios')
        sa.Column("tipo", sa.String(40), nullable=False, index=True),

        # Toggle activa/inactiva (0/1 — semántica bool)
        sa.Column("activa", sa.Integer, nullable=False, server_default="0"),

        # Registro del último run
        sa.Column("ultimo_run_at",  sa.DateTime, nullable=True),
        sa.Column("ultimo_run_ok",  sa.Integer,  nullable=True),  # 0/1, NULL = nunca corrió
        sa.Column("ultimo_run_msg", sa.Text,     nullable=True),

        # Timestamps
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),

        sa.UniqueConstraint("tenant_id", "tipo", name="uq_envios_automatizaciones_tenant_tipo"),
    )


def downgrade() -> None:
    op.drop_table("envios_automatizaciones")