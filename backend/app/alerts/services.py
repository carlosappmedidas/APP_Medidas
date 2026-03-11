# app/alerts/services.py
# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportCallIssue=false, reportArgumentType=false

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, TypedDict, cast

from sqlalchemy.orm import Session

from app.alerts.models import AlertRuleCatalog, EmpresaAlertRuleConfig, AlertResult
from app.alerts.schemas import AlertResultRead, EmpresaAlertRuleConfigItem
from app.empresas.models import Empresa
from app.measures.models import MedidaGeneral


class AlertRuleSeed(TypedDict):
    code: str
    nombre: str
    descripcion: str
    metric_field: str
    diff_unit: str
    default_threshold: float
    default_severity: str
    active_by_default: bool


DEFAULT_ALERT_RULES: Sequence[AlertRuleSeed] = (
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
)


def _as_any(obj: Any) -> Any:
    return cast(Any, obj)


def _rule_code(rule: AlertRuleCatalog) -> str:
    return str(getattr(rule, "code"))


def _rule_nombre(rule: AlertRuleCatalog) -> str:
    return str(getattr(rule, "nombre"))


def _rule_descripcion(rule: AlertRuleCatalog) -> Optional[str]:
    value = getattr(rule, "descripcion", None)
    return None if value is None else str(value)


def _rule_metric_field(rule: AlertRuleCatalog) -> str:
    return str(getattr(rule, "metric_field"))


def _rule_diff_unit(rule: AlertRuleCatalog) -> str:
    return str(getattr(rule, "diff_unit"))


def _rule_default_threshold(rule: AlertRuleCatalog) -> float:
    return float(getattr(rule, "default_threshold"))


def _rule_default_severity(rule: AlertRuleCatalog) -> str:
    return str(getattr(rule, "default_severity"))


def _rule_active_by_default(rule: AlertRuleCatalog) -> bool:
    return bool(getattr(rule, "active_by_default"))


def _cfg_alert_code(cfg: EmpresaAlertRuleConfig) -> str:
    return str(getattr(cfg, "alert_code"))


def _cfg_is_enabled(cfg: EmpresaAlertRuleConfig) -> bool:
    return bool(getattr(cfg, "is_enabled"))


def _cfg_threshold_value(cfg: EmpresaAlertRuleConfig) -> Optional[float]:
    value = getattr(cfg, "threshold_value", None)
    return None if value is None else float(value)


def _cfg_severity(cfg: EmpresaAlertRuleConfig) -> Optional[str]:
    value = getattr(cfg, "severity", None)
    return None if value is None else str(value)


def _result_id(result: AlertResult) -> int:
    return int(getattr(result, "id"))


def _result_tenant_id(result: AlertResult) -> int:
    return int(getattr(result, "tenant_id"))


def _result_empresa_id(result: AlertResult) -> int:
    return int(getattr(result, "empresa_id"))


def _result_alert_code(result: AlertResult) -> str:
    return str(getattr(result, "alert_code"))


def _result_anio(result: AlertResult) -> int:
    return int(getattr(result, "anio"))


def _result_mes(result: AlertResult) -> int:
    return int(getattr(result, "mes"))


def _result_status(result: AlertResult) -> str:
    return str(getattr(result, "status"))


def _result_severity(result: AlertResult) -> str:
    return str(getattr(result, "severity"))


def _result_current_value(result: AlertResult) -> Optional[float]:
    value = getattr(result, "current_value", None)
    return None if value is None else float(value)


def _result_previous_value(result: AlertResult) -> Optional[float]:
    value = getattr(result, "previous_value", None)
    return None if value is None else float(value)


def _result_diff_value(result: AlertResult) -> Optional[float]:
    value = getattr(result, "diff_value", None)
    return None if value is None else float(value)


def _result_diff_unit(result: AlertResult) -> str:
    return str(getattr(result, "diff_unit"))


def _result_threshold_value(result: AlertResult) -> float:
    return float(getattr(result, "threshold_value"))


def _result_message(result: AlertResult) -> Optional[str]:
    value = getattr(result, "message", None)
    return None if value is None else str(value)


def _result_created_at(result: AlertResult):
    return getattr(result, "created_at", None)


def _result_updated_at(result: AlertResult):
    return getattr(result, "updated_at", None)


def seed_alert_rule_catalog(db: Session) -> None:
    """
    Inserta el catálogo base si faltan reglas.
    Idempotente.
    """
    existing_rows = db.query(AlertRuleCatalog).all()
    existing_codes = {_rule_code(row) for row in existing_rows}

    changed = False
    for rule in DEFAULT_ALERT_RULES:
        if rule["code"] in existing_codes:
            continue

        row = AlertRuleCatalog()
        row_any = _as_any(row)
        row_any.code = rule["code"]
        row_any.nombre = rule["nombre"]
        row_any.descripcion = rule["descripcion"]
        row_any.metric_field = rule["metric_field"]
        row_any.diff_unit = rule["diff_unit"]
        row_any.default_threshold = rule["default_threshold"]
        row_any.default_severity = rule["default_severity"]
        row_any.active_by_default = rule["active_by_default"]

        db.add(row)
        changed = True

    if changed:
        db.commit()


def get_alert_rule_catalog(db: Session) -> List[AlertRuleCatalog]:
    seed_alert_rule_catalog(db)
    return cast(
        List[AlertRuleCatalog],
        db.query(AlertRuleCatalog).order_by(AlertRuleCatalog.id.asc()).all(),
    )


def get_empresa_alert_effective_config(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
) -> List[EmpresaAlertRuleConfigItem]:
    seed_alert_rule_catalog(db)

    catalog = cast(
        List[AlertRuleCatalog],
        db.query(AlertRuleCatalog).order_by(AlertRuleCatalog.id.asc()).all(),
    )
    configs = cast(
        List[EmpresaAlertRuleConfig],
        db.query(EmpresaAlertRuleConfig)
        .filter(
            EmpresaAlertRuleConfig.tenant_id == tenant_id,
            EmpresaAlertRuleConfig.empresa_id == empresa_id,
        )
        .all(),
    )

    config_by_code: Dict[str, EmpresaAlertRuleConfig] = {
        _cfg_alert_code(c): c for c in configs
    }

    out: List[EmpresaAlertRuleConfigItem] = []
    for rule in catalog:
        rule_code = _rule_code(rule)
        cfg = config_by_code.get(rule_code)

        out.append(
            EmpresaAlertRuleConfigItem(
                alert_code=rule_code,
                nombre=_rule_nombre(rule),
                descripcion=_rule_descripcion(rule),
                is_enabled=_cfg_is_enabled(cfg) if cfg is not None else _rule_active_by_default(rule),
                threshold_value=(
                    _cfg_threshold_value(cfg)
                    if cfg is not None and _cfg_threshold_value(cfg) is not None
                    else _rule_default_threshold(rule)
                ),
                severity=(
                    _cfg_severity(cfg)
                    if cfg is not None and _cfg_severity(cfg)
                    else _rule_default_severity(rule)
                ),
                diff_unit=_rule_diff_unit(rule),
                default_threshold=_rule_default_threshold(rule),
                default_severity=_rule_default_severity(rule),
            )
        )

    return out


def upsert_empresa_alert_config(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    items: Iterable[Dict[str, Any]],
) -> List[EmpresaAlertRuleConfigItem]:
    seed_alert_rule_catalog(db)

    catalog = cast(
        List[AlertRuleCatalog],
        db.query(AlertRuleCatalog).order_by(AlertRuleCatalog.id.asc()).all(),
    )
    catalog_by_code: Dict[str, AlertRuleCatalog] = {_rule_code(c): c for c in catalog}

    existing = cast(
        List[EmpresaAlertRuleConfig],
        db.query(EmpresaAlertRuleConfig)
        .filter(
            EmpresaAlertRuleConfig.tenant_id == tenant_id,
            EmpresaAlertRuleConfig.empresa_id == empresa_id,
        )
        .all(),
    )
    existing_by_code: Dict[str, EmpresaAlertRuleConfig] = {
        _cfg_alert_code(c): c for c in existing
    }

    for item in items:
        alert_code = str(item["alert_code"]).strip()
        if alert_code not in catalog_by_code:
            continue

        cfg = existing_by_code.get(alert_code)
        if cfg is None:
            cfg = EmpresaAlertRuleConfig()
            cfg_any = _as_any(cfg)
            cfg_any.tenant_id = tenant_id
            cfg_any.empresa_id = empresa_id
            cfg_any.alert_code = alert_code
            db.add(cfg)

        cfg_any = _as_any(cfg)
        cfg_any.is_enabled = bool(item["is_enabled"])
        cfg_any.threshold_value = (
            float(item["threshold_value"])
            if item.get("threshold_value") is not None
            else None
        )
        cfg_any.severity = str(item["severity"]).strip() if item.get("severity") else None

    db.commit()
    return get_empresa_alert_effective_config(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
    )


def _prev_period(anio: int, mes: int) -> Tuple[int, int]:
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


def _to_float_or_none(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _build_result_message(
    *,
    rule_name: str,
    status: str,
    diff_value: Optional[float],
    diff_unit: str,
    threshold_value: float,
) -> str:
    if status == "no_reference":
        return "No existe referencia previa para comparar este mes."

    diff_txt = "—" if diff_value is None else f"{diff_value:.2f}"
    threshold_txt = f"{threshold_value:.2f}"

    if diff_unit == "%":
        return (
            f"{rule_name}: la variación respecto al mes anterior es de "
            f"{diff_txt}% y supera el umbral configurado de {threshold_txt}%."
        )

    return (
        f"{rule_name}: la variación respecto al mes anterior es de "
        f"{diff_txt} puntos porcentuales y supera el umbral configurado de "
        f"{threshold_txt} puntos."
    )


def _compute_diff(
    *,
    current_value: Optional[float],
    previous_value: Optional[float],
    diff_unit: str,
) -> Tuple[str, Optional[float]]:
    if current_value is None or previous_value is None:
        return "no_reference", None

    if diff_unit == "%":
        if previous_value == 0:
            return "no_reference", None
        diff_value = ((current_value - previous_value) / abs(previous_value)) * 100.0
        return "triggered", abs(diff_value)

    diff_value = current_value - previous_value
    return "triggered", abs(diff_value)


def _get_medida_general(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> Optional[MedidaGeneral]:
    return cast(
        Optional[MedidaGeneral],
        db.query(MedidaGeneral)
        .filter(
            MedidaGeneral.tenant_id == tenant_id,
            MedidaGeneral.empresa_id == empresa_id,
            MedidaGeneral.anio == anio,
            MedidaGeneral.mes == mes,
        )
        .first(),
    )


def recalculate_alerts_for_period(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> List[AlertResult]:
    """
    Recalcula alertas para una empresa y periodo.
    Estrategia MVP:
      - borrar resultados anteriores de ese bloque
      - regenerar solo triggered / no_reference
    """
    seed_alert_rule_catalog(db)

    current_row = _get_medida_general(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
    )
    if current_row is None:
        raise ValueError("No existe MedidaGeneral para esa empresa y periodo")

    prev_anio, prev_mes = _prev_period(anio, mes)
    previous_row = _get_medida_general(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=prev_anio,
        mes=prev_mes,
    )

    effective_rules = get_empresa_alert_effective_config(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
    )

    db.query(AlertResult).filter(
        AlertResult.tenant_id == tenant_id,
        AlertResult.empresa_id == empresa_id,
        AlertResult.anio == anio,
        AlertResult.mes == mes,
    ).delete(synchronize_session=False)

    db.flush()

    catalog = cast(List[AlertRuleCatalog], db.query(AlertRuleCatalog).all())
    catalog_by_code: Dict[str, AlertRuleCatalog] = {_rule_code(c): c for c in catalog}

    created_results: List[AlertResult] = []

    for rule in effective_rules:
        if not rule.is_enabled:
            continue

        catalog_rule = catalog_by_code.get(rule.alert_code)
        if catalog_rule is None:
            continue

        metric_field = _rule_metric_field(catalog_rule)

        current_value = _to_float_or_none(getattr(current_row, metric_field, None))
        previous_value = (
            _to_float_or_none(getattr(previous_row, metric_field, None))
            if previous_row is not None
            else None
        )

        status, diff_value = _compute_diff(
            current_value=current_value,
            previous_value=previous_value,
            diff_unit=rule.diff_unit,
        )

        should_create = False
        if status == "no_reference":
            should_create = True
        elif diff_value is not None and diff_value > float(rule.threshold_value):
            should_create = True

        if not should_create:
            continue

        result = AlertResult()
        result_any = _as_any(result)
        result_any.tenant_id = tenant_id
        result_any.empresa_id = empresa_id
        result_any.alert_code = rule.alert_code
        result_any.anio = anio
        result_any.mes = mes
        result_any.status = status
        result_any.severity = rule.severity
        result_any.current_value = current_value
        result_any.previous_value = previous_value
        result_any.diff_value = diff_value
        result_any.diff_unit = rule.diff_unit
        result_any.threshold_value = float(rule.threshold_value)
        result_any.message = _build_result_message(
            rule_name=rule.nombre,
            status=status,
            diff_value=diff_value,
            diff_unit=rule.diff_unit,
            threshold_value=float(rule.threshold_value),
        )

        db.add(result)
        created_results.append(result)

    db.commit()

    for r in created_results:
        db.refresh(r)

    return created_results


def list_alert_results(
    db: Session,
    *,
    tenant_id: Optional[int] = None,
    allowed_empresa_ids: Optional[Sequence[int]] = None,
    empresa_id: Optional[int] = None,
    anio: Optional[int] = None,
    mes: Optional[int] = None,
    alert_code: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
) -> List[AlertResultRead]:
    q = (
        db.query(
            AlertResult,
            Empresa.nombre.label("empresa_nombre"),
            AlertRuleCatalog.nombre.label("alerta"),
        )
        .join(Empresa, Empresa.id == AlertResult.empresa_id)
        .join(AlertRuleCatalog, AlertRuleCatalog.code == AlertResult.alert_code)
    )

    if tenant_id is not None:
        q = q.filter(AlertResult.tenant_id == tenant_id)

    if allowed_empresa_ids is not None and len(allowed_empresa_ids) > 0:
        q = q.filter(AlertResult.empresa_id.in_(allowed_empresa_ids))

    if empresa_id is not None:
        q = q.filter(AlertResult.empresa_id == empresa_id)

    if anio is not None:
        q = q.filter(AlertResult.anio == anio)

    if mes is not None:
        q = q.filter(AlertResult.mes == mes)

    if alert_code:
        q = q.filter(AlertResult.alert_code == alert_code)

    if severity:
        q = q.filter(AlertResult.severity == severity)

    if status:
        q = q.filter(AlertResult.status == status)

    rows = q.order_by(
        AlertResult.anio.desc(),
        AlertResult.mes.desc(),
        AlertResult.created_at.desc(),
    ).all()

    out: List[AlertResultRead] = []
    for result, empresa_nombre, alerta in rows:
        out.append(
            AlertResultRead(
                id=_result_id(result),
                tenant_id=_result_tenant_id(result),
                empresa_id=_result_empresa_id(result),
                empresa_nombre=None if empresa_nombre is None else str(empresa_nombre),
                alert_code=_result_alert_code(result),
                alerta="" if alerta is None else str(alerta),
                anio=_result_anio(result),
                mes=_result_mes(result),
                status=_result_status(result),
                severity=_result_severity(result),
                current_value=_result_current_value(result),
                previous_value=_result_previous_value(result),
                diff_value=_result_diff_value(result),
                diff_unit=_result_diff_unit(result),
                threshold_value=_result_threshold_value(result),
                message=_result_message(result),
                created_at=_result_created_at(result),
                updated_at=_result_updated_at(result),
            )
        )
    return out

def get_available_periods_for_empresa(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
) -> Tuple[List[int], List[int]]:
    rows = (
        db.query(MedidaGeneral.anio, MedidaGeneral.mes)
        .filter(
            MedidaGeneral.tenant_id == tenant_id,
            MedidaGeneral.empresa_id == empresa_id,
        )
        .order_by(MedidaGeneral.anio.desc(), MedidaGeneral.mes.asc())
        .all()
    )

    anios = sorted({int(anio) for anio, _mes in rows}, reverse=True)
    meses = sorted({int(mes) for _anio, mes in rows})

    return anios, meses