"""merge_ree_and_ui_table_settings

Revision ID: 52bb439d4f37
Revises: b39ee342e598, a1b2c3d4e5f6
Create Date: 2026-04-01 22:18:27.052403

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52bb439d4f37'
down_revision: Union[str, Sequence[str], None] = ('b39ee342e598', 'a1b2c3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
