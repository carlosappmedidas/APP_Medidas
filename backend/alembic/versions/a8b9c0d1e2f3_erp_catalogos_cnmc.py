"""ERP Modulo 1: catalogos de normativa CNMC (tipo_via, piso, puerta, aclarador_finca)

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def _crear_catalogo(nombre: str, len_codigo: int) -> None:
    op.create_table(
        nombre,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("codigo", sa.String(length=len_codigo), nullable=False),
        sa.Column("descripcion", sa.String(length=120), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("fecha_baja", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(f"ix_{nombre}_codigo", nombre, ["codigo"], unique=True)


def upgrade():
    _crear_catalogo("erp_cnmc_tipo_via", 2)
    _crear_catalogo("erp_cnmc_piso", 3)
    _crear_catalogo("erp_cnmc_puerta", 3)
    _crear_catalogo("erp_cnmc_aclarador_finca", 2)


def downgrade():
    for nombre in (
        "erp_cnmc_aclarador_finca",
        "erp_cnmc_puerta",
        "erp_cnmc_piso",
        "erp_cnmc_tipo_via",
    ):
        op.drop_index(f"ix_{nombre}_codigo", table_name=nombre)
        op.drop_table(nombre)
