"""ERP Modulo 2: erp_almacen (E-7c, stock no instalado)

Revision ID: erp_m2_almacen
Revises: erp_m2_instalacion
Create Date: 2026-06-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "erp_m2_almacen"
down_revision: Union[str, Sequence[str], None] = "erp_m2_instalacion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "erp_almacen",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("equipo_id", sa.Integer(), nullable=False),
        sa.Column("ubicacion", sa.String(length=160), nullable=True),
        sa.Column("lote_compra", sa.String(length=120), nullable=True),
        sa.Column("albaran_proveedor", sa.String(length=120), nullable=True),
        sa.Column("proveedor", sa.String(length=160), nullable=True),
        sa.Column("estado_equipo_en_almacen", sa.String(length=30), server_default="nuevo", nullable=False),
        sa.Column("fecha_garantia", sa.Date(), nullable=True),
        sa.Column("fecha_entrada", sa.Date(), nullable=True),
        sa.Column("fecha_salida", sa.Date(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["equipo_id"], ["erp_equipo_medida.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_erp_almacen_equipo_id", "erp_almacen", ["equipo_id"])
    op.create_index("ix_erp_almacen_empresa_id", "erp_almacen", ["empresa_id"])
    op.create_index("ix_erp_almacen_tenant_id", "erp_almacen", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_erp_almacen_tenant_id", table_name="erp_almacen")
    op.drop_index("ix_erp_almacen_empresa_id", table_name="erp_almacen")
    op.drop_index("ix_erp_almacen_equipo_id", table_name="erp_almacen")
    op.drop_table("erp_almacen")
