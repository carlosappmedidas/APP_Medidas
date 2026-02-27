"""remove potencia_max_kw from medidas_general

Revision ID: 60c0c253b2ba
Revises: xxxx_add_pf
Create Date: 2026-02-12 11:54:25.146910

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '60c0c253b2ba'
down_revision: Union[str, Sequence[str], None] = 'xxxx_add_pf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Borramos la columna de la tabla medidas_general
    op.drop_column("medidas_general", "potencia_max_kw")


def downgrade() -> None:
    # Si hacemos rollback, volvemos a crear la columna
    op.add_column(
        "medidas_general",
        sa.Column("potencia_max_kw", sa.Float(), nullable=True),
    )