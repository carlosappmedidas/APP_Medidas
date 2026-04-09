"""add fecha_ftp to ftp_sync_log

Revision ID: a7b8c9d0e1f2
Revises: f5a6b7c8d9e0
Create Date: 2026-04-10

"""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9d0e1f2'
down_revision = 'f5a6b7c8d9e0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('ftp_sync_log', sa.Column('fecha_ftp', sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column('ftp_sync_log', 'fecha_ftp')
