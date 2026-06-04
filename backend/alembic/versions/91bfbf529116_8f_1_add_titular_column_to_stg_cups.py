"""8f-1 add titular column to stg_cups

Revision ID: 91bfbf529116
Revises: j4d5e6f7g8h9
Create Date: 2026-06-04 14:17:24.700274

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '91bfbf529116'
down_revision: Union[str, Sequence[str], None] = 'j4d5e6f7g8h9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add titular column to stg_cups for GISCE import (Paquete 8f)."""
    op.add_column(
        "stg_cups",
        sa.Column("titular", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    """Remove titular column from stg_cups."""
    op.drop_column("stg_cups", "titular")
