"""ERP Modulo 2 (Pieza B): tipo_uso en erp_instalacion

Revision ID: erp_m2_inst_tipouso
Revises: erp_m2_equipo_extra
Create Date: 2026-06-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "erp_m2_inst_tipouso"
down_revision: Union[str, Sequence[str], None] = "erp_m2_equipo_extra"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("erp_instalacion", sa.Column("tipo_uso", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("erp_instalacion", "tipo_uso")
