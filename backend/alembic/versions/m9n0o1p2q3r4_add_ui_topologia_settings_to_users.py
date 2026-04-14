"""add ui_topologia_settings to users

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2026-04-14 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "m9n0o1p2q3r4"
down_revision: Union[str, None] = "l8m9n0o1p2q3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ui_topologia_settings", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ui_topologia_settings")