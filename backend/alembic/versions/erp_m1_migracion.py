"""ERP Módulo 1: erp_migracion (estado de migración por empresa, E-12 fase corrección)

Revision ID: erp_m1_migracion
Revises: erp_m1_com_cnmc_oblig_uq
Create Date: 2026-06-22

Tabla de estado de la migración (carga masiva inicial) de una empresa.
Una fila por empresa (UQ empresa_id). estado: 'en_curso' | 'cerrada'.
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_migracion"
down_revision = "erp_m1_com_cnmc_oblig_uq"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "erp_migracion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="en_curso"),
        sa.Column("fecha_inicio", sa.Date(), nullable=True),
        sa.Column("fecha_cierre", sa.Date(), nullable=True),
        sa.Column("usuario_inicio_id", sa.Integer(), nullable=True),
        sa.Column("usuario_cierre_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", name="uq_erp_migracion_empresa"),
    )
    op.create_index("ix_erp_migracion_tenant_id", "erp_migracion", ["tenant_id"])
    op.create_index("ix_erp_migracion_empresa_id", "erp_migracion", ["empresa_id"])


def downgrade():
    op.drop_index("ix_erp_migracion_empresa_id", table_name="erp_migracion")
    op.drop_index("ix_erp_migracion_tenant_id", table_name="erp_migracion")
    op.drop_table("erp_migracion")
