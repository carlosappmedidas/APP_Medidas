"""add comentarios por ventana to medidas_general

Añade 5 columnas de comentario libre (Text, nullable) a medidas_general,
una por cada ventana de publicación (M1 / M2 / M7 / M11 / ART15).
Pensadas para anotaciones del usuario, no se exportan a REE.

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-05-13 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "medidas_general",
        sa.Column("comentario_m1", sa.Text(), nullable=True),
    )
    op.add_column(
        "medidas_general",
        sa.Column("comentario_m2", sa.Text(), nullable=True),
    )
    op.add_column(
        "medidas_general",
        sa.Column("comentario_m7", sa.Text(), nullable=True),
    )
    op.add_column(
        "medidas_general",
        sa.Column("comentario_m11", sa.Text(), nullable=True),
    )
    op.add_column(
        "medidas_general",
        sa.Column("comentario_art15", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("medidas_general", "comentario_art15")
    op.drop_column("medidas_general", "comentario_m11")
    op.drop_column("medidas_general", "comentario_m7")
    op.drop_column("medidas_general", "comentario_m2")
    op.drop_column("medidas_general", "comentario_m1")