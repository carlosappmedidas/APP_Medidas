"""add ct cuadro bt

Revision ID: o1p2q3r4s5t6
Revises: n0o1p2q3r4s5
Create Date: 2026-04-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'o1p2q3r4s5t6'
down_revision = 'n0o1p2q3r4s5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ct_cuadro_bt',
        sa.Column('id',         sa.Integer(),    primary_key=True),
        sa.Column('tenant_id',  sa.Integer(),    nullable=False),
        sa.Column('empresa_id', sa.Integer(),    nullable=False),
        sa.Column('id_ct',      sa.String(),     nullable=False),
        sa.Column('nudo_baja',  sa.String(),     nullable=True),
        sa.Column('embarrado',  sa.String(),     nullable=True),
        sa.Column('linea_bt',   sa.String(),     nullable=False),
        sa.Column('num_cups',   sa.Integer(),    nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(),   nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(),   nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('tenant_id', 'empresa_id', 'id_ct', 'linea_bt', name='uq_ct_cuadro_bt_tenant_empresa_ct_linea'),
    )
    op.create_index('ix_ct_cuadro_bt_tenant_id',  'ct_cuadro_bt', ['tenant_id'])
    op.create_index('ix_ct_cuadro_bt_empresa_id', 'ct_cuadro_bt', ['empresa_id'])
    op.create_index('ix_ct_cuadro_bt_id_ct',      'ct_cuadro_bt', ['id_ct'])


def downgrade() -> None:
    op.drop_table('ct_cuadro_bt')