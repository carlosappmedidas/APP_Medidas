"""merge heads

Revision ID: 43aa1fb611e4
Revises: 60c0c253b2ba, e10f433a820b
Create Date: 2026-02-12 19:37:25.965355

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '43aa1fb611e4'
down_revision: Union[str, Sequence[str], None] = ('60c0c253b2ba', 'e10f433a820b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
