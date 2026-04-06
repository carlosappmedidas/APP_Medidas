"""create_alerts_system

Revision ID: d1e2f3a4b5c6
Revises: 52bb439d4f37
Create Date: 2026-04-05

Crea el sistema de alertas completo desde cero:
  - alert_rule_catalog        (con category y comparison_type)
  - empresa_alert_rule_configs
  - alert_results             (con lifecycle_status, resolved_by, resolved_at)
  - alert_comments            (historial de comentarios)
  - Seed de las 22 reglas     (6 mes_anterior + 10 absoluta + 6 anio_anterior)
"""
from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "515f318fb05c"
branch_labels = None
depends_on = None


def upgrade() -> None:

    # =========================================================
    # alert_rule_catalog
    # =========================================================
    op.create_table(
        "alert_rule_catalog",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("metric_field", sa.String(100), nullable=False),
        sa.Column("diff_unit", sa.String(10), nullable=False),
        sa.Column("default_threshold", sa.Float(), nullable=False),
        sa.Column("default_severity", sa.String(20), nullable=False, server_default="warning"),
        sa.Column("active_by_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        # Nuevos: categoría y tipo de comparación
        sa.Column("category", sa.String(50), nullable=False, server_default="mes_anterior"),
        sa.Column("comparison_type", sa.String(30), nullable=False, server_default="vs_prev_month"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_alert_rule_catalog_code"),
    )
    op.create_index("ix_alert_rule_catalog_code", "alert_rule_catalog", ["code"])
    op.create_index("ix_alert_rule_catalog_category", "alert_rule_catalog", ["category"])

    # =========================================================
    # empresa_alert_rule_configs
    # =========================================================
    op.create_table(
        "empresa_alert_rule_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("alert_code", sa.String(100), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("threshold_value", sa.Float(), nullable=True),
        sa.Column("severity", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["alert_code"], ["alert_rule_catalog.code"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "empresa_id", "alert_code", name="uq_empresa_alert_rule_config"),
    )
    op.create_index("ix_empresa_alert_rule_configs_tenant_id", "empresa_alert_rule_configs", ["tenant_id"])
    op.create_index("ix_empresa_alert_rule_configs_empresa_id", "empresa_alert_rule_configs", ["empresa_id"])
    op.create_index("ix_empresa_alert_rule_configs_alert_code", "empresa_alert_rule_configs", ["alert_code"])

    # =========================================================
    # alert_results
    # =========================================================
    op.create_table(
        "alert_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("alert_code", sa.String(100), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("current_value", sa.Float(), nullable=True),
        sa.Column("previous_value", sa.Float(), nullable=True),
        sa.Column("diff_value", sa.Float(), nullable=True),
        sa.Column("diff_unit", sa.String(10), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        # Ciclo de vida
        sa.Column("lifecycle_status", sa.String(30), nullable=False, server_default="nueva"),
        sa.Column("resolved_by", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["alert_code"], ["alert_rule_catalog.code"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "tenant_id", "empresa_id", "alert_code", "anio", "mes",
            name="uq_alert_result_unique_period",
        ),
    )
    op.create_index("ix_alert_results_tenant_id", "alert_results", ["tenant_id"])
    op.create_index("ix_alert_results_empresa_id", "alert_results", ["empresa_id"])
    op.create_index("ix_alert_results_alert_code", "alert_results", ["alert_code"])
    op.create_index("ix_alert_results_status", "alert_results", ["status"])
    op.create_index("ix_alert_results_severity", "alert_results", ["severity"])
    op.create_index("ix_alert_results_lifecycle_status", "alert_results", ["lifecycle_status"])
    op.create_index("ix_alert_results_anio", "alert_results", ["anio"])
    op.create_index("ix_alert_results_mes", "alert_results", ["mes"])
    op.create_index(
        "ix_alert_results_empresa_period",
        "alert_results",
        ["tenant_id", "empresa_id", "anio", "mes"],
    )

    # =========================================================
    # alert_comments
    # =========================================================
    op.create_table(
        "alert_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("lifecycle_status_at_time", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["alert_id"], ["alert_results.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_alert_comments_alert_id", "alert_comments", ["alert_id"])
    op.create_index("ix_alert_comments_user_id", "alert_comments", ["user_id"])

    # =========================================================
    # Seed — 22 reglas completas
    # =========================================================
    catalog_table = sa.table(
        "alert_rule_catalog",
        sa.column("code", sa.String),
        sa.column("nombre", sa.String),
        sa.column("descripcion", sa.Text),
        sa.column("metric_field", sa.String),
        sa.column("diff_unit", sa.String),
        sa.column("default_threshold", sa.Float),
        sa.column("default_severity", sa.String),
        sa.column("active_by_default", sa.Boolean),
        sa.column("category", sa.String),
        sa.column("comparison_type", sa.String),
    )

    op.bulk_insert(catalog_table, [

        # ── CATEGORÍA 1: MES ANTERIOR ──────────────────────────────────
        {
            "code": "energia_bruta_vs_mes_anterior_pct",
            "nombre": "Variación energía bruta vs mes anterior",
            "descripcion": "Compara la energía bruta facturada del mes con la del mes anterior en porcentaje.",
            "metric_field": "energia_bruta_facturada",
            "diff_unit": "%",
            "default_threshold": 10.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "mes_anterior",
            "comparison_type": "vs_prev_month",
        },
        {
            "code": "perdidas_m1_vs_mes_anterior_pp",
            "nombre": "Variación pérdidas M1 vs mes anterior",
            "descripcion": "Compara las pérdidas M1 del mes con el mes anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_pct",
            "diff_unit": "pp",
            "default_threshold": 2.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "mes_anterior",
            "comparison_type": "vs_prev_month",
        },
        {
            "code": "perdidas_m2_vs_mes_anterior_pp",
            "nombre": "Variación pérdidas M2 vs mes anterior",
            "descripcion": "Compara las pérdidas M2 del mes con el mes anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_m2_pct",
            "diff_unit": "pp",
            "default_threshold": 2.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "mes_anterior",
            "comparison_type": "vs_prev_month",
        },
        {
            "code": "perdidas_m7_vs_mes_anterior_pp",
            "nombre": "Variación pérdidas M7 vs mes anterior",
            "descripcion": "Compara las pérdidas M7 del mes con el mes anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_m7_pct",
            "diff_unit": "pp",
            "default_threshold": 1.5,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "mes_anterior",
            "comparison_type": "vs_prev_month",
        },
        {
            "code": "perdidas_m11_vs_mes_anterior_pp",
            "nombre": "Variación pérdidas M11 vs mes anterior",
            "descripcion": "Compara las pérdidas M11 del mes con el mes anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_m11_pct",
            "diff_unit": "pp",
            "default_threshold": 1.5,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "mes_anterior",
            "comparison_type": "vs_prev_month",
        },
        {
            "code": "perdidas_art15_vs_mes_anterior_pp",
            "nombre": "Variación pérdidas ART15 vs mes anterior",
            "descripcion": "Compara las pérdidas ART15 del mes con el mes anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_art15_pct",
            "diff_unit": "pp",
            "default_threshold": 2.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "mes_anterior",
            "comparison_type": "vs_prev_month",
        },

        # ── CATEGORÍA 2: ABSOLUTA — por encima de umbral ───────────────
        {
            "code": "perdidas_m1_absoluta_alta",
            "nombre": "Pérdidas M1 por encima de umbral",
            "descripcion": "Las pérdidas M1 superan el umbral máximo configurado.",
            "metric_field": "perdidas_e_facturada_pct",
            "diff_unit": "%",
            "default_threshold": 12.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_above",
        },
        {
            "code": "perdidas_m2_absoluta_alta",
            "nombre": "Pérdidas M2 por encima de umbral",
            "descripcion": "Las pérdidas M2 superan el umbral máximo configurado.",
            "metric_field": "perdidas_e_facturada_m2_pct",
            "diff_unit": "%",
            "default_threshold": 12.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_above",
        },
        {
            "code": "perdidas_m7_absoluta_alta",
            "nombre": "Pérdidas M7 por encima de umbral",
            "descripcion": "Las pérdidas M7 superan el umbral máximo configurado.",
            "metric_field": "perdidas_e_facturada_m7_pct",
            "diff_unit": "%",
            "default_threshold": 12.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_above",
        },
        {
            "code": "perdidas_m11_absoluta_alta",
            "nombre": "Pérdidas M11 por encima de umbral",
            "descripcion": "Las pérdidas M11 superan el umbral máximo configurado.",
            "metric_field": "perdidas_e_facturada_m11_pct",
            "diff_unit": "%",
            "default_threshold": 12.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_above",
        },
        {
            "code": "perdidas_art15_absoluta_alta",
            "nombre": "Pérdidas ART15 por encima de umbral",
            "descripcion": "Las pérdidas ART15 superan el umbral máximo configurado.",
            "metric_field": "perdidas_e_facturada_art15_pct",
            "diff_unit": "%",
            "default_threshold": 12.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_above",
        },

        # ── CATEGORÍA 2: ABSOLUTA — negativas ─────────────────────────
        {
            "code": "perdidas_m1_negativas",
            "nombre": "Pérdidas M1 negativas",
            "descripcion": "Las pérdidas M1 son negativas, lo que indica una anomalía en los datos.",
            "metric_field": "perdidas_e_facturada_pct",
            "diff_unit": "%",
            "default_threshold": 0.0,
            "default_severity": "critical",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_below",
        },
        {
            "code": "perdidas_m2_negativas",
            "nombre": "Pérdidas M2 negativas",
            "descripcion": "Las pérdidas M2 son negativas, lo que indica una anomalía en los datos.",
            "metric_field": "perdidas_e_facturada_m2_pct",
            "diff_unit": "%",
            "default_threshold": 0.0,
            "default_severity": "critical",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_below",
        },
        {
            "code": "perdidas_m7_negativas",
            "nombre": "Pérdidas M7 negativas",
            "descripcion": "Las pérdidas M7 son negativas, lo que indica una anomalía en los datos.",
            "metric_field": "perdidas_e_facturada_m7_pct",
            "diff_unit": "%",
            "default_threshold": 0.0,
            "default_severity": "critical",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_below",
        },
        {
            "code": "perdidas_m11_negativas",
            "nombre": "Pérdidas M11 negativas",
            "descripcion": "Las pérdidas M11 son negativas, lo que indica una anomalía en los datos.",
            "metric_field": "perdidas_e_facturada_m11_pct",
            "diff_unit": "%",
            "default_threshold": 0.0,
            "default_severity": "critical",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_below",
        },
        {
            "code": "perdidas_art15_negativas",
            "nombre": "Pérdidas ART15 negativas",
            "descripcion": "Las pérdidas ART15 son negativas, lo que indica una anomalía en los datos.",
            "metric_field": "perdidas_e_facturada_art15_pct",
            "diff_unit": "%",
            "default_threshold": 0.0,
            "default_severity": "critical",
            "active_by_default": True,
            "category": "absoluta",
            "comparison_type": "absolute_below",
        },

        # ── CATEGORÍA 3: AÑO ANTERIOR ──────────────────────────────────
        {
            "code": "energia_bruta_vs_anio_anterior_pct",
            "nombre": "Variación energía bruta vs año anterior",
            "descripcion": "Compara la energía bruta facturada del mes con el mismo mes del año anterior.",
            "metric_field": "energia_bruta_facturada",
            "diff_unit": "%",
            "default_threshold": 15.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "anio_anterior",
            "comparison_type": "vs_prev_year",
        },
        {
            "code": "perdidas_m1_vs_anio_anterior_pp",
            "nombre": "Variación pérdidas M1 vs año anterior",
            "descripcion": "Compara las pérdidas M1 del mes con el mismo mes del año anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_pct",
            "diff_unit": "pp",
            "default_threshold": 3.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "anio_anterior",
            "comparison_type": "vs_prev_year",
        },
        {
            "code": "perdidas_m2_vs_anio_anterior_pp",
            "nombre": "Variación pérdidas M2 vs año anterior",
            "descripcion": "Compara las pérdidas M2 del mes con el mismo mes del año anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_m2_pct",
            "diff_unit": "pp",
            "default_threshold": 3.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "anio_anterior",
            "comparison_type": "vs_prev_year",
        },
        {
            "code": "perdidas_m7_vs_anio_anterior_pp",
            "nombre": "Variación pérdidas M7 vs año anterior",
            "descripcion": "Compara las pérdidas M7 del mes con el mismo mes del año anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_m7_pct",
            "diff_unit": "pp",
            "default_threshold": 2.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "anio_anterior",
            "comparison_type": "vs_prev_year",
        },
        {
            "code": "perdidas_m11_vs_anio_anterior_pp",
            "nombre": "Variación pérdidas M11 vs año anterior",
            "descripcion": "Compara las pérdidas M11 del mes con el mismo mes del año anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_m11_pct",
            "diff_unit": "pp",
            "default_threshold": 2.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "anio_anterior",
            "comparison_type": "vs_prev_year",
        },
        {
            "code": "perdidas_art15_vs_anio_anterior_pp",
            "nombre": "Variación pérdidas ART15 vs año anterior",
            "descripcion": "Compara las pérdidas ART15 del mes con el mismo mes del año anterior en puntos porcentuales.",
            "metric_field": "perdidas_e_facturada_art15_pct",
            "diff_unit": "pp",
            "default_threshold": 3.0,
            "default_severity": "warning",
            "active_by_default": True,
            "category": "anio_anterior",
            "comparison_type": "vs_prev_year",
        },
    ])


def downgrade() -> None:
    op.drop_index("ix_alert_comments_user_id", table_name="alert_comments")
    op.drop_index("ix_alert_comments_alert_id", table_name="alert_comments")
    op.drop_table("alert_comments")

    op.drop_index("ix_alert_results_empresa_period", table_name="alert_results")
    op.drop_index("ix_alert_results_mes", table_name="alert_results")
    op.drop_index("ix_alert_results_anio", table_name="alert_results")
    op.drop_index("ix_alert_results_lifecycle_status", table_name="alert_results")
    op.drop_index("ix_alert_results_severity", table_name="alert_results")
    op.drop_index("ix_alert_results_status", table_name="alert_results")
    op.drop_index("ix_alert_results_alert_code", table_name="alert_results")
    op.drop_index("ix_alert_results_empresa_id", table_name="alert_results")
    op.drop_index("ix_alert_results_tenant_id", table_name="alert_results")
    op.drop_table("alert_results")

    op.drop_index("ix_empresa_alert_rule_configs_alert_code", table_name="empresa_alert_rule_configs")
    op.drop_index("ix_empresa_alert_rule_configs_empresa_id", table_name="empresa_alert_rule_configs")
    op.drop_index("ix_empresa_alert_rule_configs_tenant_id", table_name="empresa_alert_rule_configs")
    op.drop_table("empresa_alert_rule_configs")

    op.drop_index("ix_alert_rule_catalog_category", table_name="alert_rule_catalog")
    op.drop_index("ix_alert_rule_catalog_code", table_name="alert_rule_catalog")
    op.drop_table("alert_rule_catalog")