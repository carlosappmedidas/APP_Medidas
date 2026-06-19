"""ERP M1: contrato - unique (empresa_id, numero_contrato)

Revision ID: erp_m1_contrato_numero_uq
Revises: erp_m1_suministro_obligatorios
Create Date: 2026-06-19
"""
from alembic import op

revision = "erp_m1_contrato_numero_uq"
down_revision = "erp_m1_suministro_obligatorios"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint(
        "uq_erp_contrato_empresa_numero",
        "erp_contrato",
        ["empresa_id", "numero_contrato"],
    )


def downgrade():
    op.drop_constraint("uq_erp_contrato_empresa_numero", "erp_contrato", type_="unique")
