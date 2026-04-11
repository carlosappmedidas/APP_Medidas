"""add full b1 fields to linea_inventario

Revision ID: e1f2a3b4c5d6
Revises: c9d0e1f2a3b4
Create Date: 2026-04-11

"""
from alembic import op
import sqlalchemy as sa

revision = "e1f2a3b4c5d6"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("linea_inventario", sa.Column("ccaa_1",                  sa.String(2), nullable=True))
    op.add_column("linea_inventario", sa.Column("propiedad",               sa.Integer(), nullable=True))
    op.add_column("linea_inventario", sa.Column("tension_construccion_kv", sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("resistencia_ohm",         sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("reactancia_ohm",          sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("intensidad_a",            sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("punto_frontera",          sa.Integer(), nullable=True))
    op.add_column("linea_inventario", sa.Column("modelo",                  sa.String(1), nullable=True))
    op.add_column("linea_inventario", sa.Column("operacion",               sa.Integer(), nullable=True))
    op.add_column("linea_inventario", sa.Column("causa_baja",              sa.Integer(), nullable=True))
    op.add_column("linea_inventario", sa.Column("fecha_aps",               sa.Date(),    nullable=True))
    op.add_column("linea_inventario", sa.Column("fecha_baja",              sa.Date(),    nullable=True))


def downgrade() -> None:
    op.drop_column("linea_inventario", "fecha_baja")
    op.drop_column("linea_inventario", "fecha_aps")
    op.drop_column("linea_inventario", "causa_baja")
    op.drop_column("linea_inventario", "operacion")
    op.drop_column("linea_inventario", "modelo")
    op.drop_column("linea_inventario", "punto_frontera")
    op.drop_column("linea_inventario", "intensidad_a")
    op.drop_column("linea_inventario", "reactancia_ohm")
    op.drop_column("linea_inventario", "resistencia_ohm")
    op.drop_column("linea_inventario", "tension_construccion_kv")
    op.drop_column("linea_inventario", "propiedad")
    op.drop_column("linea_inventario", "ccaa_1")
