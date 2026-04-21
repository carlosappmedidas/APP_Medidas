"""add estado_ree to objeciones_reob_generados

Revision ID: r4s5t6u7v8w9
Revises: q3r4s5t6u7v8
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'r4s5t6u7v8w9'
down_revision = 'q3r4s5t6u7v8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Añadir columna estado_ree: NULL = sin respuesta, 'ok' = aceptado, 'bad' = rechazado
    op.add_column(
        'objeciones_reob_generados',
        sa.Column('estado_ree', sa.String(10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('objeciones_reob_generados', 'estado_ree')