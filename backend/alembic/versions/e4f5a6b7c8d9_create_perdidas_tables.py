"""create_perdidas_tables

Revision ID: e4f5a6b7c8d9
Revises: d4e5f6a7b8c9
Create Date: 2026-04-09

Crea las tablas del módulo de pérdidas por transformación:
  - concentrador      → configuración de concentradores/CTs por empresa
  - perdida_diaria    → resultados de pérdidas calculadas por día y concentrador
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = 'e4f5a6b7c8d9'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:

    # ── Tabla concentrador ────────────────────────────────────────────────────
    op.create_table(
        'concentrador',
        sa.Column('id',                 sa.Integer(),     nullable=False),
        sa.Column('tenant_id',          sa.Integer(),     nullable=False),
        sa.Column('empresa_id',         sa.Integer(),     nullable=False),
        sa.Column('nombre_ct',          sa.String(),      nullable=False),
        sa.Column('id_concentrador',    sa.String(),      nullable=False),   # ej: CIR4622509200
        sa.Column('id_supervisor',      sa.String(),      nullable=True),    # ej: CIR2082514122
        sa.Column('magn_supervisor',    sa.Integer(),     nullable=False, server_default='1000'),
        sa.Column('directorio_ftp',     sa.String(),      nullable=True),    # ej: /202604/
        sa.Column('ftp_config_id',      sa.Integer(),     nullable=True),    # FK a ftp_configs
        sa.Column('fecha_ultimo_proceso', sa.Date(),      nullable=True),
        sa.Column('activo',             sa.Boolean(),     nullable=False, server_default='true'),
        sa.Column('created_at',         sa.DateTime(),    nullable=False),
        sa.Column('updated_at',         sa.DateTime(),    nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['ftp_config_id'], ['ftp_configs.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_concentrador_tenant_id',    'concentrador', ['tenant_id'])
    op.create_index('ix_concentrador_empresa_id',   'concentrador', ['empresa_id'])
    op.create_index('ix_concentrador_ftp_config_id','concentrador', ['ftp_config_id'])

    # ── Tabla perdida_diaria ──────────────────────────────────────────────────
    op.create_table(
        'perdida_diaria',
        sa.Column('id',                 sa.Integer(),     nullable=False),
        sa.Column('tenant_id',          sa.Integer(),     nullable=False),
        sa.Column('empresa_id',         sa.Integer(),     nullable=False),
        sa.Column('concentrador_id',    sa.Integer(),     nullable=False),
        sa.Column('fecha',              sa.Date(),        nullable=False),
        sa.Column('nombre_fichero_s02', sa.String(),      nullable=True),
        sa.Column('ai_supervisor',      sa.BigInteger(),  nullable=False, server_default='0'),  # Wh
        sa.Column('ae_supervisor',      sa.BigInteger(),  nullable=False, server_default='0'),  # Wh
        sa.Column('ai_clientes',        sa.BigInteger(),  nullable=False, server_default='0'),  # Wh suma
        sa.Column('ae_clientes',        sa.BigInteger(),  nullable=False, server_default='0'),  # Wh suma
        sa.Column('energia_neta_wh',    sa.BigInteger(),  nullable=False, server_default='0'),  # ai_supervisor × magn
        sa.Column('perdida_wh',         sa.BigInteger(),  nullable=False, server_default='0'),
        sa.Column('perdida_pct',        sa.Numeric(8, 4), nullable=True),
        sa.Column('num_contadores',     sa.Integer(),     nullable=False, server_default='0'),
        sa.Column('horas_con_datos',    sa.Integer(),     nullable=False, server_default='0'),  # de 24
        sa.Column('estado',             sa.String(20),    nullable=False, server_default='ok'),  # ok/incompleto/sin_datos
        sa.Column('created_at',         sa.DateTime(),    nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['concentrador_id'], ['concentrador.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('concentrador_id', 'fecha', name='uq_perdida_diaria_concentrador_fecha'),
    )
    op.create_index('ix_perdida_diaria_tenant_id',       'perdida_diaria', ['tenant_id'])
    op.create_index('ix_perdida_diaria_empresa_id',      'perdida_diaria', ['empresa_id'])
    op.create_index('ix_perdida_diaria_concentrador_id', 'perdida_diaria', ['concentrador_id'])
    op.create_index('ix_perdida_diaria_fecha',           'perdida_diaria', ['fecha'])


def downgrade() -> None:
    op.drop_table('perdida_diaria')
    op.drop_table('concentrador')
