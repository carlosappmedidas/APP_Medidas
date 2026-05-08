"""add carpeta_entrada_general and carpeta_salida to ftp_configs

Revision ID: v8w9x0y1z2a3
Revises: u7v8w9x0y1z2
Create Date: 2026-05-08 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "v8w9x0y1z2a3"
down_revision: Union[str, None] = "u7v8w9x0y1z2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Añade dos columnas opcionales a ftp_configs:
      - carpeta_entrada_general: ruta SFTP donde están los ficheros de entrada
        general (ej: M1, MAGCL...). Admite plantillas {mes_actual}/{mes_anterior}.
        Si es NULL, se usa directorio_remoto como antes.
      - carpeta_salida: ruta SFTP donde el usuario sube ficheros desde la UI.
        Es FIJA (no admite plantillas) porque solo se sube allí, nunca se busca.
        Si es NULL, no se muestra el botón de subir en el explorador.
    """
    op.add_column(
        "ftp_configs",
        sa.Column("carpeta_entrada_general", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "ftp_configs",
        sa.Column("carpeta_salida", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ftp_configs", "carpeta_salida")
    op.drop_column("ftp_configs", "carpeta_entrada_general")