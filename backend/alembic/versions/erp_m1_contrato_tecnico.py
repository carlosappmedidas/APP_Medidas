"""ERP M1: contrato datos tecnicos

- erp_contrato: +tipo_punto_medida +tension_v +vivienda_habitual; -suministro_minimo_vital -tipo_vivienda
- erp_suministro: -tension_normalizada -tension_v (la tension pasa al contrato)
- erp_titular: -vivienda_habitual (pasa al contrato)

Revision ID: erp_m1_contrato_tecnico
Revises: erp_m1_comercializadora_empresa
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_contrato_tecnico"
down_revision = "erp_m1_comercializadora_empresa"
branch_labels = None
depends_on = None


def upgrade():
    # erp_contrato: nuevos campos tecnicos
    op.add_column("erp_contrato", sa.Column("tipo_punto_medida", sa.Integer(), nullable=True))
    op.add_column("erp_contrato", sa.Column("tension_v", sa.Integer(), nullable=True))
    op.add_column("erp_contrato", sa.Column("vivienda_habitual", sa.Boolean(), nullable=True))
    # erp_contrato: quitar redundantes
    op.drop_column("erp_contrato", "suministro_minimo_vital")
    op.drop_column("erp_contrato", "tipo_vivienda")
    # erp_suministro: la tension pasa a vivir en el contrato
    op.drop_column("erp_suministro", "tension_normalizada")
    op.drop_column("erp_suministro", "tension_v")
    # erp_titular: vivienda_habitual pasa al contrato
    op.drop_column("erp_titular", "vivienda_habitual")


def downgrade():
    op.add_column("erp_titular", sa.Column("vivienda_habitual", sa.Boolean(), nullable=True))
    op.add_column("erp_suministro", sa.Column("tension_v", sa.Integer(), nullable=True))
    op.add_column("erp_suministro", sa.Column("tension_normalizada", sa.String(length=50), nullable=True))
    op.add_column("erp_contrato", sa.Column("tipo_vivienda", sa.String(length=20), nullable=True))
    op.add_column("erp_contrato", sa.Column("suministro_minimo_vital", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.drop_column("erp_contrato", "vivienda_habitual")
    op.drop_column("erp_contrato", "tension_v")
    op.drop_column("erp_contrato", "tipo_punto_medida")
