"""add carpeta_salida_general to ftp_configs

Revision ID: y1z2a3b4c5d6
Revises: x0y1z2a3b4c5
Create Date: 2026-05-09 14:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "y1z2a3b4c5d6"
down_revision: Union[str, None] = "x0y1z2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Añade `carpeta_salida_general` a ftp_configs:
      - Se usa para localizar ficheros AGRECL/INMECL/MAGCL ya enviados
        cuando REE los movió de `carpeta_salida` a la carpeta de
        histórico de salida (típicamente `/01/salidaHistorico`).
      - Admite plantillas {mes_actual}/{mes_anterior} igual que
        `carpeta_entrada_general`.
      - NULL = no configurada (no se podrán descargar ficheros enviados
        históricos desde el módulo Envíos).
    """
    op.add_column(
        "ftp_configs",
        sa.Column("carpeta_salida_general", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ftp_configs", "carpeta_salida_general")