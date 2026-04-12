"""add ct_celda

Revision ID: j6k7l8m9n0o1
Revises: i5j6k7l8m9n0
Create Date: 2026-04-12 17:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'j6k7l8m9n0o1'
down_revision = 'i5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ct_celda',
        sa.Column('id',               sa.Integer(),    nullable=False),
        sa.Column('tenant_id',        sa.Integer(),    nullable=False),
        sa.Column('empresa_id',       sa.Integer(),    nullable=False),
        sa.Column('id_ct',            sa.String(),     nullable=False),
        sa.Column('id_celda',         sa.String(),     nullable=False),
        sa.Column('id_transformador', sa.String(),     nullable=True),
        sa.Column('cini',             sa.String(),     nullable=True),
        sa.Column('posicion',         sa.Integer(),    nullable=True),
        sa.Column('en_servicio',      sa.Integer(),    nullable=True),
        sa.Column('anio_instalacion', sa.Integer(),    nullable=True),
        sa.Column('created_at',       sa.DateTime(),   nullable=True),
        sa.Column('updated_at',       sa.DateTime(),   nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'empresa_id', 'id_celda',
                            name='uq_ct_celda_tenant_empresa_celda'),
    )
    op.create_index('ix_ct_celda_tenant_id',  'ct_celda', ['tenant_id'],  unique=False)
    op.create_index('ix_ct_celda_empresa_id', 'ct_celda', ['empresa_id'], unique=False)
    op.create_index('ix_ct_celda_id_ct',      'ct_celda', ['id_ct'],      unique=False)
    op.create_index('ix_ct_celda_id_celda',   'ct_celda', ['id_celda'],   unique=False)


def downgrade() -> None:
    op.drop_index('ix_ct_celda_id_celda',   table_name='ct_celda')
    op.drop_index('ix_ct_celda_id_ct',      table_name='ct_celda')
    op.drop_index('ix_ct_celda_empresa_id', table_name='ct_celda')
    op.drop_index('ix_ct_celda_tenant_id',  table_name='ct_celda')
    op.drop_table('ct_celda')
