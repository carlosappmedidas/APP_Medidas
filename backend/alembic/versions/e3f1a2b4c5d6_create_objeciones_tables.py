"""create_objeciones_tables

Revision ID: e3f1a2b4c5d6
Revises: 52bb439d4f37
Create Date: 2026-04-07

Crea las 4 tablas del módulo de objeciones:
- objeciones_agrecl  (AOBAGRECL — objeciones agregadas)
- objeciones_incl    (OBJEINCL  — objeciones incrementales por CUPS)
- objeciones_cups    (AOBCUPS   — objeciones por CUPS con ID)
- objeciones_cil     (AOBCIL    — objeciones por CIL)
"""

from alembic import op
import sqlalchemy as sa

revision = "e3f1a2b4c5d6"
down_revision = "52bb439d4f37"
branch_labels = None
depends_on = None


def upgrade() -> None:

    # =========================================================
    # objeciones_agrecl
    # Fichero entrada:   AOBAGRECL_DDDD_CCCC_AAAAMM_FFFFFFFF.0
    # Fichero respuesta: REOBAGRECL_DDDD_CCCC1_CCCC2_AAAAMM.0
    # =========================================================
    op.create_table(
        "objeciones_agrecl",
        sa.Column("id",              sa.Integer(), primary_key=True),
        sa.Column("tenant_id",       sa.Integer(), nullable=False),
        sa.Column("empresa_id",      sa.Integer(), nullable=False),
        sa.Column("nombre_fichero",  sa.String(255), nullable=True),
        sa.Column("id_objecion",     sa.String(100), nullable=True),
        sa.Column("distribuidor",    sa.String(20),  nullable=True),
        sa.Column("comercializador", sa.String(20),  nullable=True),
        sa.Column("nivel_tension",   sa.String(10),  nullable=True),
        sa.Column("tarifa_acceso",   sa.String(20),  nullable=True),
        sa.Column("disc_horaria",    sa.String(10),  nullable=True),
        sa.Column("tipo_punto",      sa.String(10),  nullable=True),
        sa.Column("provincia",       sa.String(10),  nullable=True),
        sa.Column("tipo_demanda",    sa.String(10),  nullable=True),
        sa.Column("periodo",         sa.String(10),  nullable=True),
        sa.Column("motivo",          sa.String(10),  nullable=True),
        sa.Column("magnitud",        sa.String(10),  nullable=True),
        sa.Column("e_publicada",     sa.Numeric(18, 3), nullable=True),
        sa.Column("e_propuesta",     sa.Numeric(18, 3), nullable=True),
        sa.Column("comentario_emisor",   sa.Text(), nullable=True),
        sa.Column("autoobjecion",    sa.String(1),  nullable=True),
        sa.Column("aceptacion",           sa.String(1),  nullable=True),
        sa.Column("motivo_no_aceptacion", sa.String(50), nullable=True),
        sa.Column("comentario_respuesta", sa.Text(),     nullable=True),
        sa.Column("respuesta_publicada",  sa.Integer(),  nullable=True, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"],  ["tenants.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_objeciones_agrecl_tenant_id",              "objeciones_agrecl", ["tenant_id"])
    op.create_index("ix_objeciones_agrecl_empresa_id",             "objeciones_agrecl", ["empresa_id"])
    op.create_index("ix_objeciones_agrecl_id_objecion",            "objeciones_agrecl", ["id_objecion"])
    op.create_index("ix_objeciones_agrecl_periodo",                "objeciones_agrecl", ["periodo"])
    op.create_index("ix_objeciones_agrecl_tenant_empresa_periodo",  "objeciones_agrecl", ["tenant_id", "empresa_id", "periodo"])

    # =========================================================
    # objeciones_incl
    # Fichero entrada:   OBJEINCL_CCCC_DDDD_AAAAMM_FFFFFFFF.0
    # Fichero respuesta: REOBJEINCL_DDDD_CCCC1_CCCC2_AAAAMM.0
    # =========================================================
    op.create_table(
        "objeciones_incl",
        sa.Column("id",             sa.Integer(), primary_key=True),
        sa.Column("tenant_id",      sa.Integer(), nullable=False),
        sa.Column("empresa_id",     sa.Integer(), nullable=False),
        sa.Column("nombre_fichero", sa.String(255), nullable=True),
        # OBJEINCL no lleva ID de objeción
        sa.Column("cups",           sa.String(30),  nullable=True),
        sa.Column("periodo",        sa.String(40),  nullable=True),
        sa.Column("motivo",         sa.String(10),  nullable=True),
        sa.Column("ae_publicada",   sa.Numeric(18, 3), nullable=True),
        sa.Column("ae_propuesta",   sa.Numeric(18, 3), nullable=True),
        sa.Column("as_publicada",   sa.Numeric(18, 3), nullable=True),
        sa.Column("as_propuesta",   sa.Numeric(18, 3), nullable=True),
        sa.Column("comentario_emisor",   sa.Text(), nullable=True),
        sa.Column("autoobjecion",   sa.String(1),  nullable=True),
        sa.Column("aceptacion",           sa.String(1),  nullable=True),
        sa.Column("motivo_no_aceptacion", sa.String(50), nullable=True),
        sa.Column("comentario_respuesta", sa.Text(),     nullable=True),
        sa.Column("respuesta_publicada",  sa.Integer(),  nullable=True, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"],  ["tenants.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_objeciones_incl_tenant_id",           "objeciones_incl", ["tenant_id"])
    op.create_index("ix_objeciones_incl_empresa_id",          "objeciones_incl", ["empresa_id"])
    op.create_index("ix_objeciones_incl_cups",                "objeciones_incl", ["cups"])
    op.create_index("ix_objeciones_incl_periodo",             "objeciones_incl", ["periodo"])
    op.create_index("ix_objeciones_incl_tenant_empresa_cups", "objeciones_incl", ["tenant_id", "empresa_id", "cups"])

    # =========================================================
    # objeciones_cups
    # Fichero entrada:   AOBCUPS_DDDD_CCCC_AAAAMM_FFFFFFFF.0
    # Fichero respuesta: REOBCUPS_DDDD_CCCC1_CCCC2_AAAAMM.0
    # =========================================================
    op.create_table(
        "objeciones_cups",
        sa.Column("id",             sa.Integer(), primary_key=True),
        sa.Column("tenant_id",      sa.Integer(), nullable=False),
        sa.Column("empresa_id",     sa.Integer(), nullable=False),
        sa.Column("nombre_fichero", sa.String(255), nullable=True),
        sa.Column("id_objecion",    sa.String(100), nullable=True),
        sa.Column("cups",           sa.String(30),  nullable=True),
        sa.Column("periodo",        sa.String(10),  nullable=True),
        sa.Column("motivo",         sa.String(10),  nullable=True),
        sa.Column("e_publicada",    sa.Numeric(18, 3), nullable=True),
        sa.Column("e_propuesta",    sa.Numeric(18, 3), nullable=True),
        sa.Column("comentario_emisor",   sa.Text(), nullable=True),
        sa.Column("autoobjecion",   sa.String(1),  nullable=True),
        sa.Column("magnitud",       sa.String(10),  nullable=True),
        sa.Column("aceptacion",           sa.String(1),  nullable=True),
        sa.Column("motivo_no_aceptacion", sa.String(50), nullable=True),
        sa.Column("comentario_respuesta", sa.Text(),     nullable=True),
        sa.Column("respuesta_publicada",  sa.Integer(),  nullable=True, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"],  ["tenants.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_objeciones_cups_tenant_id",              "objeciones_cups", ["tenant_id"])
    op.create_index("ix_objeciones_cups_empresa_id",             "objeciones_cups", ["empresa_id"])
    op.create_index("ix_objeciones_cups_id_objecion",            "objeciones_cups", ["id_objecion"])
    op.create_index("ix_objeciones_cups_cups",                   "objeciones_cups", ["cups"])
    op.create_index("ix_objeciones_cups_periodo",                "objeciones_cups", ["periodo"])
    op.create_index("ix_objeciones_cups_tenant_empresa_periodo",  "objeciones_cups", ["tenant_id", "empresa_id", "periodo"])

    # =========================================================
    # objeciones_cil
    # Fichero entrada:   AOBCIL_DDDD_CCCC_AAAAMM_FFFFFFFF.0
    # Fichero respuesta: REOBCIL_DDDD_RRRR1_RRRR2_AAAAMM.0
    # =========================================================
    op.create_table(
        "objeciones_cil",
        sa.Column("id",             sa.Integer(), primary_key=True),
        sa.Column("tenant_id",      sa.Integer(), nullable=False),
        sa.Column("empresa_id",     sa.Integer(), nullable=False),
        sa.Column("nombre_fichero", sa.String(255), nullable=True),
        sa.Column("id_objecion",    sa.String(100), nullable=True),
        sa.Column("cil",            sa.String(30),  nullable=True),
        sa.Column("periodo",        sa.String(10),  nullable=True),
        sa.Column("motivo",         sa.String(10),  nullable=True),
        sa.Column("eas_publicada",  sa.Numeric(18, 3), nullable=True),
        sa.Column("eas_propuesta",  sa.Numeric(18, 3), nullable=True),
        sa.Column("eq2_publicada",  sa.Numeric(18, 3), nullable=True),
        sa.Column("eq2_propuesta",  sa.Numeric(18, 3), nullable=True),
        sa.Column("eq3_publicada",  sa.Numeric(18, 3), nullable=True),
        sa.Column("eq3_propuesta",  sa.Numeric(18, 3), nullable=True),
        sa.Column("comentario_emisor",   sa.Text(), nullable=True),
        sa.Column("autoobjecion",   sa.String(1),  nullable=True),
        sa.Column("aceptacion",           sa.String(1),  nullable=True),
        sa.Column("motivo_no_aceptacion", sa.String(50), nullable=True),
        sa.Column("comentario_respuesta", sa.Text(),     nullable=True),
        sa.Column("respuesta_publicada",  sa.Integer(),  nullable=True, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"],  ["tenants.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_objeciones_cil_tenant_id",              "objeciones_cil", ["tenant_id"])
    op.create_index("ix_objeciones_cil_empresa_id",             "objeciones_cil", ["empresa_id"])
    op.create_index("ix_objeciones_cil_id_objecion",            "objeciones_cil", ["id_objecion"])
    op.create_index("ix_objeciones_cil_cil",                    "objeciones_cil", ["cil"])
    op.create_index("ix_objeciones_cil_periodo",                "objeciones_cil", ["periodo"])
    op.create_index("ix_objeciones_cil_tenant_empresa_periodo",  "objeciones_cil", ["tenant_id", "empresa_id", "periodo"])


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cil_tenant_empresa_periodo")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cil_periodo")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cil_cil")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cil_id_objecion")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cil_empresa_id")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cil_tenant_id")
    op.drop_table("objeciones_cil")

    op.execute("DROP INDEX IF EXISTS ix_objeciones_cups_tenant_empresa_periodo")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cups_periodo")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cups_cups")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cups_id_objecion")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cups_empresa_id")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_cups_tenant_id")
    op.drop_table("objeciones_cups")

    op.execute("DROP INDEX IF EXISTS ix_objeciones_incl_tenant_empresa_cups")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_incl_periodo")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_incl_cups")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_incl_empresa_id")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_incl_tenant_id")
    op.drop_table("objeciones_incl")

    op.execute("DROP INDEX IF EXISTS ix_objeciones_agrecl_tenant_empresa_periodo")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_agrecl_periodo")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_agrecl_id_objecion")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_agrecl_empresa_id")
    op.execute("DROP INDEX IF EXISTS ix_objeciones_agrecl_tenant_id")
    op.drop_table("objeciones_agrecl")