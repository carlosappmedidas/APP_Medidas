"""add objeciones_reob_generados

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'p2q3r4s5t6u7'
down_revision = 'o1p2q3r4s5t6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'objeciones_reob_generados',
        sa.Column('id',              sa.Integer(),     nullable=False, primary_key=True),
        sa.Column('tenant_id',       sa.Integer(),     nullable=False),
        sa.Column('empresa_id',      sa.Integer(),     nullable=False),
        sa.Column('tipo',            sa.String(10),    nullable=False),
        sa.Column('nombre_fichero_aob',  sa.String(200), nullable=False),
        sa.Column('nombre_fichero_reob', sa.String(200), nullable=False),
        sa.Column('comercializadora',    sa.String(10),  nullable=True),
        sa.Column('aaaamm',              sa.String(6),   nullable=True),
        sa.Column('num_registros',       sa.Integer(),   nullable=True),
        sa.Column('generado_at',             sa.DateTime(), nullable=True),
        sa.Column('descargado_at',           sa.DateTime(), nullable=True),
        sa.Column('enviado_sftp_at',         sa.DateTime(), nullable=True),
        sa.Column('config_sftp_id',          sa.Integer(),  nullable=True),
        sa.Column('enviado_comunicaciones_at', sa.DateTime(), nullable=True),
        sa.Column('created_at',  sa.DateTime(), nullable=True),
        sa.Column('updated_at',  sa.DateTime(), nullable=True),
    )
    op.create_index('ix_reob_generados_tenant_empresa', 'objeciones_reob_generados', ['tenant_id', 'empresa_id'])
    op.create_index('ix_reob_generados_tipo_aob', 'objeciones_reob_generados', ['tipo', 'nombre_fichero_aob'])


def downgrade() -> None:
    op.drop_table('objeciones_reob_generados')