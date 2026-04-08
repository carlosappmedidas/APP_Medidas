"""add usar_tls to ftp_configs

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f7
Create Date: 2026-04-08

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ftp_configs",
        sa.Column(
            "usar_tls",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),   # todas las conexiones existentes → TLS=True
        ),
    )


def downgrade() -> None:
    op.drop_column("ftp_configs", "usar_tls")
