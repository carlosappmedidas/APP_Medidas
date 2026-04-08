"""add ftp_sync_rules and update ftp_sync_log

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-08

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Tabla ftp_sync_rules ──────────────────────────────────────────────────
    op.create_table(
        "ftp_sync_rules",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("config_id", sa.Integer(), sa.ForeignKey("ftp_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nombre", sa.String(200), nullable=True),
        sa.Column("directorio", sa.String(500), nullable=False, server_default="/"),
        sa.Column("patron_nombre", sa.String(200), nullable=True),
        sa.Column("intervalo_horas", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ultima_ejecucion", sa.DateTime(), nullable=True),
        sa.Column("proxima_ejecucion", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # ── Nuevos campos en ftp_sync_log ─────────────────────────────────────────
    op.add_column(
        "ftp_sync_log",
        sa.Column("config_id", sa.Integer(), sa.ForeignKey("ftp_configs.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    op.add_column(
        "ftp_sync_log",
        sa.Column("rule_id", sa.Integer(), sa.ForeignKey("ftp_sync_rules.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    op.add_column(
        "ftp_sync_log",
        sa.Column("origen", sa.String(10), nullable=False, server_default="manual"),
    )


def downgrade() -> None:
    op.drop_column("ftp_sync_log", "origen")
    op.drop_column("ftp_sync_log", "rule_id")
    op.drop_column("ftp_sync_log", "config_id")
    op.drop_table("ftp_sync_rules")
