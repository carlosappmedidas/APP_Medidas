"""init schema

Revision ID: 4a5d0af31df1
Revises: 
Create Date: 2026-02-09 14:33:49.881267
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4a5d0af31df1"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema inicial.

    Creamos primero las tablas base (tenants, users, empresas) y
    después ingestion_files, que depende de ellas por FK.
    """

    # ---------- tenants ----------
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("plan", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tenants_id", "tenants", ["id"], unique=False)

    # ---------- users ----------
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("rol", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ---------- empresas ----------
    op.create_table(
        "empresas",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_empresas_id", "empresas", ["id"], unique=False)
    op.create_index(
        "ix_empresas_tenant_id", "empresas", ["tenant_id"], unique=False
    )

    # ---------- ingestion_files ----------
    op.create_table(
        "ingestion_files",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=50), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rows_ok", sa.Integer(), nullable=True),
        sa.Column("rows_error", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["empresa_id"], ["empresas.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_ingestion_files_id"), "ingestion_files", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_ingestion_files_tenant_id"),
        "ingestion_files",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_ingestion_files_empresa_id"),
        "ingestion_files",
        ["empresa_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema inicial (revertir upgrade)."""

    # Borramos primero lo que depende de otras tablas
    op.drop_index(
        op.f("ix_ingestion_files_empresa_id"), table_name="ingestion_files"
    )
    op.drop_index(
        op.f("ix_ingestion_files_tenant_id"), table_name="ingestion_files"
    )
    op.drop_index(
        op.f("ix_ingestion_files_id"), table_name="ingestion_files"
    )
    op.drop_table("ingestion_files")

    # Luego empresas, users y tenants en orden inverso
    op.drop_index("ix_empresas_tenant_id", table_name="empresas")
    op.drop_index("ix_empresas_id", table_name="empresas")
    op.drop_table("empresas")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_tenants_id", table_name="tenants")
    op.drop_table("tenants")