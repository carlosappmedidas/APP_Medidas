"""ERP Modulo 2: campos extra equipo (giro, alquiler, precinto)

Revision ID: erp_m2_equipo_extra
Revises: erp_m2_almacen
Create Date: 2026-06-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "erp_m2_equipo_extra"
down_revision: Union[str, Sequence[str], None] = "erp_m2_almacen"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("erp_equipo_medida", sa.Column("giro_digitos", sa.Integer(), nullable=True))
    op.add_column("erp_equipo_medida", sa.Column("alquiler", sa.Boolean(), nullable=True))
    op.add_column("erp_equipo_medida", sa.Column("tipo_alquiler", sa.String(length=120), nullable=True))
    op.add_column("erp_equipo_medida", sa.Column("numero_precinto", sa.String(length=60), nullable=True))
    op.add_column("erp_equipo_medida", sa.Column("fecha_precintado", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("erp_equipo_medida", "fecha_precintado")
    op.drop_column("erp_equipo_medida", "numero_precinto")
    op.drop_column("erp_equipo_medida", "tipo_alquiler")
    op.drop_column("erp_equipo_medida", "alquiler")
    op.drop_column("erp_equipo_medida", "giro_digitos")
