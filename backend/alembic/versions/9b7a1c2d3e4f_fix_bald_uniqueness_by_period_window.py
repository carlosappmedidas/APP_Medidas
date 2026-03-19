"""fix bald uniqueness by period window

Revision ID: 9b7a1c2d3e4f
Revises: c0d31722d63c
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "9b7a1c2d3e4f"
down_revision: Union[str, Sequence[str], None] = "4573a8da1814"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    existing_uqs = {
        uq["name"]
        for uq in inspector.get_unique_constraints("bald_period_contributions")
        if uq.get("name")
    }

    if "uq_bald_contrib_file_period_window" in existing_uqs:
        op.drop_constraint(
            "uq_bald_contrib_file_period_window",
            "bald_period_contributions",
            type_="unique",
        )

    existing_uqs = {
        uq["name"]
        for uq in inspector.get_unique_constraints("bald_period_contributions")
        if uq.get("name")
    }

    if "uq_bald_contrib_period_window" not in existing_uqs:
        op.create_unique_constraint(
            "uq_bald_contrib_period_window",
            "bald_period_contributions",
            ["tenant_id", "empresa_id", "anio", "mes", "ventana_publicacion"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    existing_uqs = {
        uq["name"]
        for uq in inspector.get_unique_constraints("bald_period_contributions")
        if uq.get("name")
    }

    if "uq_bald_contrib_period_window" in existing_uqs:
        op.drop_constraint(
            "uq_bald_contrib_period_window",
            "bald_period_contributions",
            type_="unique",
        )

    existing_uqs = {
        uq["name"]
        for uq in inspector.get_unique_constraints("bald_period_contributions")
        if uq.get("name")
    }

    if "uq_bald_contrib_file_period_window" not in existing_uqs:
        op.create_unique_constraint(
            "uq_bald_contrib_file_period_window",
            "bald_period_contributions",
            [
                "tenant_id",
                "empresa_id",
                "ingestion_file_id",
                "anio",
                "mes",
                "ventana_publicacion",
            ],
        )