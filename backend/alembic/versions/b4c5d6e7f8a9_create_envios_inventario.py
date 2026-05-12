"""create envios_inventario table

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-05-12 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "envios_inventario",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),

        # Multi-tenant
        sa.Column("tenant_id",  sa.Integer(),
                  sa.ForeignKey("tenants.id",  ondelete="CASCADE"), nullable=False),
        sa.Column("empresa_id", sa.Integer(),
                  sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("codigo_ree_empresa", sa.String(10), nullable=False),

        # Tipo y frecuencia
        sa.Column("tipo",       sa.String(20), nullable=False),
        sa.Column("frecuencia", sa.String(10), nullable=False),

        # Fecha de generación
        sa.Column("fecha_generacion", sa.Date(),    nullable=False),
        sa.Column("version",          sa.Integer(), nullable=False, server_default="0"),

        # Fichero
        sa.Column("nombre_fichero", sa.String(500), nullable=False),

        # Trazabilidad SFTP
        sa.Column("ftp_log_id", sa.Integer(),
                  sa.ForeignKey("ftp_sync_log.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subido_sftp_at", sa.DateTime(),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),

        # Estado REE
        sa.Column("estado_ree",               sa.String(10),  nullable=True),
        sa.Column("estado_ree_n",             sa.Integer(),   nullable=True),
        sa.Column("respuesta_recibida_at",    sa.DateTime(),  nullable=True),
        sa.Column("respuesta_nombre_fichero", sa.String(500), nullable=True),
        sa.Column("reintentos",               sa.Integer(),   nullable=False, server_default="0"),

        # Timestamps
        sa.Column("created_at", sa.DateTime(),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    # Índices simples
    op.create_index("ix_envios_inventario_tenant_id",      "envios_inventario", ["tenant_id"])
    op.create_index("ix_envios_inventario_empresa_id",     "envios_inventario", ["empresa_id"])
    op.create_index("ix_envios_inventario_tipo",           "envios_inventario", ["tipo"])
    op.create_index("ix_envios_inventario_frecuencia",     "envios_inventario", ["frecuencia"])
    op.create_index("ix_envios_inventario_fecha_gen",      "envios_inventario", ["fecha_generacion"])
    op.create_index("ix_envios_inventario_nombre_fichero", "envios_inventario", ["nombre_fichero"])


def downgrade() -> None:
    op.drop_index("ix_envios_inventario_nombre_fichero", table_name="envios_inventario")
    op.drop_index("ix_envios_inventario_fecha_gen",      table_name="envios_inventario")
    op.drop_index("ix_envios_inventario_frecuencia",     table_name="envios_inventario")
    op.drop_index("ix_envios_inventario_tipo",           table_name="envios_inventario")
    op.drop_index("ix_envios_inventario_empresa_id",     table_name="envios_inventario")
    op.drop_index("ix_envios_inventario_tenant_id",      table_name="envios_inventario")
    op.drop_table("envios_inventario")