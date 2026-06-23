"""ERP Modulo 2: catalogos de normativa CNMC (tipo_punto_medida, propiedad_aparato, telegestion)

Revision ID: erp_m2_cat_cnmc
Revises: erp_m1_migracion
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m2_cat_cnmc"
down_revision = "erp_m1_migracion"
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
    _crear_catalogo("erp_cnmc_tipo_punto_medida", 2)
    _crear_catalogo("erp_cnmc_propiedad_aparato", 2)
    _crear_catalogo("erp_cnmc_telegestion", 2)


def downgrade():
    for nombre in (
        "erp_cnmc_telegestion",
        "erp_cnmc_propiedad_aparato",
        "erp_cnmc_tipo_punto_medida",
    ):
        op.drop_index(f"ix_{nombre}_codigo", table_name=nombre)
        op.drop_table(nombre)
