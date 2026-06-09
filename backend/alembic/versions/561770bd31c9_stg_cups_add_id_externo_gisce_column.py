"""stg_cups: add id_externo_gisce column

Revision ID: 561770bd31c9
Revises: 2b3c4d5e6f7a
Create Date: 2026-06-09 20:29:01.107208

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '561770bd31c9'
down_revision: Union[str, Sequence[str], None] = '2b3c4d5e6f7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'stg_cups',
        sa.Column('id_externo_gisce', sa.Integer(), nullable=True),
    )
    op.create_index(
        'ix_stg_cups_id_externo_gisce',
        'stg_cups',
        ['id_externo_gisce'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_stg_cups_id_externo_gisce', table_name='stg_cups')
    op.drop_column('stg_cups', 'id_externo_gisce')
