from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# OJO: deja estos valores como estén generados en tu archivo
revision: str = "abcd1234..."              # el que te haya puesto Alembic
down_revision: Union[str, Sequence[str], None] = "9f3d832068aa"  # la head anterior (la de medidas v2)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Añadir nueva columna
    op.add_column(
        "medidas_general",
        sa.Column("energia_bruta_facturada", sa.Float(), nullable=True),
    )

    # 2) Eliminar la antigua columna (si existe)
    #    Asumimos que se llamaba energia_total_kwh
    op.drop_column("medidas_general", "energia_total_kwh")


def downgrade() -> None:
    # Hacemos lo inverso, por si acaso
    op.add_column(
        "medidas_general",
        sa.Column("energia_total_kwh", sa.Float(), nullable=True),
    )
    op.drop_column("medidas_general", "energia_bruta_facturada")