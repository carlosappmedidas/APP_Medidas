"""add cini decoded fields to ct_celda

Revision ID: k7l8m9n0o1p2
Revises: j6k7l8m9n0o1
Create Date: 2026-04-12 21:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "k7l8m9n0o1p2"
down_revision = "j6k7l8m9n0o1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ct_celda", sa.Column("cini_p1_tipo_instalacion", sa.String(30), nullable=True))
    op.add_column("ct_celda", sa.Column("cini_p2_actividad",        sa.String(30), nullable=True))
    op.add_column("ct_celda", sa.Column("cini_p3_tipo_equipo",      sa.String(60), nullable=True))
    op.add_column("ct_celda", sa.Column("cini_p4_tension_rango",    sa.String(30), nullable=True))
    op.add_column("ct_celda", sa.Column("cini_p5_tipo_posicion",    sa.String(40), nullable=True))
    op.add_column("ct_celda", sa.Column("cini_p6_ubicacion",        sa.String(40), nullable=True))
    op.add_column("ct_celda", sa.Column("cini_p7_funcion",          sa.String(30), nullable=True))
    op.add_column("ct_celda", sa.Column("cini_p8_tension_nominal",  sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("ct_celda", "cini_p8_tension_nominal")
    op.drop_column("ct_celda", "cini_p7_funcion")
    op.drop_column("ct_celda", "cini_p6_ubicacion")
    op.drop_column("ct_celda", "cini_p5_tipo_posicion")
    op.drop_column("ct_celda", "cini_p4_tension_rango")
    op.drop_column("ct_celda", "cini_p3_tipo_equipo")
    op.drop_column("ct_celda", "cini_p2_actividad")
    op.drop_column("ct_celda", "cini_p1_tipo_instalacion")
