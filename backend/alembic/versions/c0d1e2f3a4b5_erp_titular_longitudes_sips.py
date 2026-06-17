"""ERP M1: alinear longitudes del titular a formatos SIPS + dir_duplicador

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "c0d1e2f3a4b5"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None

_SHRINK = [
    ("identificador", 14),
    ("nombre_de_pila", 30),
    ("primer_apellido", 40),
    ("segundo_apellido", 30),
    ("dir_via", 30),
    ("dir_numero", 5),
    ("dir_escalera", 3),
    ("dir_aclarador", 40),
]
_WIDEN = [
    ("identificador", 20),
    ("nombre_de_pila", 120),
    ("primer_apellido", 120),
    ("segundo_apellido", 120),
    ("dir_via", 255),
    ("dir_numero", 20),
    ("dir_escalera", 10),
    ("dir_aclarador", 255),
]


def upgrade():
    op.add_column("erp_titular", sa.Column("dir_duplicador", sa.String(length=3), nullable=True))
    for col, n in _SHRINK:
        op.execute(f"UPDATE erp_titular SET {col} = left({col}, {n}) WHERE length({col}) > {n}")
        op.alter_column("erp_titular", col, type_=sa.String(length=n), existing_nullable=True)


def downgrade():
    for col, n in _WIDEN:
        op.alter_column("erp_titular", col, type_=sa.String(length=n), existing_nullable=True)
    op.drop_column("erp_titular", "dir_duplicador")
