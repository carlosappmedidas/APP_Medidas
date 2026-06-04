"""8f-2a add id_externo_gisce column to stg_concentrador

Revision ID: bbdd0079dda3
Revises: 91bfbf529116
Create Date: 2026-06-04 16:24:06.064674

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bbdd0079dda3'
down_revision: Union[str, Sequence[str], None] = '91bfbf529116'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add id_externo_gisce column to stg_concentrador for GISCE import (Paquete 8f)."""
    op.add_column(
        "stg_concentrador",
        sa.Column("id_externo_gisce", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_stg_concentrador_id_externo_gisce",
        "stg_concentrador",
        ["id_externo_gisce"],
    )


def downgrade() -> None:
    """Remove id_externo_gisce column from stg_concentrador."""
    op.drop_index("ix_stg_concentrador_id_externo_gisce", table_name="stg_concentrador")
    op.drop_column("stg_concentrador", "id_externo_gisce")
