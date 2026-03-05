"""baseline existing core tables

Revision ID: fd4bce0415f1
Revises:
Create Date: 2026-03-05 01:32:04.962289
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "fd4bce0415f1"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # === tenants ===
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(length=200), nullable=False, unique=True),
        sa.Column("plan", sa.String(length=50), nullable=False, server_default="starter"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    # === users ===
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("rol", sa.String(length=50), nullable=False, server_default="owner"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ui_theme_overrides", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    # === empresas ===
    op.create_table(
        "empresas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("codigo_ree", sa.String(length=50), nullable=True),
        sa.Column("codigo_cnmc", sa.String(length=50), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_empresas_codigo_ree ON empresas (codigo_ree)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_empresas_codigo_cnmc ON empresas (codigo_cnmc)")

    # === user_empresas (m2m) ===
    op.create_table(
        "user_empresas",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("user_empresas")
    op.drop_index("ix_empresas_codigo_cnmc", table_name="empresas")
    op.drop_index("ix_empresas_codigo_ree", table_name="empresas")
    op.drop_index("ix_empresas_tenant_id", table_name="empresas")
    op.drop_table("empresas")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_table("users")
    op.drop_table("tenants")