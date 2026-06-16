"""ERP: añadir CNAE al contrato (paso 7 validaciones)

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("erp_contrato", sa.Column("cnae", sa.String(length=10), nullable=True))


def downgrade():
    op.drop_column("erp_contrato", "cnae")
