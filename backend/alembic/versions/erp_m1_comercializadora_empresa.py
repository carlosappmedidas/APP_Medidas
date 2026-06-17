"""ERP M1: erp_comercializadora_empresa (relacion por empresa con comercializadora del catalogo)

Revision ID: erp_m1_comercializadora_empresa
Revises: erp_m1_suministro_direccion
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_comercializadora_empresa"
down_revision = "erp_m1_suministro_direccion"
branch_labels = None
depends_on = None

_T = "erp_comercializadora_empresa"


def upgrade():
    op.create_table(
        _T,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("comercializadora_id", sa.Integer(), nullable=False),
        sa.Column("direccion", sa.String(length=255), nullable=True),
        sa.Column("tipo_pago", sa.String(length=120), nullable=True),
        sa.Column("datos_acceso_p0", sa.Text(), nullable=True),
        sa.Column("fecha_alta_erp", sa.Date(), nullable=True),
        sa.Column("fecha_baja_erp", sa.Date(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["comercializadora_id"], ["erp_comercializadora.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", "comercializadora_id", name="uq_erp_com_empresa_comercializadora"),
    )
    op.create_index(f"ix_{_T}_tenant_id", _T, ["tenant_id"])
    op.create_index(f"ix_{_T}_empresa_id", _T, ["empresa_id"])
    op.create_index(f"ix_{_T}_comercializadora_id", _T, ["comercializadora_id"])


def downgrade():
    op.drop_index(f"ix_{_T}_comercializadora_id", table_name=_T)
    op.drop_index(f"ix_{_T}_empresa_id", table_name=_T)
    op.drop_index(f"ix_{_T}_tenant_id", table_name=_T)
    op.drop_table(_T)
