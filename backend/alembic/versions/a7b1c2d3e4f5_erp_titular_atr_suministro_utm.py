"""ERP Módulo 1: titular nombre/identificador (ATR) + UTM y campos suministro

Revision ID: a7b1c2d3e4f5
Revises: 417e9023de3f
Create Date: 2026-06-15

Solo tablas erp_*. Ver ERP_APP_Medidas_Diseno.md §7.7.
"""
from alembic import op
import sqlalchemy as sa

revision = "a7b1c2d3e4f5"
down_revision = "417e9023de3f"
branch_labels = None
depends_on = None


def upgrade():
    # --- erp_titular ---
    op.alter_column("erp_titular", "nif_cif", new_column_name="identificador")
    op.drop_column("erp_titular", "ref_catastral")
    op.add_column("erp_titular", sa.Column("tipo_identificador", sa.String(length=2), nullable=True))
    op.add_column("erp_titular", sa.Column("nombre_de_pila", sa.String(length=120), nullable=True))
    op.add_column("erp_titular", sa.Column("primer_apellido", sa.String(length=120), nullable=True))
    op.add_column("erp_titular", sa.Column("segundo_apellido", sa.String(length=120), nullable=True))
    op.add_column("erp_titular", sa.Column("razon_social", sa.String(length=255), nullable=True))
    op.alter_column("erp_titular", "nombre", existing_type=sa.String(length=255), nullable=True)

    # --- erp_suministro ---
    op.add_column("erp_suministro", sa.Column("utm_x", sa.Float(), nullable=True))
    op.add_column("erp_suministro", sa.Column("utm_y", sa.Float(), nullable=True))
    op.add_column("erp_suministro", sa.Column("utm_huso", sa.Integer(), nullable=True))
    op.add_column("erp_suministro", sa.Column("utm_banda", sa.String(length=1), nullable=True))
    op.add_column("erp_suministro", sa.Column("potencia_convenio_kw", sa.Float(), nullable=True))
    op.add_column("erp_suministro", sa.Column("criterio_regulatorio", sa.String(length=50), nullable=True))


def downgrade():
    # --- erp_suministro ---
    op.drop_column("erp_suministro", "criterio_regulatorio")
    op.drop_column("erp_suministro", "potencia_convenio_kw")
    op.drop_column("erp_suministro", "utm_banda")
    op.drop_column("erp_suministro", "utm_huso")
    op.drop_column("erp_suministro", "utm_y")
    op.drop_column("erp_suministro", "utm_x")

    # --- erp_titular ---
    op.alter_column("erp_titular", "nombre", existing_type=sa.String(length=255), nullable=False)
    op.drop_column("erp_titular", "razon_social")
    op.drop_column("erp_titular", "segundo_apellido")
    op.drop_column("erp_titular", "primer_apellido")
    op.drop_column("erp_titular", "nombre_de_pila")
    op.add_column("erp_titular", sa.Column("ref_catastral", sa.String(length=30), nullable=True))
    op.alter_column("erp_titular", "identificador", new_column_name="nif_cif")
