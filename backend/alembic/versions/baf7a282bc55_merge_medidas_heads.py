"""merge medidas heads

Revision ID: baf7a282bc55
Revises: 6b5ab404d2f7, abcd1234...
Create Date: 2026-02-12 00:47:03.383565

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'baf7a282bc55'
down_revision: Union[str, Sequence[str], None] = ('6b5ab404d2f7', 'abcd1234...')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
