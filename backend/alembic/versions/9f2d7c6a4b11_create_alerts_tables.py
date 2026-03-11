"""create alerts tables

Revision ID: 9f2d7c6a4b11
Revises: 515f318fb05c
Create Date: 2026-03-11 12:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9f2d7c6a4b11"
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
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("nombre", sa.String(length=255), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("metric_field", sa.String(length=100), nullable=False),
        sa.Column("diff_unit", sa.String(length=10), nullable=False),
        sa.Column("default_threshold", sa.Float(), nullable=False),
        sa.Column("default_severity", sa.String(length=20), nullable=False, server_default="warning"),
        sa.Column("active_by_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_alert_rule_catalog_code"),
    )
    op.create_index(
        "ix_alert_rule_catalog_code",
        "alert_rule_catalog",
        ["code"],
        unique=False,
    )

    # =========================================================
    # empresa_alert_rule_configs
    # =========================================================
    op.create_table(
        "empresa_alert_rule_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("alert_code", sa.String(length=100), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("threshold_value", sa.Float(), nullable=True),
        sa.Column("severity", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["empresa_id"],
            ["empresas.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["alert_code"],
            ["alert_rule_catalog.code"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "empresa_id",
            "alert_code",
            name="uq_empresa_alert_rule_config",
        ),
    )
    op.create_index(
        "ix_empresa_alert_rule_configs_tenant_id",
        "empresa_alert_rule_configs",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_empresa_alert_rule_configs_empresa_id",
        "empresa_alert_rule_configs",
        ["empresa_id"],
        unique=False,
    )
    op.create_index(
        "ix_empresa_alert_rule_configs_alert_code",
        "empresa_alert_rule_configs",
        ["alert_code"],
        unique=False,
    )

    # =========================================================
    # alert_results
    # =========================================================
    op.create_table(
        "alert_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("alert_code", sa.String(length=100), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("current_value", sa.Float(), nullable=True),
        sa.Column("previous_value", sa.Float(), nullable=True),
        sa.Column("diff_value", sa.Float(), nullable=True),
        sa.Column("diff_unit", sa.String(length=10), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["empresa_id"],
            ["empresas.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["alert_code"],
            ["alert_rule_catalog.code"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "empresa_id",
            "alert_code",
            "anio",
            "mes",
            name="uq_alert_result_unique_period",
        ),
    )
    op.create_index(
        "ix_alert_results_tenant_id",
        "alert_results",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_alert_results_empresa_id",
        "alert_results",
        ["empresa_id"],
        unique=False,
    )
    op.create_index(
        "ix_alert_results_alert_code",
        "alert_results",
        ["alert_code"],
        unique=False,
    )
    op.create_index(
        "ix_alert_results_status",
        "alert_results",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_alert_results_severity",
        "alert_results",
        ["severity"],
        unique=False,
    )
    op.create_index(
        "ix_alert_results_anio",
        "alert_results",
        ["anio"],
        unique=False,
    )
    op.create_index(
        "ix_alert_results_mes",
        "alert_results",
        ["mes"],
        unique=False,
    )
    op.create_index(
        "ix_alert_results_empresa_period",
        "alert_results",
        ["tenant_id", "empresa_id", "anio", "mes"],
        unique=False,
    )

    # =========================================================
    # Seed catálogo base
    # =========================================================
    op.bulk_insert(
        sa.table(
            "alert_rule_catalog",
            sa.column("code", sa.String),
            sa.column("nombre", sa.String),
            sa.column("descripcion", sa.Text),
            sa.column("metric_field", sa.String),
            sa.column("diff_unit", sa.String),
            sa.column("default_threshold", sa.Float),
            sa.column("default_severity", sa.String),
            sa.column("active_by_default", sa.Boolean),
        ),
        [
            {
                "code": "energia_bruta_facturada_vs_mes_anterior_pct",
                "nombre": "Variación energía bruta facturada vs mes anterior",
                "descripcion": "Compara la energía bruta facturada del mes con la del mes anterior.",
                "metric_field": "energia_bruta_facturada",
                "diff_unit": "%",
                "default_threshold": 10.0,
                "default_severity": "warning",
                "active_by_default": True,
            },
            {
                "code": "perdidas_m1_vs_mes_anterior_pp",
                "nombre": "Variación pérdidas M1 vs mes anterior",
                "descripcion": "Compara las pérdidas generales (M1) del mes con el mes anterior en puntos porcentuales.",
                "metric_field": "perdidas_e_facturada_pct",
                "diff_unit": "pp",
                "default_threshold": 2.0,
                "default_severity": "warning",
                "active_by_default": True,
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
            },
        ],
    )


def downgrade() -> None:
    op.drop_index("ix_alert_results_empresa_period", table_name="alert_results")
    op.drop_index("ix_alert_results_mes", table_name="alert_results")
    op.drop_index("ix_alert_results_anio", table_name="alert_results")
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

    op.drop_index("ix_alert_rule_catalog_code", table_name="alert_rule_catalog")
    op.drop_table("alert_rule_catalog")