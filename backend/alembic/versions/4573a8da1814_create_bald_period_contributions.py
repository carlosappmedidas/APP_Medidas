"""create bald period contributions

Revision ID: 4573a8da1814
Revises: a41cee73d818
Create Date: 2026-03-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4573a8da1814"
down_revision: Union[str, Sequence[str], None] = "a41cee73d818"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bald_period_contributions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("ingestion_file_id", sa.Integer(), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("ventana_publicacion", sa.String(length=10), nullable=False),
        sa.Column("energia_publicada_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_autoconsumo_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_pf_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_frontera_dd_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_generada_kwh", sa.Float(), nullable=False, server_default="0"),
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
            "ventana_publicacion",
            name="uq_bald_contrib_file_period_window",
        ),
        sa.CheckConstraint(
            "ventana_publicacion IN ('M2', 'M7', 'M11', 'ART15')",
            name="ck_bald_contrib_window",
        ),
    )

    op.create_index(
        "ix_bald_contrib_ingestion_file",
        "bald_period_contributions",
        ["ingestion_file_id"],
        unique=False,
    )
    op.create_index(
        "ix_bald_contrib_tenant_empresa_period",
        "bald_period_contributions",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )
    op.create_index(
        "ix_bald_contrib_tenant_empresa_window_period",
        "bald_period_contributions",
        ["tenant_id", "empresa_id", "ventana_publicacion", "anio", "mes"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_bald_contrib_tenant_empresa_window_period",
        table_name="bald_period_contributions",
    )
    op.drop_index(
        "ix_bald_contrib_tenant_empresa_period",
        table_name="bald_period_contributions",
    )
    op.drop_index(
        "ix_bald_contrib_ingestion_file",
        table_name="bald_period_contributions",
    )
    op.drop_table("bald_period_contributions")