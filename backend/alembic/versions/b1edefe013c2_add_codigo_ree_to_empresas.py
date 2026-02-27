"""add codigo_ree to empresas

Revision ID: b1edefe013c2
Revises: 650f314a7029
Create Date: 2026-02-27 21:34:56.139307

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1edefe013c2"
down_revision: Union[str, Sequence[str], None] = "650f314a7029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Añadimos la columna que el modelo Empresa espera
    op.add_column("empresas", sa.Column("codigo_ree", sa.String(length=50), nullable=True))
    # (opcional pero útil) índice si lo vais a buscar/filtrar mucho
    op.create_index(op.f("ix_empresas_codigo_ree"), "empresas", ["codigo_ree"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_empresas_codigo_ree"), table_name="empresas")
    op.drop_column("empresas", "codigo_ree")