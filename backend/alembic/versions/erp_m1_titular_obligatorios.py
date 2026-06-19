"""ERP M1: titular - tipo_identificador/identificador NOT NULL + CHECK nombre segun tipo_persona + unique (empresa_id, identificador)

Revision ID: erp_m1_titular_obligatorios
Revises: erp_m1_contrato_comer_empresa
Create Date: 2026-06-18
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_titular_obligatorios"
down_revision = "erp_m1_contrato_comer_empresa"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("erp_titular", "tipo_identificador", existing_type=sa.String(2), nullable=False)
    op.alter_column("erp_titular", "identificador", existing_type=sa.String(14), nullable=False)
    op.create_unique_constraint(
        "uq_erp_titular_empresa_identificador",
        "erp_titular",
        ["empresa_id", "identificador"],
    )
    op.create_check_constraint(
        "ck_erp_titular_nombre_segun_tipo",
        "erp_titular",
        "(tipo_persona = 'fisica' AND nombre_de_pila IS NOT NULL AND primer_apellido IS NOT NULL) "
        "OR (tipo_persona = 'juridica' AND razon_social IS NOT NULL)",
    )


def downgrade():
    op.drop_constraint("ck_erp_titular_nombre_segun_tipo", "erp_titular", type_="check")
    op.drop_constraint("uq_erp_titular_empresa_identificador", "erp_titular", type_="unique")
    op.alter_column("erp_titular", "identificador", existing_type=sa.String(14), nullable=True)
    op.alter_column("erp_titular", "tipo_identificador", existing_type=sa.String(2), nullable=True)
