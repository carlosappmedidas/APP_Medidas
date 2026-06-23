"""ERP Modulo 2: erp_equipo_medida (E-7a, contador/aparato)

Revision ID: erp_m2_equipo_medida
Revises: erp_m2_cat_cnmc
Create Date: 2026-06-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "erp_m2_equipo_medida"
down_revision: Union[str, Sequence[str], None] = "erp_m2_cat_cnmc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "erp_equipo_medida",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("numero_serie", sa.String(length=40), nullable=False),
        sa.Column("tipo_equipo", sa.String(length=20), server_default="contador", nullable=False),
        sa.Column("fabricante", sa.String(length=120), nullable=True),
        sa.Column("modelo", sa.String(length=120), nullable=True),
        sa.Column("version_firmware", sa.String(length=60), nullable=True),
        sa.Column("anio_fabricacion", sa.Integer(), nullable=True),
        sa.Column("tipo_telegestion", sa.String(length=2), nullable=True),
        sa.Column("propiedad", sa.String(length=2), nullable=True),
        sa.Column("propiedad_icp", sa.String(length=2), nullable=True),
        sa.Column("modo_control_potencia", sa.String(length=20), nullable=True),
        sa.Column("fecha_verificacion", sa.Date(), nullable=True),
        sa.Column("fecha_caducidad_verificacion", sa.Date(), nullable=True),
        sa.Column("estado", sa.String(length=20), server_default="en_almacen", nullable=False),
        sa.Column("suministro_id", sa.Integer(), nullable=True),
        sa.Column("baja_fecha", sa.Date(), nullable=True),
        sa.Column("baja_motivo", sa.Text(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["suministro_id"], ["erp_suministro.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", "numero_serie", name="uq_equipo_empresa_numserie"),
    )
    op.create_index("ix_erp_equipo_medida_numero_serie", "erp_equipo_medida", ["numero_serie"])
    op.create_index("ix_erp_equipo_medida_empresa_id", "erp_equipo_medida", ["empresa_id"])
    op.create_index("ix_erp_equipo_medida_tenant_id", "erp_equipo_medida", ["tenant_id"])
    op.create_index("ix_erp_equipo_medida_suministro_id", "erp_equipo_medida", ["suministro_id"])


def downgrade() -> None:
    op.drop_index("ix_erp_equipo_medida_suministro_id", table_name="erp_equipo_medida")
    op.drop_index("ix_erp_equipo_medida_tenant_id", table_name="erp_equipo_medida")
    op.drop_index("ix_erp_equipo_medida_empresa_id", table_name="erp_equipo_medida")
    op.drop_index("ix_erp_equipo_medida_numero_serie", table_name="erp_equipo_medida")
    op.drop_table("erp_equipo_medida")
