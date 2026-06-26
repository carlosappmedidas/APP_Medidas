"""ERP Modulo 2: codigo_fases (M/T) en equipo de medida

Revision ID: erp_m2_equipo_codigo_fases
Revises: erp_m2_inst_tipouso
Create Date: 2026-06-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "erp_m2_equipo_codigo_fases"
down_revision: Union[str, Sequence[str], None] = "erp_m2_inst_tipouso"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("erp_equipo_medida", sa.Column("codigo_fases", sa.String(length=1), nullable=True))


def downgrade() -> None:
    op.drop_column("erp_equipo_medida", "codigo_fases")
