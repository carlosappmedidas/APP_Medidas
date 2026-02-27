"""add energia_pf columns to medidas_general

Revision ID: xxxx_add_pf
Revises: baf7a282bc55
Create Date: 2026-02-12 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "xxxx_add_pf"  # Alembic lo genera al crear el fichero; deja el que ponga él
down_revision: Union[str, Sequence[str], None] = "baf7a282bc55"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Añade columnas PF a medidas_general."""
    op.add_column(
        "medidas_general",
        sa.Column("energia_pf_kwh", sa.Float(), nullable=True),
    )
    op.add_column(
        "medidas_general",
        sa.Column("energia_pf_final_kwh", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """Revierte las columnas PF de medidas_general."""
    op.drop_column("medidas_general", "energia_pf_final_kwh")
    op.drop_column("medidas_general", "energia_pf_kwh")