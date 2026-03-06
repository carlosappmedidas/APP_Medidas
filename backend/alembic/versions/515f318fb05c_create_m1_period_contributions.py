"""create m1_period_contributions

Revision ID: 515f318fb05c
Revises: 87f3e5c0b197
Create Date: 2026-03-05

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "515f318fb05c"
down_revision = "87f3e5c0b197"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "m1_period_contributions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("ingestion_file_id", sa.Integer(), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("energia_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("is_principal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
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
            name="uq_m1_contrib_file_period",
        ),
    )

    op.create_index(
        "ix_m1_contrib_ingestion_file",
        "m1_period_contributions",
        ["ingestion_file_id"],
        unique=False,
    )
    op.create_index(
        "ix_m1_contrib_tenant_empresa_period",
        "m1_period_contributions",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_m1_contrib_tenant_empresa_period")
    op.execute("DROP INDEX IF EXISTS ix_m1_contrib_ingestion_file")
    op.drop_table("m1_period_contributions")