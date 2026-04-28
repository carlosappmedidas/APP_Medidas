"""add publicaciones automatizacion + alertas tables

Revision ID: u7v8w9x0y1z2
Revises: t6u7v8w9x0y1
Create Date: 2026-04-28 22:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "u7v8w9x0y1z2"
down_revision: Union[str, Sequence[str], None] = "t6u7v8w9x0y1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Tabla 1: publicaciones_automatizaciones ───────────────────────────
    op.create_table(
        "publicaciones_automatizaciones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("activa", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ultimo_run_at",  sa.DateTime(), nullable=True),
        sa.Column("ultimo_run_ok",  sa.Integer(),  nullable=True),
        sa.Column("ultimo_run_msg", sa.Text(),     nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "tenant_id", "tipo",
            name="uq_publicaciones_automatizaciones_tenant_tipo",
        ),
    )
    op.create_index(
        "ix_publicaciones_automatizaciones_tenant_id",
        "publicaciones_automatizaciones",
        ["tenant_id"],
    )
    op.create_index(
        "ix_publicaciones_automatizaciones_tipo",
        "publicaciones_automatizaciones",
        ["tipo"],
    )

    # ── Tabla 2: publicaciones_alertas ────────────────────────────────────
    op.create_table(
        "publicaciones_alertas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id",  sa.Integer(), sa.ForeignKey("tenants.id"),  nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("tipo",    sa.String(40), nullable=False),
        sa.Column("periodo", sa.String(10), nullable=False),
        sa.Column("fecha_hito", sa.DateTime(), nullable=True),
        sa.Column("num_pendientes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detalle_json",   sa.Text(),    nullable=True),
        sa.Column("severidad", sa.String(20), nullable=False, server_default="info"),
        sa.Column("estado",    sa.String(20), nullable=False, server_default="activa"),
        sa.Column("resuelta_at", sa.DateTime(), nullable=True),
        sa.Column("resuelta_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "tenant_id", "empresa_id", "tipo", "periodo",
            name="uq_publicaciones_alertas_empresa_tipo_periodo",
        ),
    )
    op.create_index(
        "ix_publicaciones_alertas_tenant_id",
        "publicaciones_alertas",
        ["tenant_id"],
    )
    op.create_index(
        "ix_publicaciones_alertas_empresa_id",
        "publicaciones_alertas",
        ["empresa_id"],
    )
    op.create_index(
        "ix_publicaciones_alertas_tipo",
        "publicaciones_alertas",
        ["tipo"],
    )
    op.create_index(
        "ix_publicaciones_alertas_periodo",
        "publicaciones_alertas",
        ["periodo"],
    )
    op.create_index(
        "ix_publicaciones_alertas_tenant_estado",
        "publicaciones_alertas",
        ["tenant_id", "estado"],
    )


def downgrade() -> None:
    op.drop_table("publicaciones_alertas")
    op.drop_table("publicaciones_automatizaciones")