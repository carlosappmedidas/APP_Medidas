"""add descargar_desde to ftp_sync_rule

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'f5a6b7c8d9e0'
down_revision = 'e4f5a6b7c8d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('ftp_sync_rules',
        sa.Column('descargar_desde', sa.Date(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('ftp_sync_rules', 'descargar_desde')
