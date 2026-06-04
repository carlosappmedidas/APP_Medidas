"""add legacy_cabecera_id to stg_concentrador

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
"""

from alembic import op
import sqlalchemy as sa


revision = '2b3c4d5e6f7a'
down_revision = '1a2b3c4d5e6f'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'stg_concentrador',
        sa.Column('legacy_cabecera_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_stg_concentrador_legacy_cabecera',
        'stg_concentrador', 'stg_concentrador',
        ['legacy_cabecera_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'ix_stg_concentrador_legacy_cabecera_id',
        'stg_concentrador',
        ['legacy_cabecera_id'],
    )


def downgrade():
    op.drop_index('ix_stg_concentrador_legacy_cabecera_id', table_name='stg_concentrador')
    op.drop_constraint('fk_stg_concentrador_legacy_cabecera', 'stg_concentrador', type_='foreignkey')
    op.drop_column('stg_concentrador', 'legacy_cabecera_id')
