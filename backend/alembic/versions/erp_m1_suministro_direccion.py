"""ERP M1: suministro - direccion SIPS/CNMC + fases M/T; quitar tipo_punto_medida

Revision ID: erp_m1_suministro_direccion
Revises: erp_m1_persona_contacto
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_suministro_direccion"
down_revision = "erp_m1_persona_contacto"
branch_labels = None
depends_on = None

# (columna, nueva longitud) — alinear a formatos SIPS …PS (p8-9)
_SHRINK = [
    ("dir_tipo_via", 2),
    ("dir_via", 30),
    ("dir_numero", 5),
    ("dir_aclarador", 40),
]
_WIDEN = [
    ("dir_tipo_via", 50),
    ("dir_via", 255),
    ("dir_numero", 20),
    ("dir_aclarador", 255),
]


def upgrade():
    # Nuevas columnas de dirección (desglose SIPS) + país + fases
    op.add_column("erp_suministro", sa.Column("dir_duplicador", sa.String(length=3), nullable=True))
    op.add_column("erp_suministro", sa.Column("dir_escalera", sa.String(length=3), nullable=True))
    op.add_column("erp_suministro", sa.Column("dir_piso", sa.String(length=3), nullable=True))
    op.add_column("erp_suministro", sa.Column("dir_puerta", sa.String(length=3), nullable=True))
    op.add_column("erp_suministro", sa.Column("dir_tipo_aclarador", sa.String(length=2), nullable=True))
    op.add_column("erp_suministro", sa.Column("dir_pais", sa.String(length=120), nullable=True))
    op.add_column("erp_suministro", sa.Column("codigo_fases", sa.String(length=1), nullable=True))

    # Alinear longitudes a SIPS (trunca dato de prueba antes del alter para no fallar)
    for col, n in _SHRINK:
        op.execute(f"UPDATE erp_suministro SET {col} = left({col}, {n}) WHERE length({col}) > {n}")
        op.alter_column("erp_suministro", col, type_=sa.String(length=n), existing_nullable=True)

    # Quitar lo que ya no aplica aquí
    op.drop_column("erp_suministro", "dir_resto")
    op.drop_column("erp_suministro", "fase_1")
    op.drop_column("erp_suministro", "fase_2")
    op.drop_column("erp_suministro", "fase_3")
    op.drop_column("erp_suministro", "neutro")
    op.drop_column("erp_suministro", "tipo_punto_medida")  # pasa a erp_contrato


def downgrade():
    op.add_column("erp_suministro", sa.Column("tipo_punto_medida", sa.Integer(), nullable=True))
    op.add_column("erp_suministro", sa.Column("neutro", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("erp_suministro", sa.Column("fase_3", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("erp_suministro", sa.Column("fase_2", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("erp_suministro", sa.Column("fase_1", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("erp_suministro", sa.Column("dir_resto", sa.String(length=255), nullable=True))

    for col, n in _WIDEN:
        op.alter_column("erp_suministro", col, type_=sa.String(length=n), existing_nullable=True)

    op.drop_column("erp_suministro", "codigo_fases")
    op.drop_column("erp_suministro", "dir_pais")
    op.drop_column("erp_suministro", "dir_tipo_aclarador")
    op.drop_column("erp_suministro", "dir_puerta")
    op.drop_column("erp_suministro", "dir_piso")
    op.drop_column("erp_suministro", "dir_escalera")
    op.drop_column("erp_suministro", "dir_duplicador")
