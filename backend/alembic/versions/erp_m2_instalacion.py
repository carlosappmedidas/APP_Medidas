"""ERP Modulo 2: erp_instalacion (E-7b, historico contador<->CUPS)

Revision ID: erp_m2_instalacion
Revises: erp_m2_equipo_medida
Create Date: 2026-06-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "erp_m2_instalacion"
down_revision: Union[str, Sequence[str], None] = "erp_m2_equipo_medida"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "erp_instalacion",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("equipo_id", sa.Integer(), nullable=False),
        sa.Column("suministro_id", sa.Integer(), nullable=False),
        sa.Column("tipo_movimiento", sa.String(length=20), server_default="instalacion", nullable=False),
        sa.Column("equipo_sustituido_id", sa.Integer(), nullable=True),
        sa.Column("fecha_alta", sa.Date(), nullable=True),
        sa.Column("fecha_baja", sa.Date(), nullable=True),
        sa.Column("lectura_instalacion", sa.Float(), nullable=True),
        sa.Column("lectura_retirada", sa.Float(), nullable=True),
        sa.Column("tecnico", sa.String(length=120), nullable=True),
        sa.Column("precintos", sa.Text(), nullable=True),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("motivo_baja", sa.Text(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["equipo_id"], ["erp_equipo_medida.id"]),
        sa.ForeignKeyConstraint(["equipo_sustituido_id"], ["erp_equipo_medida.id"]),
        sa.ForeignKeyConstraint(["suministro_id"], ["erp_suministro.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_erp_instalacion_equipo_id", "erp_instalacion", ["equipo_id"])
    op.create_index("ix_erp_instalacion_suministro_id", "erp_instalacion", ["suministro_id"])
    op.create_index("ix_erp_instalacion_empresa_id", "erp_instalacion", ["empresa_id"])
    op.create_index("ix_erp_instalacion_tenant_id", "erp_instalacion", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_erp_instalacion_tenant_id", table_name="erp_instalacion")
    op.drop_index("ix_erp_instalacion_empresa_id", table_name="erp_instalacion")
    op.drop_index("ix_erp_instalacion_suministro_id", table_name="erp_instalacion")
    op.drop_index("ix_erp_instalacion_equipo_id", table_name="erp_instalacion")
    op.drop_table("erp_instalacion")
