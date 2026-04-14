"""rename nivel_tension to ccaa_2 in linea_inventario

Revision ID: l8m9n0o1p2q3
Revises: k7l8m9n0o1p2
Create Date: 2026-04-14
"""
from alembic import op
import sqlalchemy as sa

revision = "l8m9n0o1p2q3"
down_revision = "k7l8m9n0o1p2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "linea_inventario",
        "nivel_tension",
        new_column_name="ccaa_2",
        type_=sa.String(2),
    )


def downgrade() -> None:
    op.alter_column(
        "linea_inventario",
        "ccaa_2",
        new_column_name="nivel_tension",
        type_=sa.String(10),
    )