"""harden medida and contribution constraints

Revision ID: c0d31722d63c
Revises: f1a2b3c4d5e6
Create Date: 2026-03-13 16:25:20.743367

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c0d31722d63c"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- medidas_general ---
    op.create_unique_constraint(
        "uq_medidas_general_tenant_empresa_punto_periodo",
        "medidas_general",
        ["tenant_id", "empresa_id", "punto_id", "anio", "mes"],
    )
    op.create_index(
        "ix_medidas_general_tenant_empresa_period",
        "medidas_general",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )

    # --- medidas_ps ---
    op.create_unique_constraint(
        "uq_medidas_ps_tenant_empresa_punto_periodo",
        "medidas_ps",
        ["tenant_id", "empresa_id", "punto_id", "anio", "mes"],
    )
    op.create_index(
        "ix_medidas_ps_tenant_empresa_period",
        "medidas_ps",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )

    # --- medidas_micro ---
    op.create_unique_constraint(
        "uq_medidas_micro_tenant_empresa_punto_timestamp",
        "medidas_micro",
        ["tenant_id", "empresa_id", "punto_id", "timestamp"],
    )
    op.create_index(
        "ix_medidas_micro_tenant_empresa_timestamp",
        "medidas_micro",
        ["tenant_id", "empresa_id", "timestamp"],
        unique=False,
    )


def downgrade() -> None:
    # --- medidas_micro ---
    op.drop_index("ix_medidas_micro_tenant_empresa_timestamp", table_name="medidas_micro")
    op.drop_constraint(
        "uq_medidas_micro_tenant_empresa_punto_timestamp",
        "medidas_micro",
        type_="unique",
    )

    # --- medidas_ps ---
    op.drop_index("ix_medidas_ps_tenant_empresa_period", table_name="medidas_ps")
    op.drop_constraint(
        "uq_medidas_ps_tenant_empresa_punto_periodo",
        "medidas_ps",
        type_="unique",
    )

    # --- medidas_general ---
    op.drop_index("ix_medidas_general_tenant_empresa_period", table_name="medidas_general")
    op.drop_constraint(
        "uq_medidas_general_tenant_empresa_punto_periodo",
        "medidas_general",
        type_="unique",
    )