"""create envios_m table

Revision ID: w9x0y1z2a3b4
Revises: v8w9x0y1z2a3
Create Date: 2026-05-09 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "w9x0y1z2a3b4"
down_revision: Union[str, None] = "v8w9x0y1z2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Crea la tabla `envios_m` para registrar los ficheros AGRECL/INMECL/MAGCL
    enviados desde APP Medidas al SFTP REE, junto con su estado de respuesta.

    Cabeceras del histórico:
      - tipo: AGRECL / INMECL / MAGCL (3 tipos soportados de momento)
      - codigo_ree_empresa: código REE distribuidora extraído del nombre
      - comercializadora_codigo: solo INMECL
      - periodo_anio / periodo_mes: solo INMECL/MAGCL (AGRECL no tiene)
      - fecha_generacion: del nombre del fichero
      - version: del nombre del fichero
      - m_clasificacion: M1 / M2 / M7 — calculado desde periodo+fecha,
        o seleccionado por el usuario para AGRECL
      - estado_ree: NULL (pendiente) / 'ok' / 'bad'
      - estado_ree_n: número de bad (bad2 → 2, bad3 → 3, NULL si ok)
    """
    op.create_table(
        "envios_m",
        sa.Column("id", sa.Integer, primary_key=True, index=True),

        # Multi-tenant
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer, sa.ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("codigo_ree_empresa", sa.String(10), nullable=False),

        # Tipo de fichero
        sa.Column("tipo", sa.String(10), nullable=False, index=True),     # AGRECL/INMECL/MAGCL
        sa.Column("comercializadora_codigo", sa.String(10), nullable=True),  # solo INMECL

        # Periodo de los datos (AGRECL no tiene)
        sa.Column("periodo_anio", sa.Integer, nullable=True),
        sa.Column("periodo_mes", sa.Integer, nullable=True),

        # Fecha de generación del fichero (siempre presente)
        sa.Column("fecha_generacion", sa.Date, nullable=False),
        sa.Column("version", sa.Integer, nullable=False, default=0),

        # Clasificación M1/M2/M7
        sa.Column("m_clasificacion", sa.String(5), nullable=False, index=True),  # 'M1' | 'M2' | 'M7'

        # Datos del fichero
        sa.Column("nombre_fichero", sa.String(500), nullable=False, index=True),

        # Trazabilidad con FtpSyncLog
        sa.Column("ftp_log_id", sa.Integer, sa.ForeignKey("ftp_sync_log.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subido_sftp_at", sa.DateTime, nullable=False, server_default=sa.func.now()),

        # Estado REE
        sa.Column("estado_ree", sa.String(10), nullable=True),     # NULL | 'ok' | 'bad'
        sa.Column("estado_ree_n", sa.Integer, nullable=True),      # 2 = .bad2, 3 = .bad3...
        sa.Column("respuesta_recibida_at", sa.DateTime, nullable=True),
        sa.Column("respuesta_nombre_fichero", sa.String(500), nullable=True),  # nombre del .ok/.bad
        sa.Column("reintentos", sa.Integer, nullable=False, default=0),

        # Timestamps
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    # Índices útiles para filtros del histórico
    op.create_index("ix_envios_m_tenant_m", "envios_m", ["tenant_id", "m_clasificacion"])
    op.create_index("ix_envios_m_periodo", "envios_m", ["periodo_anio", "periodo_mes"])
    op.create_index("ix_envios_m_estado", "envios_m", ["estado_ree"])


def downgrade() -> None:
    op.drop_index("ix_envios_m_estado", table_name="envios_m")
    op.drop_index("ix_envios_m_periodo", table_name="envios_m")
    op.drop_index("ix_envios_m_tenant_m", table_name="envios_m")
    op.drop_table("envios_m")