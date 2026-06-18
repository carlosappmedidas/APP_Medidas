"""ERP M1: contrato - drop autoconsumo_colectivo (pasa al modulo de Autoconsumo)

Revision ID: erp_m1_contrato_drop_auto_col
Revises: erp_m1_contrato_drop_tipo_medida
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_contrato_drop_auto_col"
down_revision = "erp_m1_contrato_drop_tipo_medida"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("erp_contrato", "autoconsumo_colectivo")


def downgrade():
    op.add_column("erp_contrato", sa.Column("autoconsumo_colectivo", sa.Boolean(), nullable=False, server_default=sa.false()))
