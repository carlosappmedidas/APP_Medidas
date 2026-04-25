"""add comentario_interno to objeciones tables

Revision ID: s5t6u7v8w9x0
Revises: r4s5t6u7v8w9
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = 's5t6u7v8w9x0'
down_revision = 'r4s5t6u7v8w9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Comentario interno propio del usuario (no se envía a REE).
    # Se añade en las 4 tablas de objeciones + en la tabla de REOBs generados,
    # para permitir anotaciones tanto a nivel de objeción individual como del REOB padre.
    op.add_column(
        'objeciones_agrecl',
        sa.Column('comentario_interno', sa.Text(), nullable=True),
    )
    op.add_column(
        'objeciones_incl',
        sa.Column('comentario_interno', sa.Text(), nullable=True),
    )
    op.add_column(
        'objeciones_cups',
        sa.Column('comentario_interno', sa.Text(), nullable=True),
    )
    op.add_column(
        'objeciones_cil',
        sa.Column('comentario_interno', sa.Text(), nullable=True),
    )
    op.add_column(
        'objeciones_reob_generados',
        sa.Column('comentario_interno', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('objeciones_reob_generados', 'comentario_interno')
    op.drop_column('objeciones_cil',           'comentario_interno')
    op.drop_column('objeciones_cups',          'comentario_interno')
    op.drop_column('objeciones_incl',          'comentario_interno')
    op.drop_column('objeciones_agrecl',        'comentario_interno')