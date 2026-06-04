"""add tipo_dispositivo to stg_concentrador

Revision ID: 1a2b3c4d5e6f
Revises: 7f7823a50aed
Create Date: 2026-06-04 21:35:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = '1a2b3c4d5e6f'
down_revision = '7f7823a50aed'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'stg_concentrador',
        sa.Column('tipo_dispositivo', sa.String(length=30), nullable=True),
    )
    op.create_index(
        'ix_stg_concentrador_tipo_dispositivo',
        'stg_concentrador',
        ['tipo_dispositivo'],
    )
    op.execute("""
        UPDATE stg_concentrador
        SET tipo_dispositivo = 'medidor_cabecera'
        WHERE codigo_ct LIKE 'CIR4621%'
          AND tipo_dispositivo IS NULL
    """)


def downgrade():
    op.drop_index(
        'ix_stg_concentrador_tipo_dispositivo',
        table_name='stg_concentrador',
    )
    op.drop_column('stg_concentrador', 'tipo_dispositivo')
