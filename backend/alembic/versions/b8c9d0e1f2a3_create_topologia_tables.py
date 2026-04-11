"""create topologia tables

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-04-11

"""
from alembic import op
import sqlalchemy as sa


revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:

    # ── ct_inventario ─────────────────────────────────────────────────────────
    op.create_table(
        'ct_inventario',
        sa.Column('id',               sa.Integer(),     nullable=False),
        sa.Column('tenant_id',        sa.Integer(),     nullable=False),
        sa.Column('empresa_id',       sa.Integer(),     nullable=False),
        sa.Column('id_ct',            sa.String(),      nullable=False),
        sa.Column('nombre',           sa.String(),      nullable=False),
        sa.Column('cini',             sa.String(),      nullable=True),
        sa.Column('codigo_ti',        sa.String(),      nullable=True),
        sa.Column('potencia_kva',     sa.Integer(),     nullable=True),
        sa.Column('tension_kv',       sa.Numeric(6, 3), nullable=True),
        sa.Column('propiedad',        sa.String(1),     nullable=True),
        sa.Column('utm_x',            sa.Float(),       nullable=True),
        sa.Column('utm_y',            sa.Float(),       nullable=True),
        sa.Column('lat',              sa.Float(),       nullable=True),
        sa.Column('lon',              sa.Float(),       nullable=True),
        sa.Column('municipio_ine',    sa.String(),      nullable=True),
        sa.Column('fecha_aps',        sa.Date(),        nullable=True),
        sa.Column('anio_declaracion', sa.Integer(),     nullable=True),
        sa.Column('created_at',       sa.DateTime(),    nullable=False),
        sa.Column('updated_at',       sa.DateTime(),    nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'empresa_id', 'id_ct',
                            name='uq_ct_inventario_tenant_empresa_ct'),
    )
    op.create_index('ix_ct_inventario_tenant_id',  'ct_inventario', ['tenant_id'])
    op.create_index('ix_ct_inventario_empresa_id', 'ct_inventario', ['empresa_id'])
    op.create_index('ix_ct_inventario_id_ct',      'ct_inventario', ['id_ct'])

    # ── ct_transformador ──────────────────────────────────────────────────────
    op.create_table(
        'ct_transformador',
        sa.Column('id',               sa.Integer(),      nullable=False),
        sa.Column('tenant_id',        sa.Integer(),      nullable=False),
        sa.Column('empresa_id',       sa.Integer(),      nullable=False),
        sa.Column('id_ct',            sa.String(),       nullable=False),
        sa.Column('id_transformador', sa.String(),       nullable=False),
        sa.Column('cini',             sa.String(),       nullable=True),
        sa.Column('potencia_kva',     sa.Numeric(10, 3), nullable=True),
        sa.Column('anio_fabricacion', sa.Integer(),      nullable=True),
        sa.Column('en_operacion',     sa.Integer(),      nullable=True),
        sa.Column('created_at',       sa.DateTime(),     nullable=False),
        sa.Column('updated_at',       sa.DateTime(),     nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'empresa_id', 'id_ct', 'id_transformador',
                            name='uq_ct_transformador_tenant_empresa_ct_trf'),
    )
    op.create_index('ix_ct_transformador_tenant_id',  'ct_transformador', ['tenant_id'])
    op.create_index('ix_ct_transformador_empresa_id', 'ct_transformador', ['empresa_id'])
    op.create_index('ix_ct_transformador_id_ct',      'ct_transformador', ['id_ct'])

    # ── cups_topologia ────────────────────────────────────────────────────────
    op.create_table(
        'cups_topologia',
        sa.Column('id',                      sa.Integer(),      nullable=False),
        sa.Column('tenant_id',               sa.Integer(),      nullable=False),
        sa.Column('empresa_id',              sa.Integer(),      nullable=False),
        sa.Column('cups',                    sa.String(),       nullable=False),
        sa.Column('id_ct',                   sa.String(),       nullable=True),
        sa.Column('id_salida',               sa.String(),       nullable=True),
        sa.Column('tarifa',                  sa.String(),       nullable=True),
        sa.Column('tension_kv',              sa.Numeric(6, 3),  nullable=True),
        sa.Column('potencia_contratada_kw',  sa.Numeric(10, 3), nullable=True),
        sa.Column('autoconsumo',             sa.Integer(),      nullable=True),
        sa.Column('telegestado',             sa.Integer(),      nullable=True),
        sa.Column('cini_contador',           sa.String(),       nullable=True),
        sa.Column('utm_x',                   sa.Float(),        nullable=True),
        sa.Column('utm_y',                   sa.Float(),        nullable=True),
        sa.Column('lat',                     sa.Float(),        nullable=True),
        sa.Column('lon',                     sa.Float(),        nullable=True),
        sa.Column('fecha_alta',              sa.Date(),         nullable=True),
        sa.Column('anio_declaracion',        sa.Integer(),      nullable=True),
        sa.Column('created_at',              sa.DateTime(),     nullable=False),
        sa.Column('updated_at',              sa.DateTime(),     nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tenant_id', 'empresa_id', 'cups',
                            name='uq_cups_topologia_tenant_empresa_cups'),
    )
    op.create_index('ix_cups_topologia_tenant_id',  'cups_topologia', ['tenant_id'])
    op.create_index('ix_cups_topologia_empresa_id', 'cups_topologia', ['empresa_id'])
    op.create_index('ix_cups_topologia_cups',       'cups_topologia', ['cups'])
    op.create_index('ix_cups_topologia_id_ct',      'cups_topologia', ['id_ct'])


def downgrade() -> None:
    op.drop_index('ix_cups_topologia_id_ct',      table_name='cups_topologia')
    op.drop_index('ix_cups_topologia_cups',       table_name='cups_topologia')
    op.drop_index('ix_cups_topologia_empresa_id', table_name='cups_topologia')
    op.drop_index('ix_cups_topologia_tenant_id',  table_name='cups_topologia')
    op.drop_table('cups_topologia')

    op.drop_index('ix_ct_transformador_id_ct',      table_name='ct_transformador')
    op.drop_index('ix_ct_transformador_empresa_id', table_name='ct_transformador')
    op.drop_index('ix_ct_transformador_tenant_id',  table_name='ct_transformador')
    op.drop_table('ct_transformador')

    op.drop_index('ix_ct_inventario_id_ct',      table_name='ct_inventario')
    op.drop_index('ix_ct_inventario_empresa_id', table_name='ct_inventario')
    op.drop_index('ix_ct_inventario_tenant_id',  table_name='ct_inventario')
    op.drop_table('ct_inventario')
