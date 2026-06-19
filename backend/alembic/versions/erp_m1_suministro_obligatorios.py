"""ERP M1: suministro - dir + potencias NOT NULL, dir_pais default Espana, drop codigo_fases

Revision ID: erp_m1_suministro_obligatorios
Revises: erp_m1_titular_obligatorios
Create Date: 2026-06-19
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_suministro_obligatorios"
down_revision = "erp_m1_titular_obligatorios"
branch_labels = None
depends_on = None


def upgrade():
    # dir_pais: default 'Espana' (server_default) y NOT NULL
    op.alter_column(
        "erp_suministro", "dir_pais",
        existing_type=sa.String(120),
        server_default="España",
        nullable=False,
    )
    # Resto de dirección obligatoria -> NOT NULL
    op.alter_column("erp_suministro", "dir_tipo_via", existing_type=sa.String(2), nullable=False)
    op.alter_column("erp_suministro", "dir_via", existing_type=sa.String(30), nullable=False)
    op.alter_column("erp_suministro", "dir_numero", existing_type=sa.String(5), nullable=False)
    op.alter_column("erp_suministro", "dir_cp", existing_type=sa.String(10), nullable=False)
    op.alter_column("erp_suministro", "dir_municipio", existing_type=sa.String(120), nullable=False)
    op.alter_column("erp_suministro", "dir_poblacion", existing_type=sa.String(120), nullable=False)
    op.alter_column("erp_suministro", "dir_provincia", existing_type=sa.String(120), nullable=False)
    op.alter_column("erp_suministro", "municipio_codigo_ine", existing_type=sa.String(10), nullable=False)
    # Potencias obligatorias -> NOT NULL
    op.alter_column("erp_suministro", "pot_max_admisible_cie_kw", existing_type=sa.Float(), nullable=False)
    op.alter_column("erp_suministro", "potencia_adscrita_kw", existing_type=sa.Float(), nullable=False)
    # codigo_fases -> se traslada a equipos de medida (Modulo 2)
    op.drop_column("erp_suministro", "codigo_fases")


def downgrade():
    op.add_column("erp_suministro", sa.Column("codigo_fases", sa.String(1), nullable=True))
    op.alter_column("erp_suministro", "potencia_adscrita_kw", existing_type=sa.Float(), nullable=True)
    op.alter_column("erp_suministro", "pot_max_admisible_cie_kw", existing_type=sa.Float(), nullable=True)
    op.alter_column("erp_suministro", "municipio_codigo_ine", existing_type=sa.String(10), nullable=True)
    op.alter_column("erp_suministro", "dir_provincia", existing_type=sa.String(120), nullable=True)
    op.alter_column("erp_suministro", "dir_poblacion", existing_type=sa.String(120), nullable=True)
    op.alter_column("erp_suministro", "dir_municipio", existing_type=sa.String(120), nullable=True)
    op.alter_column("erp_suministro", "dir_cp", existing_type=sa.String(10), nullable=True)
    op.alter_column("erp_suministro", "dir_numero", existing_type=sa.String(5), nullable=True)
    op.alter_column("erp_suministro", "dir_via", existing_type=sa.String(30), nullable=True)
    op.alter_column("erp_suministro", "dir_tipo_via", existing_type=sa.String(2), nullable=True)
    op.alter_column(
        "erp_suministro", "dir_pais",
        existing_type=sa.String(120),
        server_default=None,
        nullable=True,
    )
