"""add ui_table_settings to users

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-04-01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision      = "a1b2c3d4e5f6"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on    = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ui_table_settings", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "ui_table_settings")
