"""add energia_generada_kwh to medidas_general

Revision ID: abcd1234efgh
Revises: 9f3d832068aa
Create Date: 2026-02-10 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Usa los valores reales que te ponga Alembic
revision: str = "abcd1234efgh"
down_revision: Union[str, Sequence[str], None] = "9f3d832068aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medidas_general",
        sa.Column("energia_generada_kwh", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("medidas_general", "energia_generada_kwh")