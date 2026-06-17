"""ERP M1: desglose direccion fiscal titular (escalera/piso/puerta, aclarador, vivienda habitual)

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("erp_titular", sa.Column("dir_escalera", sa.String(length=10), nullable=True))
    op.add_column("erp_titular", sa.Column("dir_piso", sa.String(length=3), nullable=True))
    op.add_column("erp_titular", sa.Column("dir_puerta", sa.String(length=3), nullable=True))
    op.add_column("erp_titular", sa.Column("dir_tipo_aclarador", sa.String(length=2), nullable=True))
    op.add_column("erp_titular", sa.Column("dir_aclarador", sa.String(length=255), nullable=True))
    op.add_column("erp_titular", sa.Column("vivienda_habitual", sa.Boolean(), nullable=True))
    op.alter_column(
        "erp_titular", "dir_tipo_via",
        existing_type=sa.String(length=50), type_=sa.String(length=2),
        existing_nullable=True,
    )
    op.drop_column("erp_titular", "dir_resto")


def downgrade():
    op.add_column("erp_titular", sa.Column("dir_resto", sa.String(length=255), nullable=True))
    op.alter_column(
        "erp_titular", "dir_tipo_via",
        existing_type=sa.String(length=2), type_=sa.String(length=50),
        existing_nullable=True,
    )
    op.drop_column("erp_titular", "vivienda_habitual")
    op.drop_column("erp_titular", "dir_aclarador")
    op.drop_column("erp_titular", "dir_tipo_aclarador")
    op.drop_column("erp_titular", "dir_puerta")
    op.drop_column("erp_titular", "dir_piso")
    op.drop_column("erp_titular", "dir_escalera")
