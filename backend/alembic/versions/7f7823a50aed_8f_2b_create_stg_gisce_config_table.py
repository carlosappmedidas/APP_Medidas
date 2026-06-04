"""8f-2b create stg_gisce_config table

Revision ID: 7f7823a50aed
Revises: bbdd0079dda3
Create Date: 2026-06-04 16:44:15.004074

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f7823a50aed'
down_revision: Union[str, Sequence[str], None] = 'bbdd0079dda3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create stg_gisce_config table for GISCE-ERP importer (Paquete 8f)."""
    op.create_table(
        "stg_gisce_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=True),
        sa.Column("host", sa.String(length=200), nullable=False),
        sa.Column("puerto", sa.Integer(), nullable=False, server_default="8069"),
        sa.Column("database", sa.String(length=100), nullable=False),
        sa.Column("usuario", sa.String(length=100), nullable=False),
        sa.Column("password_cifrado", sa.Text(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ultimo_import", sa.DateTime(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="no_probado"),
        sa.Column("ultimo_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("empresa_id", name="uq_stg_gisce_config_empresa"),
    )
    op.create_index("ix_stg_gisce_config_tenant_id", "stg_gisce_config", ["tenant_id"])
    op.create_index("ix_stg_gisce_config_empresa_id", "stg_gisce_config", ["empresa_id"])


def downgrade() -> None:
    """Drop stg_gisce_config table."""
    op.drop_index("ix_stg_gisce_config_empresa_id", table_name="stg_gisce_config")
    op.drop_index("ix_stg_gisce_config_tenant_id", table_name="stg_gisce_config")
    op.drop_table("stg_gisce_config")
