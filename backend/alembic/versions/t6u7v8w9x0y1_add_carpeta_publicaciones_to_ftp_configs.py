"""add carpeta_publicaciones to ftp_configs

Revision ID: t6u7v8w9x0y1
Revises: s5t6u7v8w9x0
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = 't6u7v8w9x0y1'
down_revision = 's5t6u7v8w9x0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Carpeta SFTP donde se buscan ficheros publicados por REE (BALD, M1, PS, ...).
    # Paralelo a `carpeta_aob` (que es para AOB de Objeciones).
    # Admite paths fijos o dinámicos con {mes_actual}/{mes_anterior}.
    op.add_column(
        'ftp_configs',
        sa.Column('carpeta_publicaciones', sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('ftp_configs', 'carpeta_publicaciones')