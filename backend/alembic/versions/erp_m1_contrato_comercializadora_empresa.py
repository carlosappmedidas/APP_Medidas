"""ERP M1: contrato.comercializadora_id (catalogo global) -> comercializadora_empresa_id (relacion por empresa)

El contrato pasa a referenciar la comercializadora DADA DE ALTA en la empresa
(erp_comercializadora_empresa), no el catalogo global (erp_comercializadora).

Revision ID: erp_m1_contrato_comer_empresa
Revises: erp_m1_contrato_autoconsumo_len
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_contrato_comer_empresa"
down_revision = "erp_m1_contrato_autoconsumo_len"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("erp_contrato", "comercializadora_id")
    op.add_column(
        "erp_contrato",
        sa.Column("comercializadora_empresa_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_erp_contrato_comercializadora_empresa",
        "erp_contrato", "erp_comercializadora_empresa",
        ["comercializadora_empresa_id"], ["id"],
    )


def downgrade():
    op.drop_constraint(
        "fk_erp_contrato_comercializadora_empresa", "erp_contrato", type_="foreignkey"
    )
    op.drop_column("erp_contrato", "comercializadora_empresa_id")
    op.add_column(
        "erp_contrato",
        sa.Column("comercializadora_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "erp_contrato_comercializadora_id_fkey",
        "erp_contrato", "erp_comercializadora",
        ["comercializadora_id"], ["id"],
    )
