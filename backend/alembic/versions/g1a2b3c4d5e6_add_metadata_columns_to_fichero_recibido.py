"""add metadata columns to fichero_recibido

Añade 4 columnas a fichero_recibido para soportar la descarga real
de ficheros desde STG (Paquete 5):

  - id_contador      : ID extraído del nombre del fichero (ej: 208251006614)
  - tipo_mensaje     : tipo según el nombre/fabricante (G97, S52, S56, S02...)
  - timestamp_nombre : fecha/hora extraída del nombre del fichero
  - ruta_remota      : carpeta del FTP/SFTP de donde se descargó (trazabilidad)

Todas nullable porque:
  - Ficheros antiguos creados manualmente (sin descarga) no las tienen
  - El parseo del nombre puede no encajar para todos los formatos
  - ruta_remota solo aplica a descargas automáticas, no manuales

Revision ID: g1a2b3c4d5e6
Revises: f9a0b1c2d3e4
Create Date: 2026-06-03 00:50:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "g1a2b3c4d5e6"
down_revision: Union[str, None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stg_fichero_recibido",
        sa.Column("id_contador", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "stg_fichero_recibido",
        sa.Column("tipo_mensaje", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "stg_fichero_recibido",
        sa.Column("timestamp_nombre", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "stg_fichero_recibido",
        sa.Column("ruta_remota", sa.String(length=500), nullable=True),
    )
    # Índices útiles para consultas posteriores
    op.create_index(
        "ix_stg_fichero_recibido_id_contador",
        "stg_fichero_recibido",
        ["id_contador"],
    )
    op.create_index(
        "ix_stg_fichero_recibido_timestamp_nombre",
        "stg_fichero_recibido",
        ["timestamp_nombre"],
    )


def downgrade() -> None:
    op.drop_index("ix_stg_fichero_recibido_timestamp_nombre", table_name="stg_fichero_recibido")
    op.drop_index("ix_stg_fichero_recibido_id_contador", table_name="stg_fichero_recibido")
    op.drop_column("stg_fichero_recibido", "ruta_remota")
    op.drop_column("stg_fichero_recibido", "timestamp_nombre")
    op.drop_column("stg_fichero_recibido", "tipo_mensaje")
    op.drop_column("stg_fichero_recibido", "id_contador")
