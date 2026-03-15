"""create general period contributions

Revision ID: a41cee73d818
Revises: c0d31722d63c
Create Date: 2026-03-13 17:11:27.377215

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a41cee73d818"
down_revision: Union[str, Sequence[str], None] = "c0d31722d63c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "general_period_contributions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("ingestion_file_id", sa.Integer(), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("source_tipo", sa.String(length=50), nullable=False),
        sa.Column("energia_generada_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_frontera_dd_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_pf_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_principal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["empresa_id"],
            ["empresas.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ingestion_file_id"],
            ["ingestion_files.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "empresa_id",
            "ingestion_file_id",
            "anio",
            "mes",
            "source_tipo",
            name="uq_general_contrib_file_period_tipo",
        ),
    )

    op.create_index(
        "ix_general_contrib_ingestion_file",
        "general_period_contributions",
        ["ingestion_file_id"],
        unique=False,
    )
    op.create_index(
        "ix_general_contrib_tenant_empresa_period",
        "general_period_contributions",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )
    op.create_index(
        "ix_general_contrib_tenant_empresa_tipo_period",
        "general_period_contributions",
        ["tenant_id", "empresa_id", "source_tipo", "anio", "mes"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_general_contrib_tenant_empresa_tipo_period",
        table_name="general_period_contributions",
    )
    op.drop_index(
        "ix_general_contrib_tenant_empresa_period",
        table_name="general_period_contributions",
    )
    op.drop_index(
        "ix_general_contrib_ingestion_file",
        table_name="general_period_contributions",
    )
    op.drop_table("general_period_contributions")