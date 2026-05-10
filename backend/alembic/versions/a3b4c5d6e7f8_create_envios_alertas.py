"""create envios_alertas table

Revision ID: a3b4c5d6e7f8
Revises: z2a3b4c5d6e7
Create Date: 2026-05-10 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "z2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "envios_alertas",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),

        # Multi-tenant
        sa.Column("tenant_id",  sa.Integer(),
                  sa.ForeignKey("tenants.id"),  nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(),
                  sa.ForeignKey("empresas.id"), nullable=False, index=True),

        # Clasificación
        sa.Column("tipo",    sa.String(40),  nullable=False, index=True),
        sa.Column("m_clas",  sa.String(4),   nullable=False, index=True),
        sa.Column("periodo", sa.String(10),  nullable=False, index=True),

        # Contexto
        sa.Column("plazo_fecha",    sa.DateTime(), nullable=True),
        sa.Column("num_pendientes", sa.Integer(),  nullable=False, server_default="0"),
        sa.Column("detalle_json",   sa.Text(),     nullable=True),

        # Severidad y ciclo de vida
        sa.Column("severidad", sa.String(20), nullable=False, server_default="warning"),
        sa.Column("estado",    sa.String(20), nullable=False, server_default="activa", index=True),

        # Gestión manual
        sa.Column("resuelta_at", sa.DateTime(), nullable=True),
        sa.Column("resuelta_by", sa.Integer(),
                  sa.ForeignKey("users.id"), nullable=True),

        # Timestamps
        sa.Column("created_at", sa.DateTime(),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),

        # Unicidad: una alerta por (tenant, empresa, tipo, M, periodo)
        sa.UniqueConstraint(
            "tenant_id", "empresa_id", "tipo", "m_clas", "periodo",
            name="uq_envios_alertas_clave",
        ),
    )

    # Índice compuesto útil para listar por tenant + estado
    op.create_index(
        "ix_envios_alertas_tenant_estado",
        "envios_alertas",
        ["tenant_id", "estado"],
    )


def downgrade() -> None:
    op.drop_index("ix_envios_alertas_tenant_estado", table_name="envios_alertas")
    op.drop_table("envios_alertas")