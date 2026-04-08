"""add nombre to ftp_configs

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-08

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ftp_configs",
        sa.Column(
            "nombre",
            sa.String(200),
            nullable=True,   # nullable — conexiones existentes quedan sin nombre
        ),
    )


def downgrade() -> None:
    op.drop_column("ftp_configs", "nombre")
