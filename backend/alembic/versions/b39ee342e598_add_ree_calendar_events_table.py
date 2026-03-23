"""add ree calendar events table

Revision ID: b39ee342e598
Revises: 047bba0e078a
Create Date: 2026-03-23 01:10:13.335273

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b39ee342e598"
down_revision: Union[str, Sequence[str], None] = "047bba0e078a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ree_calendar_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("calendar_file_id", sa.Integer(), nullable=True),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("mes_visual", sa.String(length=50), nullable=False),
        sa.Column("categoria", sa.String(length=50), nullable=False),
        sa.Column("evento", sa.String(length=255), nullable=False),
        sa.Column("mes_afectado", sa.String(length=50), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["calendar_file_id"],
            ["ree_calendar_files.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_ree_calendar_events_id",
        "ree_calendar_events",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_events_tenant_id",
        "ree_calendar_events",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_events_calendar_file_id",
        "ree_calendar_events",
        ["calendar_file_id"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_events_anio",
        "ree_calendar_events",
        ["anio"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_events_fecha",
        "ree_calendar_events",
        ["fecha"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_events_categoria",
        "ree_calendar_events",
        ["categoria"],
        unique=False,
    )
    op.create_index(
        "ix_ree_calendar_events_estado",
        "ree_calendar_events",
        ["estado"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ree_calendar_events_estado", table_name="ree_calendar_events")
    op.drop_index("ix_ree_calendar_events_categoria", table_name="ree_calendar_events")
    op.drop_index("ix_ree_calendar_events_fecha", table_name="ree_calendar_events")
    op.drop_index("ix_ree_calendar_events_anio", table_name="ree_calendar_events")
    op.drop_index("ix_ree_calendar_events_calendar_file_id", table_name="ree_calendar_events")
    op.drop_index("ix_ree_calendar_events_tenant_id", table_name="ree_calendar_events")
    op.drop_index("ix_ree_calendar_events_id", table_name="ree_calendar_events")
    op.drop_table("ree_calendar_events")