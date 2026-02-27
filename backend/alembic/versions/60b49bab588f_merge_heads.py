"""merge heads

Revision ID: 60b49bab588f
Revises: c7d37f289c51, xxxxxxxxxxxx
Create Date: 2026-02-17 20:24:16.808332

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '60b49bab588f'
down_revision: Union[str, Sequence[str], None] = ('c7d37f289c51', 'xxxxxxxxxxxx')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
