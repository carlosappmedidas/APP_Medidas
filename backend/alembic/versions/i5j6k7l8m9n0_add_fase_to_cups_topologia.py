"""add fase column to cups_topologia

Revision ID: i5j6k7l8m9n0
Revises: h4i5j6k7l8m9
Create Date: 2026-04-12

Añade el campo 'fase' (R/S/T/RST) a cups_topologia
para identificar la fase del CT a la que está conectado cada contador.
"""
from alembic import op
import sqlalchemy as sa

revision = "i5j6k7l8m9n0"
down_revision = "h4i5j6k7l8m9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cups_topologia",
        sa.Column("fase", sa.String(3), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cups_topologia", "fase")
