"""add ree calendar files table

Revision ID: 047bba0e078a
Revises: 9b7a1c2d3e4f
Create Date: 2026-03-22 23:18:30.197227

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "047bba0e078a"
down_revision: Union[str, Sequence[str], None] = "9b7a1c2d3e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ree_calendar_files",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=True),
        sa.Column("mime_type", sa.String(length=150), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_ree_calendar_files_id",
        "ree_calendar_files",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_files_tenant_id",
        "ree_calendar_files",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_files_anio",
        "ree_calendar_files",
        ["anio"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ree_calendar_files_anio", table_name="ree_calendar_files")
    op.drop_index("ix_ree_calendar_files_tenant_id", table_name="ree_calendar_files")
    op.drop_index("ix_ree_calendar_files_id", table_name="ree_calendar_files")
    op.drop_table("ree_calendar_files")