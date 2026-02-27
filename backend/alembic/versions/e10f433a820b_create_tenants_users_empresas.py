"""create tenants, users y empresas

Revision ID: e10f433a820b
Revises: 
Create Date: 2026-02-12 19:00:00.000000
"""

# pyright: reportMissingImports=false, reportAttributeAccessIssue=false

from typing import Sequence, Union

from alembic import op  # type: ignore[attr-defined]  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "e10f433a820b"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Crear tablas tenants, users y empresas (si este script era para eso).

    Si ya tienes el código de creación de tablas en este fichero,
    ponlo aquí dentro. De momento lo dejo vacío para que Alembic
    deje de quejarse.
    """
    pass


def downgrade() -> None:
    """Operación inversa: borrar tablas/etc si lo necesitas."""
    pass