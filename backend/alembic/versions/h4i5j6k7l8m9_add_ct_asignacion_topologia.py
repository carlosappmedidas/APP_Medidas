"""add ct asignacion to linea_inventario and cups_topologia

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
Create Date: 2026-04-11

Añade columnas de asociación CT calculada (BFS/proximidad/nudo) y método
de asignación a linea_inventario y cups_topologia.
"""
from alembic import op
import sqlalchemy as sa


revision = "h4i5j6k7l8m9"
down_revision = "g3h4i5j6k7l8"
branch_labels = None
depends_on = None


def upgrade() -> None:

    # ── linea_inventario ──────────────────────────────────────────────────────
    op.add_column("linea_inventario", sa.Column("id_ct",                sa.String(), nullable=True))
    op.add_column("linea_inventario", sa.Column("metodo_asignacion_ct", sa.String(), nullable=True))
    op.create_index("ix_linea_inventario_id_ct", "linea_inventario", ["id_ct"], unique=False)

    # ── cups_topologia ────────────────────────────────────────────────────────
    op.add_column("cups_topologia", sa.Column("id_ct_asignado",       sa.String(), nullable=True))
    op.add_column("cups_topologia", sa.Column("metodo_asignacion_ct", sa.String(), nullable=True))
    op.create_index("ix_cups_topologia_id_ct_asignado", "cups_topologia", ["id_ct_asignado"], unique=False)


def downgrade() -> None:

    # ── cups_topologia ────────────────────────────────────────────────────────
    op.drop_index("ix_cups_topologia_id_ct_asignado", table_name="cups_topologia")
    op.drop_column("cups_topologia", "metodo_asignacion_ct")
    op.drop_column("cups_topologia", "id_ct_asignado")

    # ── linea_inventario ──────────────────────────────────────────────────────
    op.drop_index("ix_linea_inventario_id_ct", table_name="linea_inventario")
    op.drop_column("linea_inventario", "metodo_asignacion_ct")
    op.drop_column("linea_inventario", "id_ct")
