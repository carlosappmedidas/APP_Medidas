"""create_objeciones_automatizacion_tables

Revision ID: q3r4s5t6u7v8
Revises: c7d8e9f0a1b2
Create Date: 2026-04-21

Crea las tablas del submódulo de automatización de objeciones:
  - objeciones_automatizaciones: config por tenant de la automatización
    (activa/desactiva, último run). UNA fila por (tenant_id, tipo).
  - objeciones_alertas: alertas generadas por el job. UNA fila por
    (tenant_id, empresa_id, tipo, periodo) — el UNIQUE evita duplicados
    cuando el cron revisa varios días en la ventana de seguridad.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'q3r4s5t6u7v8'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade() -> None:

    # ── Tabla objeciones_automatizaciones ─────────────────────────────────────
    op.create_table(
        'objeciones_automatizaciones',
        sa.Column('id',             sa.Integer(),  nullable=False),
        sa.Column('tenant_id',      sa.Integer(),  nullable=False),
        sa.Column('tipo',           sa.String(30), nullable=False),
        sa.Column('activa',         sa.Integer(),  nullable=False, server_default='0'),  # 0/1 — semántica bool
        sa.Column('ultimo_run_at',  sa.DateTime(), nullable=True),
        sa.Column('ultimo_run_ok',  sa.Integer(),  nullable=True),                        # 0/1 nullable
        sa.Column('ultimo_run_msg', sa.Text(),     nullable=True),
        sa.Column('created_at',     sa.DateTime(), nullable=False),
        sa.Column('updated_at',     sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.UniqueConstraint('tenant_id', 'tipo', name='uq_objeciones_automatizaciones_tenant_tipo'),
    )
    op.create_index('ix_objeciones_automatizaciones_tenant_id', 'objeciones_automatizaciones', ['tenant_id'])
    op.create_index('ix_objeciones_automatizaciones_tipo',      'objeciones_automatizaciones', ['tipo'])

    # ── Tabla objeciones_alertas ──────────────────────────────────────────────
    op.create_table(
        'objeciones_alertas',
        sa.Column('id',             sa.Integer(),   nullable=False),
        sa.Column('tenant_id',      sa.Integer(),   nullable=False),
        sa.Column('empresa_id',     sa.Integer(),   nullable=False),
        sa.Column('tipo',           sa.String(30),  nullable=False),
        sa.Column('periodo',        sa.String(10),  nullable=False),  # YYYYMM
        sa.Column('fecha_hito',     sa.DateTime(),  nullable=True),
        sa.Column('num_pendientes', sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('detalle_json',   sa.Text(),      nullable=True),
        sa.Column('severidad',      sa.String(20),  nullable=False, server_default='warning'),
        sa.Column('estado',         sa.String(20),  nullable=False, server_default='activa'),
        sa.Column('resuelta_at',    sa.DateTime(),  nullable=True),
        sa.Column('resuelta_by',    sa.Integer(),   nullable=True),
        sa.Column('created_at',     sa.DateTime(),  nullable=False),
        sa.Column('updated_at',     sa.DateTime(),  nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'],  ['tenants.id']),
        sa.ForeignKeyConstraint(['empresa_id'], ['empresas.id']),
        sa.ForeignKeyConstraint(['resuelta_by'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint(
            'tenant_id', 'empresa_id', 'tipo', 'periodo',
            name='uq_objeciones_alertas_empresa_tipo_periodo',
        ),
    )
    op.create_index('ix_objeciones_alertas_tenant_id',     'objeciones_alertas', ['tenant_id'])
    op.create_index('ix_objeciones_alertas_empresa_id',    'objeciones_alertas', ['empresa_id'])
    op.create_index('ix_objeciones_alertas_tipo',          'objeciones_alertas', ['tipo'])
    op.create_index('ix_objeciones_alertas_periodo',       'objeciones_alertas', ['periodo'])
    op.create_index('ix_objeciones_alertas_estado',        'objeciones_alertas', ['estado'])
    op.create_index('ix_objeciones_alertas_tenant_estado', 'objeciones_alertas', ['tenant_id', 'estado'])


def downgrade() -> None:
    # Borrar índices y tabla objeciones_alertas
    op.drop_index('ix_objeciones_alertas_tenant_estado', table_name='objeciones_alertas')
    op.drop_index('ix_objeciones_alertas_estado',        table_name='objeciones_alertas')
    op.drop_index('ix_objeciones_alertas_periodo',       table_name='objeciones_alertas')
    op.drop_index('ix_objeciones_alertas_tipo',          table_name='objeciones_alertas')
    op.drop_index('ix_objeciones_alertas_empresa_id',    table_name='objeciones_alertas')
    op.drop_index('ix_objeciones_alertas_tenant_id',     table_name='objeciones_alertas')
    op.drop_table('objeciones_alertas')

    # Borrar índices y tabla objeciones_automatizaciones
    op.drop_index('ix_objeciones_automatizaciones_tipo',      table_name='objeciones_automatizaciones')
    op.drop_index('ix_objeciones_automatizaciones_tenant_id', table_name='objeciones_automatizaciones')
    op.drop_table('objeciones_automatizaciones')