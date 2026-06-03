"""paquete 6: stg_contador + stg_medida + parse_error

Añade:
  - tabla stg_contador (contadores físicos detectados en los S24)
  - tabla stg_medida   (medidas/eventos parseados de los ficheros)
  - columna parse_error (TEXT) en stg_fichero_recibido

Revision ID: h2b3c4d5e6f7
Revises: g1a2b3c4d5e6
Create Date: 2026-06-03 01:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = "h2b3c4d5e6f7"
down_revision: Union[str, None] = "g1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------------
    # 1) parse_error en stg_fichero_recibido
    # ---------------------------------------------------------------
    op.add_column(
        "stg_fichero_recibido",
        sa.Column("parse_error", sa.Text(), nullable=True),
    )

    # ---------------------------------------------------------------
    # 2) Tabla stg_contador
    # ---------------------------------------------------------------
    op.create_table(
        "stg_contador",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False, index=True),
        sa.Column(
            "concentrador_id",
            sa.Integer(),
            sa.ForeignKey("stg_concentrador.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "cups_id",
            sa.Integer(),
            sa.ForeignKey("stg_cups.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("meter_id", sa.String(length=50), nullable=False),
        sa.Column("fabricante", sa.String(length=10), nullable=True),
        sa.Column("ultimo_contacto", sa.DateTime(), nullable=True),
        sa.Column(
            "estado_comunicacion",
            sa.String(length=20),
            nullable=False,
            server_default="desconocido",
        ),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("empresa_id", "meter_id", name="uq_stg_contador_empresa_meter"),
    )
    op.create_index(
        "ix_stg_contador_meter_id",
        "stg_contador",
        ["meter_id"],
    )

    # ---------------------------------------------------------------
    # 3) Tabla stg_medida
    # ---------------------------------------------------------------
    op.create_table(
        "stg_medida",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False, index=True),
        sa.Column(
            "fichero_id",
            sa.Integer(),
            sa.ForeignKey("stg_fichero_recibido.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "concentrador_id",
            sa.Integer(),
            sa.ForeignKey("stg_concentrador.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "contador_id",
            sa.Integer(),
            sa.ForeignKey("stg_contador.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("tipo_fichero", sa.String(length=10), nullable=False, index=True),
        sa.Column("timestamp_dato", sa.DateTime(), nullable=True, index=True),
        # Backups textuales (útil si los FK no se resuelven)
        sa.Column("concentrador_externo_id", sa.String(length=50), nullable=True),
        sa.Column("meter_id", sa.String(length=50), nullable=True),
        # Datos específicos por tipo
        sa.Column("datos", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_stg_medida_meter_id",
        "stg_medida",
        ["meter_id"],
    )
    # Índice compuesto típico: medidas de un contador en una ventana temporal
    op.create_index(
        "ix_stg_medida_contador_ts",
        "stg_medida",
        ["contador_id", "timestamp_dato"],
    )


def downgrade() -> None:
    op.drop_index("ix_stg_medida_contador_ts", table_name="stg_medida")
    op.drop_index("ix_stg_medida_meter_id", table_name="stg_medida")
    op.drop_table("stg_medida")

    op.drop_index("ix_stg_contador_meter_id", table_name="stg_contador")
    op.drop_table("stg_contador")

    op.drop_column("stg_fichero_recibido", "parse_error")
