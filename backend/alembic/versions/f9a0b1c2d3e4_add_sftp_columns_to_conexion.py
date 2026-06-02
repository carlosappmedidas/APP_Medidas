"""add sftp columns to stg_conexion_empresa

Añade 3 columnas a la tabla stg_conexion_empresa para soportar el adapter
SFTP funcional del módulo STG (Paquete 3):

  - carpeta_recepcion : ruta relativa donde el STG deja ficheros S0X.
                         Admite plantillas {anio}/{mes}/{mes_actual}/{mes_anterior}.
  - carpeta_envio     : ruta relativa donde se subirán peticiones (Paquete 5).
                         FIJA, sin plantillas.
  - usar_tls          : True (SFTP estándar sobre SSH) — boolean con default True.

No toca nada del resto del esquema. Compatible con la tabla creada en la
migración f8a9b0c1d2e3.

Revision ID: f9a0b1c2d3e4
Revises: f8a9b0c1d2e3
Create Date: 2026-06-02 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "stg_conexion_empresa",
        sa.Column("carpeta_recepcion", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "stg_conexion_empresa",
        sa.Column("carpeta_envio", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "stg_conexion_empresa",
        sa.Column("usar_tls", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("stg_conexion_empresa", "usar_tls")
    op.drop_column("stg_conexion_empresa", "carpeta_envio")
    op.drop_column("stg_conexion_empresa", "carpeta_recepcion")
