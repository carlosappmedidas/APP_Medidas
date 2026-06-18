"""ERP M1: erp_contrato_version (historico de modificaciones) + erp_contrato.exencion_iese

Revision ID: erp_m1_contrato_version
Revises: erp_m1_contrato_drop_auto_col
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "erp_m1_contrato_version"
down_revision = "erp_m1_contrato_drop_auto_col"
branch_labels = None
depends_on = None

_T = "erp_contrato_version"


def upgrade():
    # 1) Nueva columna en erp_contrato: exencion_iese (NOT NULL, backfill a False)
    op.add_column(
        "erp_contrato",
        sa.Column("exencion_iese", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("erp_contrato", "exencion_iese", server_default=None)

    # 2) Tabla de versiones del contrato (foto + diff por version)
    op.create_table(
        _T,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("contrato_id", sa.Integer(), nullable=False),
        sa.Column("suministro_id", sa.Integer(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("tipo_atr", sa.String(length=10), nullable=True),
        sa.Column("motivo", sa.String(length=255), nullable=True),
        sa.Column("referencia", sa.String(length=80), nullable=True),
        sa.Column("fecha_alta", sa.Date(), nullable=True),
        sa.Column("fecha_baja", sa.Date(), nullable=True),
        sa.Column("fecha_modificacion", sa.Date(), nullable=True),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("cambios", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["contrato_id"], ["erp_contrato.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["suministro_id"], ["erp_suministro.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contrato_id", "version", name="uq_erp_contrato_version"),
    )
    op.create_index(f"ix_{_T}_tenant_id", _T, ["tenant_id"])
    op.create_index(f"ix_{_T}_empresa_id", _T, ["empresa_id"])
    op.create_index(f"ix_{_T}_contrato_id", _T, ["contrato_id"])
    op.create_index(f"ix_{_T}_suministro_id", _T, ["suministro_id"])


def downgrade():
    op.drop_index(f"ix_{_T}_suministro_id", table_name=_T)
    op.drop_index(f"ix_{_T}_contrato_id", table_name=_T)
    op.drop_index(f"ix_{_T}_empresa_id", table_name=_T)
    op.drop_index(f"ix_{_T}_tenant_id", table_name=_T)
    op.drop_table(_T)
    op.drop_column("erp_contrato", "exencion_iese")
