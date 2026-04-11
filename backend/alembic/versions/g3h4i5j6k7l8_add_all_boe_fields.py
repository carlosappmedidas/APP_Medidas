"""add all missing BOE fields to linea_inventario, ct_inventario and cups_topologia

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-04-11

Añade todos los campos definidos en la Circular CNMC 8/2021 (BOE-A-2021-21003)
que no estaban guardados en BD para los ficheros B1, B2 y A1.
"""
from alembic import op
import sqlalchemy as sa

revision = "g3h4i5j6k7l8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:

    # ── linea_inventario (B1) ─────────────────────────────────────────────────
    op.add_column("linea_inventario", sa.Column("estado",                  sa.Integer(), nullable=True))
    op.add_column("linea_inventario", sa.Column("fecha_ip",                sa.Date(),    nullable=True))
    op.add_column("linea_inventario", sa.Column("tipo_inversion",          sa.Integer(), nullable=True))
    op.add_column("linea_inventario", sa.Column("motivacion",              sa.String(3), nullable=True))
    op.add_column("linea_inventario", sa.Column("im_tramites",             sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("im_construccion",         sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("im_trabajos",             sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("valor_auditado",          sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("financiado",              sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("subvenciones_europeas",   sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("subvenciones_nacionales", sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("subvenciones_prtr",       sa.Float(),   nullable=True))
    op.add_column("linea_inventario", sa.Column("cuenta",                  sa.String(),  nullable=True))
    op.add_column("linea_inventario", sa.Column("avifauna",                sa.Integer(), nullable=True))
    op.add_column("linea_inventario", sa.Column("identificador_baja",      sa.String(),  nullable=True))

    # ── ct_inventario (B2) ────────────────────────────────────────────────────
    op.add_column("ct_inventario", sa.Column("codigo_ccuu",             sa.String(),    nullable=True))
    op.add_column("ct_inventario", sa.Column("nudo_alta",               sa.String(),    nullable=True))
    op.add_column("ct_inventario", sa.Column("nudo_baja",               sa.String(),    nullable=True))
    op.add_column("ct_inventario", sa.Column("tension_construccion_kv", sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("provincia",               sa.String(2),   nullable=True))
    op.add_column("ct_inventario", sa.Column("ccaa",                    sa.String(2),   nullable=True))
    op.add_column("ct_inventario", sa.Column("zona",                    sa.String(2),   nullable=True))
    op.add_column("ct_inventario", sa.Column("estado",                  sa.Integer(),   nullable=True))
    op.add_column("ct_inventario", sa.Column("modelo",                  sa.String(1),   nullable=True))
    op.add_column("ct_inventario", sa.Column("punto_frontera",          sa.Integer(),   nullable=True))
    op.add_column("ct_inventario", sa.Column("causa_baja",              sa.Integer(),   nullable=True))
    op.add_column("ct_inventario", sa.Column("fecha_baja",              sa.Date(),      nullable=True))
    op.add_column("ct_inventario", sa.Column("fecha_ip",                sa.Date(),      nullable=True))
    op.add_column("ct_inventario", sa.Column("tipo_inversion",          sa.Integer(),   nullable=True))
    op.add_column("ct_inventario", sa.Column("financiado",              sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("im_tramites",             sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("im_construccion",         sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("im_trabajos",             sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("subvenciones_europeas",   sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("subvenciones_nacionales", sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("subvenciones_prtr",       sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("valor_auditado",          sa.Float(),     nullable=True))
    op.add_column("ct_inventario", sa.Column("cuenta",                  sa.String(),    nullable=True))
    op.add_column("ct_inventario", sa.Column("motivacion",              sa.String(3),   nullable=True))
    op.add_column("ct_inventario", sa.Column("avifauna",                sa.Integer(),   nullable=True))
    op.add_column("ct_inventario", sa.Column("identificador_baja",      sa.String(),    nullable=True))

    # ── cups_topologia (A1) ───────────────────────────────────────────────────
    op.add_column("cups_topologia", sa.Column("cnae",                    sa.String(5),  nullable=True))
    op.add_column("cups_topologia", sa.Column("municipio",               sa.String(4),  nullable=True))
    op.add_column("cups_topologia", sa.Column("provincia",               sa.String(2),  nullable=True))
    op.add_column("cups_topologia", sa.Column("zona",                    sa.String(2),  nullable=True))
    op.add_column("cups_topologia", sa.Column("conexion",                sa.String(1),  nullable=True))
    op.add_column("cups_topologia", sa.Column("estado_contrato",         sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("potencia_adscrita_kw",    sa.Float(),    nullable=True))
    op.add_column("cups_topologia", sa.Column("energia_activa_kwh",      sa.Float(),    nullable=True))
    op.add_column("cups_topologia", sa.Column("energia_reactiva_kvarh",  sa.Float(),    nullable=True))
    op.add_column("cups_topologia", sa.Column("lecturas",                sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("baja_suministro",         sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("cambio_titularidad",      sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("facturas_estimadas",      sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("facturas_total",          sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("cau",                     sa.String(),   nullable=True))
    op.add_column("cups_topologia", sa.Column("cod_auto",                sa.String(3),  nullable=True))
    op.add_column("cups_topologia", sa.Column("cod_generacion_auto",     sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("conexion_autoconsumo",    sa.Integer(),  nullable=True))
    op.add_column("cups_topologia", sa.Column("energia_autoconsumida_kwh",  sa.Float(), nullable=True))
    op.add_column("cups_topologia", sa.Column("energia_excedentaria_kwh",   sa.Float(), nullable=True))


def downgrade() -> None:
    # cups_topologia
    for col in ["energia_excedentaria_kwh", "energia_autoconsumida_kwh",
                "conexion_autoconsumo", "cod_generacion_auto", "cod_auto", "cau",
                "facturas_total", "facturas_estimadas", "cambio_titularidad",
                "baja_suministro", "lecturas", "energia_reactiva_kvarh",
                "energia_activa_kwh", "potencia_adscrita_kw", "estado_contrato",
                "conexion", "zona", "provincia", "municipio", "cnae"]:
        op.drop_column("cups_topologia", col)

    # ct_inventario
    for col in ["identificador_baja", "avifauna", "motivacion", "cuenta",
                "valor_auditado", "subvenciones_prtr", "subvenciones_nacionales",
                "subvenciones_europeas", "im_trabajos", "im_construccion", "im_tramites",
                "financiado", "tipo_inversion", "fecha_ip", "fecha_baja", "causa_baja",
                "punto_frontera", "modelo", "estado", "zona", "ccaa", "provincia",
                "tension_construccion_kv", "nudo_baja", "nudo_alta", "codigo_ccuu"]:
        op.drop_column("ct_inventario", col)

    # linea_inventario
    for col in ["identificador_baja", "avifauna", "cuenta", "subvenciones_prtr",
                "subvenciones_nacionales", "subvenciones_europeas", "financiado",
                "valor_auditado", "im_trabajos", "im_construccion", "im_tramites",
                "motivacion", "tipo_inversion", "fecha_ip", "estado"]:
        op.drop_column("linea_inventario", col)
