"""ERP M1: contrato - drop autoconsumo_tipo y potencia_generacion_kw (van al modulo Autoconsumo)

Revision ID: erp_m1_contrato_drop_autocons
Revises: erp_m1_contrato_numero_uq
Create Date: 2026-06-19
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_contrato_drop_autocons"
down_revision = "erp_m1_contrato_numero_uq"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("erp_contrato", "autoconsumo_tipo")
    op.drop_column("erp_contrato", "potencia_generacion_kw")


def downgrade():
    op.add_column("erp_contrato", sa.Column("potencia_generacion_kw", sa.Float(), nullable=True))
    op.add_column("erp_contrato", sa.Column("autoconsumo_tipo", sa.String(40), nullable=True))
