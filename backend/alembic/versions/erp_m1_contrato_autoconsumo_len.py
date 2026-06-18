"""ERP M1: ampliar erp_contrato.autoconsumo_tipo a String(40)

Los valores del enum (con_excedentes_no_compensacion = 30 chars) no caben en String(20).

Revision ID: erp_m1_contrato_autoconsumo_len
Revises: erp_m1_contrato_version
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_contrato_autoconsumo_len"
down_revision = "erp_m1_contrato_version"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "erp_contrato", "autoconsumo_tipo",
        existing_type=sa.String(length=20),
        type_=sa.String(length=40),
        existing_nullable=True,
    )


def downgrade():
    op.alter_column(
        "erp_contrato", "autoconsumo_tipo",
        existing_type=sa.String(length=40),
        type_=sa.String(length=20),
        existing_nullable=True,
    )
