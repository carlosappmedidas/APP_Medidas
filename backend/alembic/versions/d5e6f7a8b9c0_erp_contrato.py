"""ERP Módulo 1: erp_contrato + erp_contrato_potencia (E-6b)

Revision ID: d5e6f7a8b9c0
Revises: c4f5a6b7d8e9
Create Date: 2026-06-16

Contrato multi-tenant: FK a titular/suministro/tarifa/comercializadora (sin
duplicar el CUPS) + potencias por periodo. Ver §6ter.3 / §8.2.
"""
from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "c4f5a6b7d8e9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "erp_contrato",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("numero_contrato", sa.String(length=40), nullable=False),
        sa.Column("codigo_interno", sa.String(length=40), nullable=True),
        sa.Column("tipo_contrato_atr", sa.String(length=20), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("fecha_alta", sa.Date(), nullable=True),
        sa.Column("fecha_activacion_prevista", sa.Date(), nullable=True),
        sa.Column("fecha_firma", sa.Date(), nullable=True),
        sa.Column("fecha_baja", sa.Date(), nullable=True),
        sa.Column("fecha_finalizacion", sa.Date(), nullable=True),
        sa.Column("renovacion_automatica", sa.Boolean(), nullable=False),
        sa.Column("titular_id", sa.Integer(), nullable=False),
        sa.Column("pagador_id", sa.Integer(), nullable=True),
        sa.Column("comercializadora_id", sa.Integer(), nullable=True),
        sa.Column("referencia_comercializadora", sa.String(length=120), nullable=True),
        sa.Column("suministro_id", sa.Integer(), nullable=False),
        sa.Column("tarifa_id", sa.Integer(), nullable=False),
        sa.Column("tension_normalizada", sa.String(length=50), nullable=True),
        sa.Column("modo_control_potencia", sa.String(length=20), nullable=True),
        sa.Column("agree_tarifa", sa.Date(), nullable=True),
        sa.Column("agree_dh", sa.Date(), nullable=True),
        sa.Column("agree_tensio", sa.Date(), nullable=True),
        sa.Column("agree_tipus", sa.Date(), nullable=True),
        sa.Column("autoconsumo_tipo", sa.String(length=20), nullable=True),
        sa.Column("es_autoconsumo", sa.Boolean(), nullable=False),
        sa.Column("autoconsumo_colectivo", sa.Boolean(), nullable=False),
        sa.Column("potencia_generacion_kw", sa.Float(), nullable=True),
        sa.Column("bono_social", sa.Boolean(), nullable=False),
        sa.Column("suministro_minimo_vital", sa.Boolean(), nullable=False),
        sa.Column("tipo_vivienda", sa.String(length=20), nullable=True),
        sa.Column("tipo_subseccion", sa.String(length=10), nullable=True),
        sa.Column("peaje_directo", sa.Boolean(), nullable=False),
        sa.Column("telegestion", sa.Boolean(), nullable=False),
        sa.Column("tipo_medida", sa.String(length=20), nullable=True),
        sa.Column("electrointensivo", sa.Boolean(), nullable=False),
        sa.Column("codigo_solicitud_electrointensivo", sa.String(length=50), nullable=True),
        sa.Column("no_cortable", sa.Boolean(), nullable=False),
        sa.Column("art_56", sa.Boolean(), nullable=False),
        sa.Column("art_56_motivo", sa.String(length=255), nullable=True),
        sa.Column("art_56_porcentaje", sa.Float(), nullable=True),
        sa.Column("no_cesion_sips", sa.Boolean(), nullable=False),
        sa.Column("no_cesion_sips_fecha", sa.Date(), nullable=True),
        sa.Column("cie", sa.String(length=40), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["titular_id"], ["erp_titular.id"]),
        sa.ForeignKeyConstraint(["pagador_id"], ["erp_titular.id"]),
        sa.ForeignKeyConstraint(["comercializadora_id"], ["erp_comercializadora.id"]),
        sa.ForeignKeyConstraint(["suministro_id"], ["erp_suministro.id"]),
        sa.ForeignKeyConstraint(["tarifa_id"], ["erp_tarifa.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_erp_contrato_tenant_id", "erp_contrato", ["tenant_id"])
    op.create_index("ix_erp_contrato_empresa_id", "erp_contrato", ["empresa_id"])
    op.create_index("ix_erp_contrato_numero_contrato", "erp_contrato", ["numero_contrato"])
    op.create_index("ix_erp_contrato_titular_id", "erp_contrato", ["titular_id"])
    op.create_index("ix_erp_contrato_suministro_id", "erp_contrato", ["suministro_id"])
    op.create_index("ix_erp_contrato_tarifa_id", "erp_contrato", ["tarifa_id"])

    op.create_table(
        "erp_contrato_potencia",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("contrato_id", sa.Integer(), nullable=False),
        sa.Column("periodo", sa.String(length=2), nullable=False),
        sa.Column("potencia_kw", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["contrato_id"], ["erp_contrato.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contrato_id", "periodo", name="uq_erp_contrato_potencia"),
    )
    op.create_index("ix_erp_contrato_potencia_tenant_id", "erp_contrato_potencia", ["tenant_id"])
    op.create_index("ix_erp_contrato_potencia_empresa_id", "erp_contrato_potencia", ["empresa_id"])
    op.create_index("ix_erp_contrato_potencia_contrato_id", "erp_contrato_potencia", ["contrato_id"])


def downgrade():
    op.drop_table("erp_contrato_potencia")
    op.drop_table("erp_contrato")
