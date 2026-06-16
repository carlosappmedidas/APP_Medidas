"""erp: titular + suministro

Revision ID: 417e9023de3f
Revises: b48c3281f1d7
Create Date: 2026-06-14 22:42:33.408414

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '417e9023de3f'
down_revision: Union[str, Sequence[str], None] = 'b48c3281f1d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "erp_titular",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("tipo_persona", sa.String(length=20), nullable=False),
        sa.Column("nif_cif", sa.String(length=20), nullable=True),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("dir_tipo_via", sa.String(length=50), nullable=True),
        sa.Column("dir_via", sa.String(length=255), nullable=True),
        sa.Column("dir_numero", sa.String(length=20), nullable=True),
        sa.Column("dir_resto", sa.String(length=255), nullable=True),
        sa.Column("dir_cp", sa.String(length=10), nullable=True),
        sa.Column("dir_municipio", sa.String(length=120), nullable=True),
        sa.Column("dir_provincia", sa.String(length=120), nullable=True),
        sa.Column("dir_pais", sa.String(length=120), nullable=True),
        sa.Column("ref_catastral", sa.String(length=30), nullable=True),
        sa.Column("telefono", sa.String(length=30), nullable=True),
        sa.Column("movil", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("codigo_interno", sa.String(length=50), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_erp_titular_empresa_id", "erp_titular", ["empresa_id"])
    op.create_index("ix_erp_titular_nif_cif", "erp_titular", ["nif_cif"])
    op.create_index("ix_erp_titular_tenant_id", "erp_titular", ["tenant_id"])

    op.create_table(
        "erp_suministro",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("cups", sa.String(length=22), nullable=False),
        sa.Column("distribuidora", sa.String(length=120), nullable=True),
        sa.Column("tipo_punto_medida", sa.Integer(), nullable=True),
        sa.Column("acometida", sa.String(length=255), nullable=True),
        sa.Column("dir_tipo_via", sa.String(length=50), nullable=True),
        sa.Column("dir_via", sa.String(length=255), nullable=True),
        sa.Column("dir_numero", sa.String(length=20), nullable=True),
        sa.Column("dir_resto", sa.String(length=255), nullable=True),
        sa.Column("dir_aclarador", sa.String(length=255), nullable=True),
        sa.Column("dir_cp", sa.String(length=10), nullable=True),
        sa.Column("dir_municipio", sa.String(length=120), nullable=True),
        sa.Column("dir_poblacion", sa.String(length=120), nullable=True),
        sa.Column("dir_provincia", sa.String(length=120), nullable=True),
        sa.Column("municipio_codigo_ine", sa.String(length=10), nullable=True),
        sa.Column("poligono", sa.String(length=50), nullable=True),
        sa.Column("parcela", sa.String(length=50), nullable=True),
        sa.Column("ref_catastral", sa.String(length=30), nullable=True),
        sa.Column("latitud", sa.Float(), nullable=True),
        sa.Column("longitud", sa.Float(), nullable=True),
        sa.Column("zona", sa.String(length=120), nullable=True),
        sa.Column("orden", sa.String(length=50), nullable=True),
        sa.Column("centro_transformador", sa.String(length=120), nullable=True),
        sa.Column("linea", sa.String(length=120), nullable=True),
        sa.Column("tension_normalizada", sa.String(length=50), nullable=True),
        sa.Column("tension_v", sa.Integer(), nullable=True),
        sa.Column("pot_max_admisible_cie_kw", sa.Float(), nullable=True),
        sa.Column("potencia_adscrita_kw", sa.Float(), nullable=True),
        sa.Column("potencia_adscrita_bloqueada", sa.Boolean(), nullable=False),
        sa.Column("fecha_vigencia_adscrita", sa.Date(), nullable=True),
        sa.Column("fase_1", sa.Boolean(), nullable=False),
        sa.Column("fase_2", sa.Boolean(), nullable=False),
        sa.Column("fase_3", sa.Boolean(), nullable=False),
        sa.Column("neutro", sa.Boolean(), nullable=False),
        sa.Column("fecha_alta", sa.Date(), nullable=True),
        sa.Column("fecha_baja", sa.Date(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", "cups", name="uq_erp_suministro_empresa_cups"),
    )
    op.create_index("ix_erp_suministro_cups", "erp_suministro", ["cups"])
    op.create_index("ix_erp_suministro_empresa_id", "erp_suministro", ["empresa_id"])
    op.create_index("ix_erp_suministro_tenant_id", "erp_suministro", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_erp_suministro_tenant_id", table_name="erp_suministro")
    op.drop_index("ix_erp_suministro_empresa_id", table_name="erp_suministro")
    op.drop_index("ix_erp_suministro_cups", table_name="erp_suministro")
    op.drop_table("erp_suministro")
    op.drop_index("ix_erp_titular_tenant_id", table_name="erp_titular")
    op.drop_index("ix_erp_titular_nif_cif", table_name="erp_titular")
    op.drop_index("ix_erp_titular_empresa_id", table_name="erp_titular")
    op.drop_table("erp_titular")
    # ### end Alembic commands ###
