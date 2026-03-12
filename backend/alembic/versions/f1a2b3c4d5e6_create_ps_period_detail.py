"""create ps_period_detail

Revision ID: f1a2b3c4d5e6
Revises: c8b4e1f2a901
Create Date: 2026-03-12

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f1a2b3c4d5e6"
down_revision = "c8b4e1f2a901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ps_period_detail",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),

        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("ingestion_file_id", sa.Integer(), nullable=False),

        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),

        sa.Column(
            "is_principal",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),

        sa.Column("cups", sa.String(length=255), nullable=False),
        sa.Column("poliza", sa.String(length=10), nullable=True),
        sa.Column("tarifa_acceso", sa.String(length=50), nullable=True),

        sa.Column(
            "energia_facturada_kwh",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "importe_total_eur",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),

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
            "cups",
            name="uq_ps_period_detail_file_period_cups",
        ),
    )

    op.create_index(
        "ix_ps_period_detail_tenant_empresa_period",
        "ps_period_detail",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )

    op.create_index(
        "ix_ps_period_detail_ingestion_file",
        "ps_period_detail",
        ["ingestion_file_id"],
        unique=False,
    )

    op.create_index(
        "ix_ps_period_detail_cups_period",
        "ps_period_detail",
        ["tenant_id", "empresa_id", "cups", "anio", "mes"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ps_period_detail_cups_period", table_name="ps_period_detail")
    op.drop_index("ix_ps_period_detail_ingestion_file", table_name="ps_period_detail")
    op.drop_index("ix_ps_period_detail_tenant_empresa_period", table_name="ps_period_detail")
    op.drop_table("ps_period_detail")