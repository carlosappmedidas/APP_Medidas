"""add sftp enviado to objeciones

Revision ID: n0o1p2q3r4s5
Revises: m9n0o1p2q3r4
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'n0o1p2q3r4s5'
down_revision = 'm9n0o1p2q3r4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for tabla in ["objeciones_agrecl", "objeciones_incl", "objeciones_cups", "objeciones_cil"]:
        op.add_column(tabla, sa.Column("enviado_sftp_at", sa.DateTime(), nullable=True))
        op.add_column(tabla, sa.Column("enviado_sftp_config_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    for tabla in ["objeciones_agrecl", "objeciones_incl", "objeciones_cups", "objeciones_cil"]:
        op.drop_column(tabla, "enviado_sftp_at")
        op.drop_column(tabla, "enviado_sftp_config_id")
