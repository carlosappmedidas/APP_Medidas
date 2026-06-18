"""ERP M1: contrato - drop tipo_medida (columna huerfana, sin uso)

Revision ID: erp_m1_contrato_drop_tipo_medida
Revises: erp_m1_contrato_tecnico
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_contrato_drop_tipo_medida"
down_revision = "erp_m1_contrato_tecnico"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("erp_contrato", "tipo_medida")


def downgrade():
    op.add_column("erp_contrato", sa.Column("tipo_medida", sa.String(length=20), nullable=True))
