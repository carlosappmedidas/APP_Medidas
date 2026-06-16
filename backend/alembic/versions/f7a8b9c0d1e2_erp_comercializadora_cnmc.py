"""ERP: códigos CNMC en comercializadora (codigo_cnmc, liquidacion, fechas)

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("erp_comercializadora", sa.Column("codigo_cnmc", sa.String(length=20), nullable=True))
    op.add_column("erp_comercializadora", sa.Column("codigo_liquidacion_cnmc", sa.String(length=40), nullable=True))
    op.add_column("erp_comercializadora", sa.Column("fecha_alta_cnmc", sa.Date(), nullable=True))
    op.add_column("erp_comercializadora", sa.Column("fecha_baja_cnmc", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("erp_comercializadora", "fecha_baja_cnmc")
    op.drop_column("erp_comercializadora", "fecha_alta_cnmc")
    op.drop_column("erp_comercializadora", "codigo_liquidacion_cnmc")
    op.drop_column("erp_comercializadora", "codigo_cnmc")
