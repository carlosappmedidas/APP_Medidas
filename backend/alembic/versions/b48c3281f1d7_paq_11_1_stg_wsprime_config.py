"""Paq 11-1 stg_wsprime_config

Revision ID: b48c3281f1d7
Revises: 561770bd31c9
Create Date: 2026-06-13 21:40:30.702879

"""
# pyright: reportArgumentType=false, reportGeneralTypeIssues=false
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b48c3281f1d7'
down_revision: Union[str, Sequence[str], None] = '561770bd31c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — Paq 11-1: crea tabla stg_wsprime_config."""
    op.create_table(
        'stg_wsprime_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('empresa_id', sa.Integer(), nullable=False),
        sa.Column('concentrador_id', sa.Integer(), nullable=False),
        sa.Column('fabricante', sa.String(length=20), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('usuario', sa.String(length=100), nullable=False),
        sa.Column('password_cifrado', sa.Text(), nullable=False),
        sa.Column('timeout_segundos', sa.Integer(), nullable=False),
        sa.Column('verify_ssl', sa.Boolean(), nullable=False),
        sa.Column('activo', sa.Boolean(), nullable=False),
        sa.Column('ultima_conexion_at', sa.DateTime(), nullable=True),
        sa.Column('ultima_conexion_ok', sa.Boolean(), nullable=True),
        sa.Column('ultima_conexion_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ['concentrador_id'], ['stg_concentrador.id'], ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'concentrador_id', name='uq_stg_wsprime_config_concentrador',
        ),
    )
    op.create_index(
        op.f('ix_stg_wsprime_config_concentrador_id'),
        'stg_wsprime_config', ['concentrador_id'], unique=False,
    )
    op.create_index(
        op.f('ix_stg_wsprime_config_empresa_id'),
        'stg_wsprime_config', ['empresa_id'], unique=False,
    )
    op.create_index(
        op.f('ix_stg_wsprime_config_tenant_id'),
        'stg_wsprime_config', ['tenant_id'], unique=False,
    )


def downgrade() -> None:
    """Downgrade schema — Paq 11-1: elimina tabla stg_wsprime_config."""
    op.drop_index(
        op.f('ix_stg_wsprime_config_tenant_id'),
        table_name='stg_wsprime_config',
    )
    op.drop_index(
        op.f('ix_stg_wsprime_config_empresa_id'),
        table_name='stg_wsprime_config',
    )
    op.drop_index(
        op.f('ix_stg_wsprime_config_concentrador_id'),
        table_name='stg_wsprime_config',
    )
    op.drop_table('stg_wsprime_config')