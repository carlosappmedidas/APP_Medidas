"""ERP Módulo 1: catálogos compartidos (tarifa, tarifa_periodo, comercializadora)

Revision ID: c4f5a6b7d8e9
Revises: a7b1c2d3e4f5
Create Date: 2026-06-16

Catálogos COMPARTIDOS (sin tenant_id/empresa_id). Solo tablas erp_*.
Ver ERP_APP_Medidas_Diseno.md §8.1 / §8.2 / §6ter.4.
"""
from alembic import op
import sqlalchemy as sa

revision = "c4f5a6b7d8e9"
down_revision = "a7b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "erp_tarifa",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("codigo", sa.String(length=10), nullable=False),
        sa.Column("descripcion", sa.String(length=255), nullable=False),
        sa.Column("codigo_ree", sa.String(length=10), nullable=True),
        sa.Column("nivel_tension", sa.String(length=2), nullable=False),
        sa.Column("num_periodos_energia", sa.Integer(), nullable=False),
        sa.Column("num_periodos_potencia", sa.Integer(), nullable=False),
        sa.Column("referencia_normativa", sa.String(length=255), nullable=True),
        sa.Column("vigencia_desde", sa.Date(), nullable=True),
        sa.Column("vigencia_hasta", sa.Date(), nullable=True),
        sa.Column("orden", sa.Integer(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_erp_tarifa_codigo", "erp_tarifa", ["codigo"], unique=True)
    op.create_index("ix_erp_tarifa_codigo_ree", "erp_tarifa", ["codigo_ree"])

    op.create_table(
        "erp_tarifa_periodo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tarifa_id", sa.Integer(), nullable=False),
        sa.Column("periodo", sa.String(length=2), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column("descripcion", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tarifa_id"], ["erp_tarifa.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tarifa_id", "periodo", "tipo", name="uq_erp_tarifa_periodo"),
    )
    op.create_index("ix_erp_tarifa_periodo_tarifa_id", "erp_tarifa_periodo", ["tarifa_id"])

    op.create_table(
        "erp_comercializadora",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("cif", sa.String(length=20), nullable=False),
        sa.Column("codigo_ree", sa.String(length=10), nullable=False),
        sa.Column("es_cur", sa.Boolean(), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("codigo_ree", name="uq_erp_comercializadora_codigo_ree"),
    )
    op.create_index("ix_erp_comercializadora_cif", "erp_comercializadora", ["cif"])
    op.create_index("ix_erp_comercializadora_codigo_ree", "erp_comercializadora", ["codigo_ree"])


def downgrade():
    op.drop_table("erp_tarifa_periodo")
    op.drop_table("erp_comercializadora")
    op.drop_table("erp_tarifa")
