"""sync alert_results lifecycle columns

Idempotente: anade lifecycle_status, resolved_by, resolved_at a
alert_results SOLO si no existen. Mac dev ya las tiene, Windows prod no.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-06-02 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table_name: str) -> set:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    existing = _existing_columns("alert_results")

    if "lifecycle_status" not in existing:
        op.add_column(
            "alert_results",
            sa.Column(
                "lifecycle_status",
                sa.String(length=30),
                nullable=False,
                server_default="nueva",
            ),
        )
        op.create_index(
            "ix_alert_results_lifecycle_status",
            "alert_results",
            ["lifecycle_status"],
        )

    if "resolved_by" not in existing:
        op.add_column(
            "alert_results",
            sa.Column("resolved_by", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_alert_results_resolved_by_users",
            "alert_results",
            "users",
            ["resolved_by"],
            ["id"],
        )

    if "resolved_at" not in existing:
        op.add_column(
            "alert_results",
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    existing = _existing_columns("alert_results")

    if "resolved_at" in existing:
        op.drop_column("alert_results", "resolved_at")

    if "resolved_by" in existing:
        try:
            op.drop_constraint(
                "fk_alert_results_resolved_by_users",
                "alert_results",
                type_="foreignkey",
            )
        except Exception:
            pass
        op.drop_column("alert_results", "resolved_by")

    if "lifecycle_status" in existing:
        try:
            op.drop_index(
                "ix_alert_results_lifecycle_status",
                table_name="alert_results",
            )
        except Exception:
            pass
        op.drop_column("alert_results", "lifecycle_status")
