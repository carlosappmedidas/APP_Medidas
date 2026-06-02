"""create stg tables

Crea las 5 tablas iniciales del módulo STG (Sistema de Telegestión):
  - stg_conexion_empresa
  - stg_concentrador
  - stg_cups
  - stg_solicitud_fichero
  - stg_fichero_recibido

Todas con FK hacia tenants, empresas y users (tablas existentes).

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-06-02 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    # ----- stg_conexion_empresa -----
    op.create_table(
        "stg_conexion_empresa",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=True),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("host", sa.String(length=255), nullable=True),
        sa.Column("puerto", sa.Integer(), nullable=True),
        sa.Column("usuario", sa.String(length=255), nullable=True),
        sa.Column("password_cifrado", sa.Text(), nullable=True),
        sa.Column("ruta_base", sa.String(length=500), nullable=True),
        sa.Column("config_extra", sa.JSON(), nullable=True),
        sa.Column("ultimo_ping", sa.DateTime(), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="desconocido"),
        sa.Column("ultimo_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("empresa_id", name="uq_stg_conexion_empresa"),
    )
    op.create_index("ix_stg_conexion_empresa_tenant_id", "stg_conexion_empresa", ["tenant_id"])
    op.create_index("ix_stg_conexion_empresa_empresa_id", "stg_conexion_empresa", ["empresa_id"])

    # ----- stg_concentrador -----
    op.create_table(
        "stg_concentrador",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("codigo_ct", sa.String(length=50), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=True),
        sa.Column("numero_serie", sa.String(length=50), nullable=True),
        sa.Column("direccion", sa.String(length=500), nullable=True),
        sa.Column("municipio", sa.String(length=100), nullable=True),
        sa.Column("provincia", sa.String(length=100), nullable=True),
        sa.Column("codigo_postal", sa.String(length=10), nullable=True),
        sa.Column("latitud", sa.Float(), nullable=True),
        sa.Column("longitud", sa.Float(), nullable=True),
        sa.Column("ip", sa.String(length=50), nullable=True),
        sa.Column("fabricante", sa.String(length=100), nullable=True),
        sa.Column("modelo", sa.String(length=100), nullable=True),
        sa.Column("firmware", sa.String(length=50), nullable=True),
        sa.Column("protocolo_pmi", sa.String(length=30), nullable=True),
        sa.Column("numero_cups_asociados", sa.Integer(), nullable=True),
        sa.Column("ultimo_contacto", sa.DateTime(), nullable=True),
        sa.Column("estado_comunicacion", sa.String(length=20), nullable=False, server_default="desconocido"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("empresa_id", "codigo_ct", name="uq_stg_concentrador_empresa_ct"),
    )
    op.create_index("ix_stg_concentrador_tenant_id", "stg_concentrador", ["tenant_id"])
    op.create_index("ix_stg_concentrador_empresa_id", "stg_concentrador", ["empresa_id"])

    # ----- stg_cups -----
    op.create_table(
        "stg_cups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("cups", sa.String(length=22), nullable=False),
        sa.Column("concentrador_id", sa.Integer(), sa.ForeignKey("stg_concentrador.id"), nullable=True),
        sa.Column("numero_contador", sa.String(length=50), nullable=True),
        sa.Column("fabricante_contador", sa.String(length=100), nullable=True),
        sa.Column("modelo_contador", sa.String(length=100), nullable=True),
        sa.Column("tarifa", sa.String(length=20), nullable=True),
        sa.Column("tension_suministro", sa.String(length=10), nullable=True),
        sa.Column("tipo_punto_medida", sa.Integer(), nullable=True),
        sa.Column("direccion", sa.String(length=500), nullable=True),
        sa.Column("municipio", sa.String(length=100), nullable=True),
        sa.Column("provincia", sa.String(length=100), nullable=True),
        sa.Column("cp", sa.String(length=10), nullable=True),
        sa.Column("latitud", sa.Float(), nullable=True),
        sa.Column("longitud", sa.Float(), nullable=True),
        sa.Column("potencia_p1", sa.Float(), nullable=True),
        sa.Column("potencia_p2", sa.Float(), nullable=True),
        sa.Column("potencia_p3", sa.Float(), nullable=True),
        sa.Column("potencia_p4", sa.Float(), nullable=True),
        sa.Column("potencia_p5", sa.Float(), nullable=True),
        sa.Column("potencia_p6", sa.Float(), nullable=True),
        sa.Column("autoconsumo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cnae", sa.String(length=10), nullable=True),
        sa.Column("fecha_alta", sa.Date(), nullable=True),
        sa.Column("fecha_baja", sa.Date(), nullable=True),
        sa.Column("comercializadora_actual", sa.String(length=50), nullable=True),
        sa.Column("ultimo_contacto", sa.DateTime(), nullable=True),
        sa.Column("estado_comunicacion", sa.String(length=20), nullable=False, server_default="desconocido"),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("empresa_id", "cups", name="uq_stg_cups_empresa_cups"),
    )
    op.create_index("ix_stg_cups_tenant_id", "stg_cups", ["tenant_id"])
    op.create_index("ix_stg_cups_empresa_id", "stg_cups", ["empresa_id"])
    op.create_index("ix_stg_cups_cups", "stg_cups", ["cups"])
    op.create_index("ix_stg_cups_concentrador_id", "stg_cups", ["concentrador_id"])

    # ----- stg_solicitud_fichero -----
    op.create_table(
        "stg_solicitud_fichero",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("cups_id", sa.Integer(), sa.ForeignKey("stg_cups.id"), nullable=True),
        sa.Column("concentrador_id", sa.Integer(), sa.ForeignKey("stg_concentrador.id"), nullable=True),
        sa.Column("tipo_fichero", sa.String(length=10), nullable=False),
        sa.Column("fecha_desde", sa.Date(), nullable=False),
        sa.Column("fecha_hasta", sa.Date(), nullable=False),
        sa.Column("prioridad", sa.String(length=10), nullable=False, server_default="normal"),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="pendiente"),
        sa.Column("solicitado_por", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("mensaje_error", sa.Text(), nullable=True),
        sa.Column("fecha_envio", sa.DateTime(), nullable=True),
        sa.Column("fecha_recepcion", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_stg_solicitud_fichero_tenant_id", "stg_solicitud_fichero", ["tenant_id"])
    op.create_index("ix_stg_solicitud_fichero_empresa_id", "stg_solicitud_fichero", ["empresa_id"])
    op.create_index("ix_stg_solicitud_fichero_cups_id", "stg_solicitud_fichero", ["cups_id"])
    op.create_index("ix_stg_solicitud_fichero_concentrador_id", "stg_solicitud_fichero", ["concentrador_id"])
    op.create_index("ix_stg_solicitud_fichero_tipo_fichero", "stg_solicitud_fichero", ["tipo_fichero"])
    op.create_index("ix_stg_solicitud_fichero_estado", "stg_solicitud_fichero", ["estado"])

    # ----- stg_fichero_recibido -----
    op.create_table(
        "stg_fichero_recibido",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("solicitud_id", sa.Integer(), sa.ForeignKey("stg_solicitud_fichero.id"), nullable=True),
        sa.Column("cups_id", sa.Integer(), sa.ForeignKey("stg_cups.id"), nullable=True),
        sa.Column("tipo_fichero", sa.String(length=10), nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("nombre_original", sa.String(length=255), nullable=True),
        sa.Column("tamano_bytes", sa.Integer(), nullable=True),
        sa.Column("periodo_dato_desde", sa.Date(), nullable=True),
        sa.Column("periodo_dato_hasta", sa.Date(), nullable=True),
        sa.Column("parsed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("parsed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_stg_fichero_recibido_tenant_id", "stg_fichero_recibido", ["tenant_id"])
    op.create_index("ix_stg_fichero_recibido_empresa_id", "stg_fichero_recibido", ["empresa_id"])
    op.create_index("ix_stg_fichero_recibido_solicitud_id", "stg_fichero_recibido", ["solicitud_id"])
    op.create_index("ix_stg_fichero_recibido_cups_id", "stg_fichero_recibido", ["cups_id"])
    op.create_index("ix_stg_fichero_recibido_tipo_fichero", "stg_fichero_recibido", ["tipo_fichero"])


def downgrade() -> None:
    op.drop_table("stg_fichero_recibido")
    op.drop_table("stg_solicitud_fichero")
    op.drop_table("stg_cups")
    op.drop_table("stg_concentrador")
    op.drop_table("stg_conexion_empresa")
