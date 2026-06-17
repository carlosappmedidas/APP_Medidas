"""ERP M1: persona_contacto en titular (campo propio, no SIPS; solo juridica)

Revision ID: erp_m1_persona_contacto
Revises: c0d1e2f3a4b5
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "erp_m1_persona_contacto"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("erp_titular", sa.Column("persona_contacto", sa.String(length=120), nullable=True))


def downgrade():
    op.drop_column("erp_titular", "persona_contacto")
