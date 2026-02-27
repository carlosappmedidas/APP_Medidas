"""add codigo columns to empresas

Revision ID: 145f8ccc0249
Revises: 43aa1fb611e4
Create Date: 2026-02-12 19:38:05.370493
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "145f8ccc0249"
down_revision: Union[str, Sequence[str], None] = "43aa1fb611e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Nombres explícitos (evita None y warnings)
FK_EMPRESAS_TENANT = "empresas_tenant_id_fkey"
FK_USERS_TENANT = "users_tenant_id_fkey"
FK_MEDIDAS_MICRO_FILE_OLD = "medidas_micro_file_id_fkey"
FK_MEDIDAS_MICRO_SOURCE_FILE = "fk_medidas_micro_source_file_id"
UQ_TENANTS_NOMBRE = "uq_tenants_nombre"


def upgrade() -> None:
    """Upgrade schema."""

    # --- empresas ---
    op.add_column("empresas", sa.Column("codigo_cnmc", sa.String(length=50), nullable=True))
    op.add_column(
        "empresas",
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # recrear FK tenant con nombre fijo (y ondelete CASCADE si lo quieres igual)
    op.drop_constraint(FK_EMPRESAS_TENANT, "empresas", type_="foreignkey", if_exists=True)
    op.create_foreign_key(
        FK_EMPRESAS_TENANT,
        "empresas",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # borrar columna vieja (si existe)
    op.drop_column("empresas", "codigo_cnm", if_exists=True)

    # (opcional) quitar default una vez creado
    op.alter_column("empresas", "activo", server_default=None)

    # --- medidas_general ---
    op.add_column("medidas_general", sa.Column("energia_frontera_dd_kwh", sa.Float(), nullable=True))
    op.alter_column(
        "medidas_general",
        "created_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
    )
    op.alter_column(
        "medidas_general",
        "updated_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        nullable=False,
    )
    op.create_index(op.f("ix_medidas_general_anio"), "medidas_general", ["anio"], unique=False)
    op.create_index(op.f("ix_medidas_general_mes"), "medidas_general", ["mes"], unique=False)
    op.create_index(op.f("ix_medidas_general_punto_id"), "medidas_general", ["punto_id"], unique=False)

    # --- medidas_micro ---
    op.add_column("medidas_micro", sa.Column("calidad", sa.String(length=20), nullable=True))
    op.add_column("medidas_micro", sa.Column("source_file_id", sa.Integer(), nullable=False))
    op.alter_column(
        "medidas_micro",
        "timestamp",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
    )
    op.alter_column(
        "medidas_micro",
        "created_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
    )
    op.alter_column(
        "medidas_micro",
        "updated_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        nullable=False,
    )

    op.drop_index(op.f("ix_medidas_micro_file_id"), table_name="medidas_micro", if_exists=True)
    op.create_index(op.f("ix_medidas_micro_punto_id"), "medidas_micro", ["punto_id"], unique=False)
    op.create_index(op.f("ix_medidas_micro_source_file_id"), "medidas_micro", ["source_file_id"], unique=False)

    op.drop_constraint(FK_MEDIDAS_MICRO_FILE_OLD, "medidas_micro", type_="foreignkey", if_exists=True)
    op.create_foreign_key(
        FK_MEDIDAS_MICRO_SOURCE_FILE,
        "medidas_micro",
        "ingestion_files",
        ["source_file_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_column("medidas_micro", "file_id", if_exists=True)
    op.drop_column("medidas_micro", "estado", if_exists=True)

    # --- tenants ---
    op.alter_column(
        "tenants",
        "nombre",
        existing_type=sa.VARCHAR(length=100),
        type_=sa.String(length=200),
        existing_nullable=False,
    )
    op.create_unique_constraint(UQ_TENANTS_NOMBRE, "tenants", ["nombre"])

    # --- users ---
    op.drop_constraint(FK_USERS_TENANT, "users", type_="foreignkey", if_exists=True)
    op.create_foreign_key(
        FK_USERS_TENANT,
        "users",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""

    # --- users ---
    op.drop_constraint(FK_USERS_TENANT, "users", type_="foreignkey", if_exists=True)
    op.create_foreign_key(
        FK_USERS_TENANT,
        "users",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # --- tenants ---
    op.drop_constraint(UQ_TENANTS_NOMBRE, "tenants", type_="unique", if_exists=True)
    op.alter_column(
        "tenants",
        "nombre",
        existing_type=sa.String(length=200),
        type_=sa.VARCHAR(length=100),
        existing_nullable=False,
    )

    # --- medidas_micro ---
    op.add_column("medidas_micro", sa.Column("estado", sa.VARCHAR(length=20), nullable=True))
    op.add_column("medidas_micro", sa.Column("file_id", sa.INTEGER(), nullable=False))

    op.drop_constraint(FK_MEDIDAS_MICRO_SOURCE_FILE, "medidas_micro", type_="foreignkey", if_exists=True)
    op.create_foreign_key(
        FK_MEDIDAS_MICRO_FILE_OLD,
        "medidas_micro",
        "ingestion_files",
        ["file_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index(op.f("ix_medidas_micro_source_file_id"), table_name="medidas_micro", if_exists=True)
    op.drop_index(op.f("ix_medidas_micro_punto_id"), table_name="medidas_micro", if_exists=True)
    op.create_index(op.f("ix_medidas_micro_file_id"), "medidas_micro", ["file_id"], unique=False)

    op.alter_column(
        "medidas_micro",
        "updated_at",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        nullable=True,
    )
    op.alter_column(
        "medidas_micro",
        "created_at",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        "medidas_micro",
        "timestamp",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False,
    )

    op.drop_column("medidas_micro", "source_file_id", if_exists=True)
    op.drop_column("medidas_micro", "calidad", if_exists=True)

    # --- medidas_general ---
    op.drop_index(op.f("ix_medidas_general_punto_id"), table_name="medidas_general", if_exists=True)
    op.drop_index(op.f("ix_medidas_general_mes"), table_name="medidas_general", if_exists=True)
    op.drop_index(op.f("ix_medidas_general_anio"), table_name="medidas_general", if_exists=True)

    op.alter_column(
        "medidas_general",
        "updated_at",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        nullable=True,
    )
    op.alter_column(
        "medidas_general",
        "created_at",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False,
    )
    op.drop_column("medidas_general", "energia_frontera_dd_kwh")

    # --- empresas ---
    op.add_column("empresas", sa.Column("codigo_cnm", sa.VARCHAR(length=50), nullable=True))

    op.drop_constraint(FK_EMPRESAS_TENANT, "empresas", type_="foreignkey", if_exists=True)
    op.create_foreign_key(
        FK_EMPRESAS_TENANT,
        "empresas",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_column("empresas", "activo")
    op.drop_column("empresas", "codigo_cnmc")