"""create_comunicaciones_tables

Revision ID: f1a2b3c4d5e6
Revises: e3f1a2b4c5d6
Create Date: 2026-04-08

Crea las 2 tablas del módulo de comunicaciones FTP:
- ftp_configs: configuración de conexión FTPS por empresa
- ftp_sync_log: historial de descargas
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f7"
down_revision = "e3f1a2b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================
    # ftp_configs
    # Configuración de conexión FTPS por empresa
    # =========================================================
    op.create_table(
        "ftp_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("puerto", sa.Integer(), nullable=False, server_default="22221"),
        sa.Column("usuario", sa.String(100), nullable=False),
        sa.Column("password_cifrada", sa.Text(), nullable=False),
        sa.Column("directorio_remoto", sa.String(500), nullable=False, server_default="/"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_ftp_configs_tenant_id", "ftp_configs", ["tenant_id"])
    op.create_index("ix_ftp_configs_empresa_id", "ftp_configs", ["empresa_id"])
    op.create_index("ix_ftp_configs_tenant_empresa", "ftp_configs", ["tenant_id", "empresa_id"])

    # =========================================================
    # ftp_sync_log
    # Historial de descargas FTP
    # =========================================================
    op.create_table(
        "ftp_sync_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("nombre_fichero", sa.String(500), nullable=False),
        sa.Column("tamanio", sa.Integer(), nullable=True),
        sa.Column("estado", sa.String(10), nullable=False, server_default="ok"),
        sa.Column("mensaje_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_ftp_sync_log_tenant_id", "ftp_sync_log", ["tenant_id"])
    op.create_index("ix_ftp_sync_log_empresa_id", "ftp_sync_log", ["empresa_id"])
    op.create_index("ix_ftp_sync_log_created_at", "ftp_sync_log", ["created_at"])


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_ftp_sync_log_created_at")
    op.execute("DROP INDEX IF EXISTS ix_ftp_sync_log_empresa_id")
    op.execute("DROP INDEX IF EXISTS ix_ftp_sync_log_tenant_id")
    op.drop_table("ftp_sync_log")

    op.execute("DROP INDEX IF EXISTS ix_ftp_configs_tenant_empresa")
    op.execute("DROP INDEX IF EXISTS ix_ftp_configs_empresa_id")
    op.execute("DROP INDEX IF EXISTS ix_ftp_configs_tenant_id")
    op.drop_table("ftp_configs")
