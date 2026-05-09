"""create dias_festivos_madrid table

Revision ID: z2a3b4c5d6e7
Revises: y1z2a3b4c5d6
Create Date: 2026-05-09 18:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "z2a3b4c5d6e7"
down_revision: Union[str, None] = "y1z2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Crea la tabla `dias_festivos_madrid` para gestionar el calendario laboral
    Madrid (festivos nacionales + CCAA + Madrid capital) usado para el cálculo
    de plazos REE en el dashboard de envíos.

    La tabla nace vacía. Los festivos se calculan automáticamente "on-demand"
    desde el endpoint GET /calendario_laboral/festivos?anio=YYYY: si no
    existen registros para ese (tenant, anio), se calculan con el algoritmo
    de Gauss y se guardan en BD; en consultas siguientes se sirven desde BD
    (donde el usuario puede haberlos editado/desactivado manualmente).

    Columnas:
      - id, tenant_id (FK CASCADE), anio, fecha (DATE)
      - nombre (descriptivo: "Año Nuevo", "Jueves Santo", ...)
      - ambito: NACIONAL / CCAA / LOCAL
      - origen: AUTO (calculado) / MANUAL (creado o editado por el usuario)
      - activo: permite desactivar un festivo sin borrarlo
      - created_at / updated_at (TimestampMixin)

    UNIQUE (tenant_id, anio, fecha): un festivo por fecha y tenant.
    """
    op.create_table(
        "dias_festivos_madrid",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column(
            "tenant_id",
            sa.Integer,
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("anio", sa.Integer, nullable=False, index=True),
        sa.Column("fecha", sa.Date, nullable=False, index=True),
        sa.Column("nombre", sa.String(150), nullable=False),
        sa.Column("ambito", sa.String(20), nullable=False, server_default="NACIONAL"),
        sa.Column("origen", sa.String(20), nullable=False, server_default="AUTO"),
        sa.Column("activo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "tenant_id", "anio", "fecha",
            name="uq_dias_festivos_madrid_tenant_anio_fecha",
        ),
    )


def downgrade() -> None:
    op.drop_table("dias_festivos_madrid")
