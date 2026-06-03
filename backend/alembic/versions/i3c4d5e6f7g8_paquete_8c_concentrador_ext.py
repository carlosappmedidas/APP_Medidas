"""Paquete 8c — campos administrativos en stg_concentrador (CUPS, ID CT, Nombre CT).

Estos 3 campos NO vienen en los informes STG (S24/S02/S05/…). Se rellenan
manualmente, por import Excel del cliente, o por sincronización con
GISCE-SIPS.

Revision ID: i3c4d5e6f7g8
Revises: h2b3c4d5e6f7
Create Date: 2026-06-03 23:00:00
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "i3c4d5e6f7g8"
down_revision = "h2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # CUPS oficial del CT (CNMC, 20-22 chars tipo ES0021...)
    op.add_column(
        "stg_concentrador",
        sa.Column("cups", sa.String(length=22), nullable=True),
    )
    # ID administrativo del CT (ej. "CT-0148" o referencia interna del cliente)
    op.add_column(
        "stg_concentrador",
        sa.Column("id_ct", sa.String(length=50), nullable=True),
    )
    # Nombre humano del CT (ej. "Centro de Transformación San Pedro")
    op.add_column(
        "stg_concentrador",
        sa.Column("nombre_ct", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("stg_concentrador", "nombre_ct")
    op.drop_column("stg_concentrador", "id_ct")
    op.drop_column("stg_concentrador", "cups")
