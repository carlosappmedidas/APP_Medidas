"""add medidas tables v2

Revision ID: 9f3d832068aa
Revises: 289ad8a44777
Create Date: 2026-02-09 17:22:57.889547

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "9f3d832068aa"
down_revision: Union[str, Sequence[str], None] = "289ad8a44777"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tabla medidas_micro
    op.create_table(
        "medidas_micro",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("punto_id", sa.String(length=50), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("energia_kwh", sa.Float(), nullable=True),
        sa.Column("potencia_kw", sa.Float(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=True),
        sa.Column("file_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["file_id"], ["ingestion_files.id"]),
    )
    op.create_index(
        "ix_medidas_micro_tenant_id",
        "medidas_micro",
        ["tenant_id"],
    )
    op.create_index(
        "ix_medidas_micro_empresa_id",
        "medidas_micro",
        ["empresa_id"],
    )
    op.create_index(
        "ix_medidas_micro_file_id",
        "medidas_micro",
        ["file_id"],
    )
    op.create_index(
        "ix_medidas_micro_timestamp",
        "medidas_micro",
        ["timestamp"],
    )

    # Tabla medidas_general
    op.create_table(
        "medidas_general",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("punto_id", sa.String(length=50), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("energia_total_kwh", sa.Float(), nullable=True),
        sa.Column("potencia_max_kw", sa.Float(), nullable=True),
        sa.Column("file_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["file_id"], ["ingestion_files.id"]),
    )
    op.create_index(
        "ix_medidas_general_tenant_id",
        "medidas_general",
        ["tenant_id"],
    )
    op.create_index(
        "ix_medidas_general_empresa_id",
        "medidas_general",
        ["empresa_id"],
    )
    op.create_index(
        "ix_medidas_general_file_id",
        "medidas_general",
        ["file_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_medidas_general_file_id", table_name="medidas_general")
    op.drop_index("ix_medidas_general_empresa_id", table_name="medidas_general")
    op.drop_index("ix_medidas_general_tenant_id", table_name="medidas_general")
    op.drop_table("medidas_general")

    op.drop_index("ix_medidas_micro_timestamp", table_name="medidas_micro")
    op.drop_index("ix_medidas_micro_file_id", table_name="medidas_micro")
    op.drop_index("ix_medidas_micro_empresa_id", table_name="medidas_micro")
    op.drop_index("ix_medidas_micro_tenant_id", table_name="medidas_micro")
    op.drop_table("medidas_micro")