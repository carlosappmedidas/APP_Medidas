"""add energia_autoconsumo_kwh to medidas_general

Revision ID: 6527f0c3c2cb
Revises: 9f3d832068aa
Create Date: 2026-02-10 00:04:30.401778
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# Identificadores de Alembic
revision: str = "6527f0c3c2cb"
down_revision: Union[str, Sequence[str], None] = "9f3d832068aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medidas_general",
        sa.Column("energia_autoconsumo_kwh", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("medidas_general", "energia_autoconsumo_kwh")