"""fix linea_inventario column names and add missing columns

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-04-11

La tabla linea_inventario en BD tiene nombres de columnas de la versión antigua:
  - id_linea      → renombrar a id_tramo
  - nombre_linea  → eliminar
  - tipo_via      → eliminar
  - nodo_inicio   → renombrar a nudo_inicio
  - nodo_fin      → renombrar a nudo_fin
  Faltan: cini, codigo_ccuu, tension_kv
"""
from alembic import op
import sqlalchemy as sa

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Renombrar columnas
    op.alter_column("linea_inventario", "id_linea",    new_column_name="id_tramo")
    op.alter_column("linea_inventario", "nodo_inicio", new_column_name="nudo_inicio")
    op.alter_column("linea_inventario", "nodo_fin",    new_column_name="nudo_fin")

    # 2. Eliminar columnas obsoletas
    op.drop_column("linea_inventario", "nombre_linea")
    op.drop_column("linea_inventario", "tipo_via")

    # 3. Añadir columnas que faltan
    op.add_column("linea_inventario", sa.Column("cini",        sa.String(), nullable=True))
    op.add_column("linea_inventario", sa.Column("codigo_ccuu", sa.String(), nullable=True))
    op.add_column("linea_inventario", sa.Column("tension_kv",  sa.Float(),  nullable=True))

    # 4. Recrear índice sobre id_tramo (antes era sobre id_linea)
    op.drop_index("ix_linea_inventario_id_linea",  table_name="linea_inventario")
    op.create_index("ix_linea_inventario_id_tramo", "linea_inventario", ["id_tramo"], unique=False)

    # 5. Recrear constraint unique con el nuevo nombre de columna
    op.drop_constraint("uq_linea_inventario_tenant_empresa_linea", "linea_inventario", type_="unique")
    op.create_unique_constraint(
        "uq_linea_inventario_tenant_empresa_tramo",
        "linea_inventario",
        ["tenant_id", "empresa_id", "id_tramo"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_linea_inventario_tenant_empresa_tramo", "linea_inventario", type_="unique")
    op.create_unique_constraint(
        "uq_linea_inventario_tenant_empresa_linea",
        "linea_inventario",
        ["tenant_id", "empresa_id", "id_tramo"],
    )
    op.drop_index("ix_linea_inventario_id_tramo", table_name="linea_inventario")
    op.create_index("ix_linea_inventario_id_linea", "linea_inventario", ["id_tramo"], unique=False)
    op.drop_column("linea_inventario", "tension_kv")
    op.drop_column("linea_inventario", "codigo_ccuu")
    op.drop_column("linea_inventario", "cini")
    op.add_column("linea_inventario", sa.Column("tipo_via",     sa.String(4),  nullable=True))
    op.add_column("linea_inventario", sa.Column("nombre_linea", sa.String(),   nullable=True))
    op.alter_column("linea_inventario", "nudo_fin",    new_column_name="nodo_fin")
    op.alter_column("linea_inventario", "nudo_inicio", new_column_name="nodo_inicio")
    op.alter_column("linea_inventario", "id_tramo",    new_column_name="id_linea")
