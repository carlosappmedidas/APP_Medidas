"""add medidas_ps y medidas_micro

Revision ID: 9753a6fe45b6
Revises: 60b49bab588f
Create Date: 2026-02-24 00:57:20.470142
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "9753a6fe45b6"
down_revision: Union[str, Sequence[str], None] = "60b49bab588f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str, schema: str = "public") -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return insp.has_table(table_name, schema=schema)


def upgrade() -> None:
    """Upgrade schema."""

    # ✅ medidas_micro YA EXISTE desde migraciones previas (p.ej. 9f3d832068aa).
    # Por seguridad, si en algún entorno NO existe, la creamos; si existe, NO hacemos nada.
    if not _has_table("medidas_micro"):
        op.create_table(
            "medidas_micro",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=False),
            sa.Column("empresa_id", sa.Integer(), nullable=False),
            sa.Column("punto_id", sa.String(length=50), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False),
            sa.Column("energia_kwh", sa.Float(), nullable=True),
            sa.Column("potencia_kw", sa.Float(), nullable=True),
            sa.Column("calidad", sa.String(length=20), nullable=True),
            sa.Column("source_file_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
            sa.ForeignKeyConstraint(["source_file_id"], ["ingestion_files.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_medidas_micro_empresa_id"), "medidas_micro", ["empresa_id"], unique=False)
        op.create_index(op.f("ix_medidas_micro_punto_id"), "medidas_micro", ["punto_id"], unique=False)
        op.create_index(op.f("ix_medidas_micro_source_file_id"), "medidas_micro", ["source_file_id"], unique=False)
        op.create_index(op.f("ix_medidas_micro_tenant_id"), "medidas_micro", ["tenant_id"], unique=False)
        op.create_index(op.f("ix_medidas_micro_timestamp"), "medidas_micro", ["timestamp"], unique=False)

    # ✅ medidas_ps (esta sí es la tabla nueva de esta migración)
    if not _has_table("medidas_ps"):
        op.create_table(
            "medidas_ps",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("tenant_id", sa.Integer(), nullable=False),
            sa.Column("empresa_id", sa.Integer(), nullable=False),
            sa.Column("punto_id", sa.String(length=50), nullable=False),
            sa.Column("anio", sa.Integer(), nullable=False),
            sa.Column("mes", sa.Integer(), nullable=False),
            sa.Column("energia_ps_tipo_1_kwh", sa.Float(), nullable=True),
            sa.Column("energia_ps_tipo_2_kwh", sa.Float(), nullable=True),
            sa.Column("energia_ps_tipo_3_kwh", sa.Float(), nullable=True),
            sa.Column("energia_ps_tipo_4_kwh", sa.Float(), nullable=True),
            sa.Column("energia_ps_tipo_5_kwh", sa.Float(), nullable=True),
            sa.Column("energia_ps_total_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tipo_1", sa.Integer(), nullable=True),
            sa.Column("cups_tipo_2", sa.Integer(), nullable=True),
            sa.Column("cups_tipo_3", sa.Integer(), nullable=True),
            sa.Column("cups_tipo_4", sa.Integer(), nullable=True),
            sa.Column("cups_tipo_5", sa.Integer(), nullable=True),
            sa.Column("cups_total", sa.Integer(), nullable=True),
            sa.Column("importe_tipo_1_eur", sa.Float(), nullable=True),
            sa.Column("importe_tipo_2_eur", sa.Float(), nullable=True),
            sa.Column("importe_tipo_3_eur", sa.Float(), nullable=True),
            sa.Column("importe_tipo_4_eur", sa.Float(), nullable=True),
            sa.Column("importe_tipo_5_eur", sa.Float(), nullable=True),
            sa.Column("importe_total_eur", sa.Float(), nullable=True),
            sa.Column("energia_tarifa_20td_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tarifa_20td", sa.Integer(), nullable=True),
            sa.Column("importe_tarifa_20td_eur", sa.Float(), nullable=True),
            sa.Column("energia_tarifa_30td_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tarifa_30td", sa.Integer(), nullable=True),
            sa.Column("importe_tarifa_30td_eur", sa.Float(), nullable=True),
            sa.Column("energia_tarifa_30tdve_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tarifa_30tdve", sa.Integer(), nullable=True),
            sa.Column("importe_tarifa_30tdve_eur", sa.Float(), nullable=True),
            sa.Column("energia_tarifa_61td_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tarifa_61td", sa.Integer(), nullable=True),
            sa.Column("importe_tarifa_61td_eur", sa.Float(), nullable=True),
            sa.Column("energia_tarifa_62td_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tarifa_62td", sa.Integer(), nullable=True),
            sa.Column("importe_tarifa_62td_eur", sa.Float(), nullable=True),
            sa.Column("energia_tarifa_63td_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tarifa_63td", sa.Integer(), nullable=True),
            sa.Column("importe_tarifa_63td_eur", sa.Float(), nullable=True),
            sa.Column("energia_tarifa_64td_kwh", sa.Float(), nullable=True),
            sa.Column("cups_tarifa_64td", sa.Integer(), nullable=True),
            sa.Column("importe_tarifa_64td_eur", sa.Float(), nullable=True),
            sa.Column("file_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
            sa.ForeignKeyConstraint(["file_id"], ["ingestion_files.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

        op.create_index(op.f("ix_medidas_ps_anio"), "medidas_ps", ["anio"], unique=False)
        op.create_index(op.f("ix_medidas_ps_empresa_id"), "medidas_ps", ["empresa_id"], unique=False)
        op.create_index(op.f("ix_medidas_ps_file_id"), "medidas_ps", ["file_id"], unique=False)
        op.create_index(op.f("ix_medidas_ps_mes"), "medidas_ps", ["mes"], unique=False)
        op.create_index(op.f("ix_medidas_ps_punto_id"), "medidas_ps", ["punto_id"], unique=False)
        op.create_index(op.f("ix_medidas_ps_tenant_id"), "medidas_ps", ["tenant_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    # En downgrade, quitamos medidas_ps (lo nuevo de esta migración).
    # medidas_micro NO la tocamos aquí, porque puede venir de migraciones previas.
    if _has_table("medidas_ps"):
        op.drop_index(op.f("ix_medidas_ps_tenant_id"), table_name="medidas_ps")
        op.drop_index(op.f("ix_medidas_ps_punto_id"), table_name="medidas_ps")
        op.drop_index(op.f("ix_medidas_ps_mes"), table_name="medidas_ps")
        op.drop_index(op.f("ix_medidas_ps_file_id"), table_name="medidas_ps")
        op.drop_index(op.f("ix_medidas_ps_empresa_id"), table_name="medidas_ps")
        op.drop_index(op.f("ix_medidas_ps_anio"), table_name="medidas_ps")
        op.drop_table("medidas_ps")