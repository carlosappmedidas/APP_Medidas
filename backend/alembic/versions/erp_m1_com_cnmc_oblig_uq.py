"""ERP M1: comercializadora - codigo_cnmc y codigo_liquidacion_cnmc obligatorios + unicos

Revision ID: erp_m1_com_cnmc_oblig_uq
Revises: erp_m1_contrato_drop_autocons
Create Date: 2026-06-19
"""
from alembic import op

revision = "erp_m1_com_cnmc_oblig_uq"
down_revision = "erp_m1_contrato_drop_autocons"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("erp_comercializadora", "codigo_cnmc", nullable=False)
    op.alter_column("erp_comercializadora", "codigo_liquidacion_cnmc", nullable=False)
    op.create_unique_constraint(
        "uq_erp_comercializadora_codigo_cnmc", "erp_comercializadora", ["codigo_cnmc"]
    )
    op.create_unique_constraint(
        "uq_erp_comercializadora_codigo_liq_cnmc", "erp_comercializadora", ["codigo_liquidacion_cnmc"]
    )


def downgrade():
    op.drop_constraint("uq_erp_comercializadora_codigo_liq_cnmc", "erp_comercializadora", type_="unique")
    op.drop_constraint("uq_erp_comercializadora_codigo_cnmc", "erp_comercializadora", type_="unique")
    op.alter_column("erp_comercializadora", "codigo_liquidacion_cnmc", nullable=True)
    op.alter_column("erp_comercializadora", "codigo_cnmc", nullable=True)
