"""add carpeta_aob a ftp_configs y modulo a ftp_sync_log

Revision ID: c7d8e9f0a1b2
Revises: p2q3r4s5t6u7
Create Date: 2026-04-19 23:55:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "p2q3r4s5t6u7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Carpeta AOB por conexión FTP (para la feature Descarga en Objeciones).
    # Admite paths dinámicos con {mes_actual} / {mes_anterior} o paths fijos.
    op.add_column(
        "ftp_configs",
        sa.Column("carpeta_aob", sa.String(length=500), nullable=True),
    )

    # Módulo origen de cada descarga registrada en el log.
    # Valores esperados: "comunicaciones" | "objeciones" | NULL (legacy).
    op.add_column(
        "ftp_sync_log",
        sa.Column("modulo", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ftp_sync_log", "modulo")
    op.drop_column("ftp_configs", "carpeta_aob")