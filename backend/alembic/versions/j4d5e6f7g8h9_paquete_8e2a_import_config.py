"""Paquete 8e-2a — tabla stg_import_config para configuración de imports administrativos.

Una fila por (empresa_id, origen) donde origen ∈ {excel, gisce_os, sips_cnmc}.
- mapeo_columnas: dict que mapea columnas del Excel → campos de stg_concentrador
- configuracion: credenciales/opciones del origen (GISCE/SIPS)
- last_sync / last_sync_status / last_sync_resumen: telemetría del último sync

Revision ID: j4d5e6f7g8h9
Revises: i3c4d5e6f7g8
Create Date: 2026-06-04 00:55:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "j4d5e6f7g8h9"
down_revision = "i3c4d5e6f7g8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stg_import_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False, index=True),
        sa.Column("origen", sa.String(length=20), nullable=False),
        sa.Column("mapeo_columnas", postgresql.JSONB(), nullable=True),
        sa.Column("configuracion", postgresql.JSONB(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_sync", sa.DateTime(timezone=False), nullable=True),
        sa.Column("last_sync_status", sa.String(length=30), nullable=True),
        sa.Column("last_sync_resumen", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("empresa_id", "origen", name="uq_stg_import_config_empresa_origen"),
    )


def downgrade() -> None:
    op.drop_table("stg_import_config")
