"""add is_superuser to users

Revision ID: ebb8f1bf4b5a
Revises: c7d37f289c51
Create Date: 2026-02-17 20:10:41.240138

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "xxxxxxxxxxxx"
down_revision = "e10f433a820b"  # lo que ya tengas
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) añadir columna permitiendo NULL inicialmente
    op.add_column(
        "users",
        sa.Column("is_superuser", sa.Boolean(), nullable=True),
    )

    # 2) poner false a todos los usuarios existentes
    op.execute("UPDATE users SET is_superuser = false")

    # 3) ahora sí, marcarla como NOT NULL
    op.alter_column(
        "users",
        "is_superuser",
        existing_type=sa.Boolean(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("users", "is_superuser")