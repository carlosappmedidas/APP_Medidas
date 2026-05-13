"""widen envios_alertas.m_clas to 10 chars

Allows storing 'diario' / 'mensual' for respuesta_ree_inventario alerts
that reuse the envios_alertas table. Was String(4) (only fit M1/M2/M7).

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-05-12 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "envios_alertas",
        "m_clas",
        existing_type=sa.String(length=4),
        type_=sa.String(length=10),
        existing_nullable=False,
    )


def downgrade() -> None:
    # ⚠ Si hay filas con m_clas > 4 chars (ej. "diario", "mensual") este
    # downgrade fallará porque no caben. Antes de bajar habría que borrarlas
    # o truncarlas manualmente:
    #   DELETE FROM envios_alertas WHERE LENGTH(m_clas) > 4;
    op.alter_column(
        "envios_alertas",
        "m_clas",
        existing_type=sa.String(length=10),
        type_=sa.String(length=4),
        existing_nullable=False,
    )