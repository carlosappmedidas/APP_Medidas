"""create ps_period_contributions

Revision ID: c8b4e1f2a901
Revises: 9f2d7c6a4b11
Create Date: 2026-03-12

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c8b4e1f2a901"
down_revision = "9f2d7c6a4b11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ps_period_contributions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),

        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("ingestion_file_id", sa.Integer(), nullable=False),

        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),

        sa.Column("is_principal", sa.Boolean(), nullable=False, server_default=sa.text("false")),

        # --- ENERGÍA POR TIPO DE PS (poliza 1..5) ---
        sa.Column("energia_ps_tipo_1_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_ps_tipo_2_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_ps_tipo_3_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_ps_tipo_4_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_ps_tipo_5_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("energia_ps_total_kwh", sa.Float(), nullable=False, server_default="0"),

        # --- CUPS POR TIPO DE PS ---
        sa.Column("cups_tipo_1", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cups_tipo_2", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cups_tipo_3", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cups_tipo_4", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cups_tipo_5", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cups_total", sa.Integer(), nullable=False, server_default="0"),

        # --- IMPORTE POR TIPO DE PS ---
        sa.Column("importe_tipo_1_eur", sa.Float(), nullable=False, server_default="0"),
        sa.Column("importe_tipo_2_eur", sa.Float(), nullable=False, server_default="0"),
        sa.Column("importe_tipo_3_eur", sa.Float(), nullable=False, server_default="0"),
        sa.Column("importe_tipo_4_eur", sa.Float(), nullable=False, server_default="0"),
        sa.Column("importe_tipo_5_eur", sa.Float(), nullable=False, server_default="0"),
        sa.Column("importe_total_eur", sa.Float(), nullable=False, server_default="0"),

        # --- BLOQUES POR TARIFA (energía, cups, importe) ---
        # 2.0TD
        sa.Column("energia_tarifa_20td_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cups_tarifa_20td", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("importe_tarifa_20td_eur", sa.Float(), nullable=False, server_default="0"),

        # 3.0TD
        sa.Column("energia_tarifa_30td_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cups_tarifa_30td", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("importe_tarifa_30td_eur", sa.Float(), nullable=False, server_default="0"),

        # 3.0TDVE
        sa.Column("energia_tarifa_30tdve_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cups_tarifa_30tdve", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("importe_tarifa_30tdve_eur", sa.Float(), nullable=False, server_default="0"),

        # 6.1TD
        sa.Column("energia_tarifa_61td_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cups_tarifa_61td", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("importe_tarifa_61td_eur", sa.Float(), nullable=False, server_default="0"),

        # 6.2TD
        sa.Column("energia_tarifa_62td_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cups_tarifa_62td", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("importe_tarifa_62td_eur", sa.Float(), nullable=False, server_default="0"),

        # 6.3TD
        sa.Column("energia_tarifa_63td_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cups_tarifa_63td", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("importe_tarifa_63td_eur", sa.Float(), nullable=False, server_default="0"),

        # 6.4TD
        sa.Column("energia_tarifa_64td_kwh", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cups_tarifa_64td", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("importe_tarifa_64td_eur", sa.Float(), nullable=False, server_default="0"),

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
            name="uq_ps_contrib_file_period",
        ),
    )

    op.create_index(
        "ix_ps_contrib_ingestion_file",
        "ps_period_contributions",
        ["ingestion_file_id"],
        unique=False,
    )

    op.create_index(
        "ix_ps_contrib_tenant_empresa_period",
        "ps_period_contributions",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_ps_contrib_tenant_empresa_period")
    op.execute("DROP INDEX IF EXISTS ix_ps_contrib_ingestion_file")
    op.drop_table("ps_period_contributions")