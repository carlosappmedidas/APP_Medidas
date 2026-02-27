"""merge medidas heads

Revision ID: 6b5ab404d2f7
Revises: abcd1234efgh, 6527f0c3c2cb
Create Date: 2026-02-10 12:52:09.271466

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6b5ab404d2f7'
down_revision: Union[str, Sequence[str], None] = ('abcd1234efgh', '6527f0c3c2cb')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
