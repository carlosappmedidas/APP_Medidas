"""create ingestion and medidas tables

Revision ID: 87f3e5c0b197
Revises: fd4bce0415f1
Create Date: 2026-03-05 01:34:02.199830
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "87f3e5c0b197"
down_revision = "fd4bce0415f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ingestion_files
    op.create_table(
        "ingestion_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(length=50), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rows_ok", sa.Integer(), nullable=True),
        sa.Column("rows_error", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("warnings_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ingestion_files_tenant_id ON ingestion_files (tenant_id)")
    op.create_index("ix_ingestion_files_empresa_id", "ingestion_files", ["empresa_id"])

    # medidas_general
    op.create_table(
        "medidas_general",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("punto_id", sa.String(length=50), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),

        sa.Column("energia_bruta_facturada", sa.Float(), nullable=True),
        sa.Column("energia_autoconsumo_kwh", sa.Float(), nullable=True),
        sa.Column("energia_generada_kwh", sa.Float(), nullable=True),
        sa.Column("energia_frontera_dd_kwh", sa.Float(), nullable=True),
        sa.Column("energia_pf_kwh", sa.Float(), nullable=True),
        sa.Column("energia_pf_final_kwh", sa.Float(), nullable=True),
        sa.Column("energia_neta_facturada_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_pct", sa.Float(), nullable=True),

        sa.Column("energia_publicada_m2_kwh", sa.Float(), nullable=True),
        sa.Column("energia_autoconsumo_m2_kwh", sa.Float(), nullable=True),
        sa.Column("energia_pf_m2_kwh", sa.Float(), nullable=True),
        sa.Column("energia_frontera_dd_m2_kwh", sa.Float(), nullable=True),
        sa.Column("energia_generada_m2_kwh", sa.Float(), nullable=True),
        sa.Column("energia_neta_facturada_m2_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_m2_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_m2_pct", sa.Float(), nullable=True),

        sa.Column("energia_publicada_m7_kwh", sa.Float(), nullable=True),
        sa.Column("energia_autoconsumo_m7_kwh", sa.Float(), nullable=True),
        sa.Column("energia_pf_m7_kwh", sa.Float(), nullable=True),
        sa.Column("energia_frontera_dd_m7_kwh", sa.Float(), nullable=True),
        sa.Column("energia_generada_m7_kwh", sa.Float(), nullable=True),
        sa.Column("energia_neta_facturada_m7_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_m7_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_m7_pct", sa.Float(), nullable=True),

        sa.Column("energia_publicada_m11_kwh", sa.Float(), nullable=True),
        sa.Column("energia_autoconsumo_m11_kwh", sa.Float(), nullable=True),
        sa.Column("energia_pf_m11_kwh", sa.Float(), nullable=True),
        sa.Column("energia_frontera_dd_m11_kwh", sa.Float(), nullable=True),
        sa.Column("energia_generada_m11_kwh", sa.Float(), nullable=True),
        sa.Column("energia_neta_facturada_m11_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_m11_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_m11_pct", sa.Float(), nullable=True),

        sa.Column("energia_publicada_art15_kwh", sa.Float(), nullable=True),
        sa.Column("energia_autoconsumo_art15_kwh", sa.Float(), nullable=True),
        sa.Column("energia_pf_art15_kwh", sa.Float(), nullable=True),
        sa.Column("energia_frontera_dd_art15_kwh", sa.Float(), nullable=True),
        sa.Column("energia_generada_art15_kwh", sa.Float(), nullable=True),
        sa.Column("energia_neta_facturada_art15_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_art15_kwh", sa.Float(), nullable=True),
        sa.Column("perdidas_e_facturada_art15_pct", sa.Float(), nullable=True),

        sa.Column("file_id", sa.Integer(), sa.ForeignKey("ingestion_files.id", ondelete="SET NULL"), nullable=True),

        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_medidas_general_tenant_id", "medidas_general", ["tenant_id"])
    op.create_index("ix_medidas_general_empresa_id", "medidas_general", ["empresa_id"])

    # medidas_ps
    op.create_table(
        "medidas_ps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("punto_id", sa.String(length=50), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),

        sa.Column("energia_ps_tipo_1_kwh", sa.Float(), nullable=True),
        sa.Column("energia_ps_tipo_2_kwh", sa.Float(), nullable=True),
        sa.Column("energia_ps_tipo_3_kwh", sa.Float(), nullable=True),
        sa.Column("energia_ps_tipo_4_kwh", sa.Float(), nullable=True),
        sa.Column("energia_ps_tipo_5_kwh", sa.Float(), nullable=True),
        sa.Column("energia_ps_total_kwh", sa.Float(), nullable=True),

        sa.Column("cups_tipo_1", sa.Integer(), nullable=True),
        sa.Column("cups_tipo_2", sa.Integer(), nullable=True),
        sa.Column("cups_tipo_3", sa.Integer(), nullable=True),
        sa.Column("cups_tipo_4", sa.Integer(), nullable=True),
        sa.Column("cups_tipo_5", sa.Integer(), nullable=True),
        sa.Column("cups_total", sa.Integer(), nullable=True),

        sa.Column("importe_tipo_1_eur", sa.Float(), nullable=True),
        sa.Column("importe_tipo_2_eur", sa.Float(), nullable=True),
        sa.Column("importe_tipo_3_eur", sa.Float(), nullable=True),
        sa.Column("importe_tipo_4_eur", sa.Float(), nullable=True),
        sa.Column("importe_tipo_5_eur", sa.Float(), nullable=True),
        sa.Column("importe_total_eur", sa.Float(), nullable=True),

        sa.Column("energia_tarifa_20td_kwh", sa.Float(), nullable=True),
        sa.Column("cups_tarifa_20td", sa.Integer(), nullable=True),
        sa.Column("importe_tarifa_20td_eur", sa.Float(), nullable=True),

        sa.Column("energia_tarifa_30td_kwh", sa.Float(), nullable=True),
        sa.Column("cups_tarifa_30td", sa.Integer(), nullable=True),
        sa.Column("importe_tarifa_30td_eur", sa.Float(), nullable=True),

        sa.Column("energia_tarifa_30tdve_kwh", sa.Float(), nullable=True),
        sa.Column("cups_tarifa_30tdve", sa.Integer(), nullable=True),
        sa.Column("importe_tarifa_30tdve_eur", sa.Float(), nullable=True),

        sa.Column("energia_tarifa_61td_kwh", sa.Float(), nullable=True),
        sa.Column("cups_tarifa_61td", sa.Integer(), nullable=True),
        sa.Column("importe_tarifa_61td_eur", sa.Float(), nullable=True),

        sa.Column("energia_tarifa_62td_kwh", sa.Float(), nullable=True),
        sa.Column("cups_tarifa_62td", sa.Integer(), nullable=True),
        sa.Column("importe_tarifa_62td_eur", sa.Float(), nullable=True),

        sa.Column("energia_tarifa_63td_kwh", sa.Float(), nullable=True),
        sa.Column("cups_tarifa_63td", sa.Integer(), nullable=True),
        sa.Column("importe_tarifa_63td_eur", sa.Float(), nullable=True),

        sa.Column("energia_tarifa_64td_kwh", sa.Float(), nullable=True),
        sa.Column("cups_tarifa_64td", sa.Integer(), nullable=True),
        sa.Column("importe_tarifa_64td_eur", sa.Float(), nullable=True),

        sa.Column("file_id", sa.Integer(), sa.ForeignKey("ingestion_files.id", ondelete="SET NULL"), nullable=True),

        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_medidas_ps_tenant_id", "medidas_ps", ["tenant_id"])
    op.create_index("ix_medidas_ps_empresa_id", "medidas_ps", ["empresa_id"])

    # medidas_micro
    op.create_table(
        "medidas_micro",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("punto_id", sa.String(length=50), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),

        sa.Column("energia_kwh", sa.Float(), nullable=True),
        sa.Column("importe_eur", sa.Float(), nullable=True),
        sa.Column("cups", sa.Integer(), nullable=True),

        sa.Column("file_id", sa.Integer(), sa.ForeignKey("ingestion_files.id", ondelete="SET NULL"), nullable=True),

        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_medidas_micro_tenant_id", "medidas_micro", ["tenant_id"])
    op.create_index("ix_medidas_micro_empresa_id", "medidas_micro", ["empresa_id"])


def downgrade() -> None:
    op.drop_index("ix_medidas_micro_empresa_id", table_name="medidas_micro")
    op.drop_index("ix_medidas_micro_tenant_id", table_name="medidas_micro")
    op.drop_table("medidas_micro")

    op.drop_index("ix_medidas_ps_empresa_id", table_name="medidas_ps")
    op.drop_index("ix_medidas_ps_tenant_id", table_name="medidas_ps")
    op.drop_table("medidas_ps")

    op.drop_index("ix_medidas_general_empresa_id", table_name="medidas_general")
    op.drop_index("ix_medidas_general_tenant_id", table_name="medidas_general")
    op.drop_table("medidas_general")

    op.drop_index("ix_ingestion_files_empresa_id", table_name="ingestion_files")
    op.drop_index("ix_ingestion_files_tenant_id", table_name="ingestion_files")
    op.drop_table("ingestion_files")