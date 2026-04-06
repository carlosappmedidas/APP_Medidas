# app/alerts/services.py
# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportCallIssue=false, reportArgumentType=false
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, cast

from sqlalchemy.orm import Session

from app.alerts.models import AlertComment, AlertResult, AlertRuleCatalog, EmpresaAlertRuleConfig
from app.alerts.schemas import AlertCommentRead, AlertResultRead, EmpresaAlertRuleConfigItem
from app.empresas.models import Empresa
from app.measures.models import MedidaGeneral
from app.tenants.models import User


# ── Helpers de acceso seguro ──────────────────────────────────────────────

def _as_any(obj: Any) -> Any:
    return cast(Any, obj)

def _str(obj: Any, attr: str) -> str:
    return str(getattr(obj, attr, "") or "")

def _int(obj: Any, attr: str) -> int:
    return int(getattr(obj, attr, 0) or 0)

def _float_or_none(obj: Any, attr: str) -> Optional[float]:
    v = getattr(obj, attr, None)
    return None if v is None else float(v)

def _to_float_or_none(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


# ── Catálogo ──────────────────────────────────────────────────────────────

def get_alert_rule_catalog(db: Session) -> List[AlertRuleCatalog]:
    return cast(
        List[AlertRuleCatalog],
        db.query(AlertRuleCatalog).order_by(
            AlertRuleCatalog.category.asc(),
            AlertRuleCatalog.id.asc(),
        ).all(),
    )


# ── Configuración efectiva por empresa ───────────────────────────────────

def get_empresa_alert_effective_config(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
) -> List[EmpresaAlertRuleConfigItem]:
    catalog = cast(
        List[AlertRuleCatalog],
        db.query(AlertRuleCatalog).order_by(
            AlertRuleCatalog.category.asc(),
            AlertRuleCatalog.id.asc(),
        ).all(),
    )
    configs = cast(
        List[EmpresaAlertRuleConfig],
        db.query(EmpresaAlertRuleConfig).filter(
            EmpresaAlertRuleConfig.tenant_id == tenant_id,
            EmpresaAlertRuleConfig.empresa_id == empresa_id,
        ).all(),
    )
    config_by_code: Dict[str, EmpresaAlertRuleConfig] = {
        _str(c, "alert_code"): c for c in configs
    }

    out: List[EmpresaAlertRuleConfigItem] = []
    for rule in catalog:
        code = _str(rule, "code")
        cfg = config_by_code.get(code)
        threshold = (
            float(getattr(cfg, "threshold_value"))
            if cfg is not None and getattr(cfg, "threshold_value") is not None
            else float(getattr(rule, "default_threshold"))
        )
        severity = (
            str(getattr(cfg, "severity"))
            if cfg is not None and getattr(cfg, "severity")
            else str(getattr(rule, "default_severity"))
        )
        is_enabled = (
            bool(getattr(cfg, "is_enabled"))
            if cfg is not None
            else bool(getattr(rule, "active_by_default"))
        )
        out.append(EmpresaAlertRuleConfigItem(
            alert_code=code,
            nombre=_str(rule, "nombre"),
            descripcion=getattr(rule, "descripcion", None),
            is_enabled=is_enabled,
            threshold_value=threshold,
            severity=severity,
            diff_unit=_str(rule, "diff_unit"),
            default_threshold=float(getattr(rule, "default_threshold")),
            default_severity=_str(rule, "default_severity"),
            category=_str(rule, "category"),
            comparison_type=_str(rule, "comparison_type"),
        ))
    return out


def upsert_empresa_alert_config(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    items: Iterable[Dict[str, Any]],
) -> List[EmpresaAlertRuleConfigItem]:
    catalog = cast(List[AlertRuleCatalog], db.query(AlertRuleCatalog).all())
    catalog_codes = {_str(c, "code") for c in catalog}

    existing = cast(
        List[EmpresaAlertRuleConfig],
        db.query(EmpresaAlertRuleConfig).filter(
            EmpresaAlertRuleConfig.tenant_id == tenant_id,
            EmpresaAlertRuleConfig.empresa_id == empresa_id,
        ).all(),
    )
    existing_by_code: Dict[str, EmpresaAlertRuleConfig] = {
        _str(c, "alert_code"): c for c in existing
    }

    for item in items:
        code = str(item["alert_code"]).strip()
        if code not in catalog_codes:
            continue
        cfg = existing_by_code.get(code)
        if cfg is None:
            cfg = EmpresaAlertRuleConfig()
            cfg_a = _as_any(cfg)
            cfg_a.tenant_id = tenant_id
            cfg_a.empresa_id = empresa_id
            cfg_a.alert_code = code
            db.add(cfg)
        cfg_a = _as_any(cfg)
        cfg_a.is_enabled = bool(item["is_enabled"])
        cfg_a.threshold_value = (
            float(item["threshold_value"]) if item.get("threshold_value") is not None else None
        )
        cfg_a.severity = str(item["severity"]).strip() if item.get("severity") else None

    db.commit()
    return get_empresa_alert_effective_config(db, tenant_id=tenant_id, empresa_id=empresa_id)


# ── Lógica de cálculo ─────────────────────────────────────────────────────

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
        db.query(MedidaGeneral).filter(
            MedidaGeneral.tenant_id == tenant_id,
            MedidaGeneral.empresa_id == empresa_id,
            MedidaGeneral.anio == anio,
            MedidaGeneral.mes == mes,
        ).first(),
    )


def _prev_month(anio: int, mes: int) -> Tuple[int, int]:
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


def _prev_year(anio: int, mes: int) -> Tuple[int, int]:
    return anio - 1, mes


def _compute_alert(
    *,
    comparison_type: str,
    current_value: Optional[float],
    reference_value: Optional[float],
    threshold: float,
    diff_unit: str,
) -> Tuple[bool, Optional[float]]:
    if current_value is None:
        return False, None

    if comparison_type == "absolute_above":
        if current_value > threshold:
            return True, current_value
        return False, None

    if comparison_type == "absolute_below":
        if current_value < threshold:
            return True, current_value
        return False, None

    if comparison_type in ("vs_prev_month", "vs_prev_year"):
        if reference_value is None:
            return False, None
        if diff_unit == "%":
            if reference_value == 0:
                return False, None
            diff = abs((current_value - reference_value) / abs(reference_value)) * 100.0
        else:
            diff = abs(current_value - reference_value)
        if diff > threshold:
            return True, diff
        return False, None

    return False, None


def _fmt(v: Optional[float]) -> str:
    return f"{v:.2f}" if v is not None else "—"


def _build_message(
    *,
    nombre: str,
    comparison_type: str,
    current_value: Optional[float],
    reference_value: Optional[float],
    diff_value: Optional[float],
    diff_unit: str,
    threshold: float,
) -> str:
    if comparison_type == "absolute_above":
        return (
            f"{nombre}: valor actual {_fmt(current_value)} {diff_unit} "
            f"supera el umbral máximo de {_fmt(threshold)} {diff_unit}."
        )
    if comparison_type == "absolute_below":
        return (
            f"{nombre}: valor actual {_fmt(current_value)} {diff_unit} "
            f"está por debajo del umbral mínimo de {_fmt(threshold)} {diff_unit}."
        )
    label = "mes anterior" if comparison_type == "vs_prev_month" else "mismo mes del año anterior"
    if diff_unit == "%":
        return (
            f"{nombre}: variación de {_fmt(diff_value)}% respecto al {label} "
            f"(actual {_fmt(current_value)}%, referencia {_fmt(reference_value)}%) "
            f"supera el umbral de {_fmt(threshold)}%."
        )
    return (
        f"{nombre}: variación de {_fmt(diff_value)} pp respecto al {label} "
        f"(actual {_fmt(current_value)}%, referencia {_fmt(reference_value)}%) "
        f"supera el umbral de {_fmt(threshold)} pp."
    )


# ── Recálculo principal ───────────────────────────────────────────────────

def recalculate_alerts_for_period(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> int:
    """
    Recalcula alertas para una empresa y periodo.
    - Solo borra alertas con lifecycle_status = "nueva"
    - No toca "en_revision" ni "resuelta"
    - No guarda no_reference
    - Devuelve el número de alertas triggered creadas
    """
    current_row = _get_medida_general(
        db, tenant_id=tenant_id, empresa_id=empresa_id, anio=anio, mes=mes
    )
    if current_row is None:
        return 0

    prev_m_anio, prev_m_mes = _prev_month(anio, mes)
    prev_y_anio, prev_y_mes = _prev_year(anio, mes)
    prev_month_row = _get_medida_general(
        db, tenant_id=tenant_id, empresa_id=empresa_id, anio=prev_m_anio, mes=prev_m_mes
    )
    prev_year_row = _get_medida_general(
        db, tenant_id=tenant_id, empresa_id=empresa_id, anio=prev_y_anio, mes=prev_y_mes
    )

    effective_rules = get_empresa_alert_effective_config(
        db, tenant_id=tenant_id, empresa_id=empresa_id
    )

    # Borrar solo las "nueva" — no tocar en_revision ni resuelta
    db.query(AlertResult).filter(
        AlertResult.tenant_id == tenant_id,
        AlertResult.empresa_id == empresa_id,
        AlertResult.anio == anio,
        AlertResult.mes == mes,
        AlertResult.lifecycle_status == "nueva",
    ).delete(synchronize_session=False)
    db.flush()

    catalog = cast(List[AlertRuleCatalog], db.query(AlertRuleCatalog).all())
    catalog_by_code: Dict[str, AlertRuleCatalog] = {_str(c, "code"): c for c in catalog}

    # Códigos que ya tienen alerta gestionada — no tocar
    existing_managed = cast(
        List[AlertResult],
        db.query(AlertResult).filter(
            AlertResult.tenant_id == tenant_id,
            AlertResult.empresa_id == empresa_id,
            AlertResult.anio == anio,
            AlertResult.mes == mes,
            AlertResult.lifecycle_status.in_(["en_revision", "resuelta"]),
        ).all(),
    )
    managed_codes = {_str(r, "alert_code") for r in existing_managed}

    triggered_count = 0

    for rule in effective_rules:
        if not rule.is_enabled:
            continue
        if rule.alert_code in managed_codes:
            continue

        catalog_rule = catalog_by_code.get(rule.alert_code)
        if catalog_rule is None:
            continue

        metric_field = _str(catalog_rule, "metric_field")
        comparison_type = _str(catalog_rule, "comparison_type")
        current_value = _to_float_or_none(getattr(current_row, metric_field, None))

        if comparison_type == "vs_prev_month":
            ref_value = (
                _to_float_or_none(getattr(prev_month_row, metric_field, None))
                if prev_month_row else None
            )
        elif comparison_type == "vs_prev_year":
            ref_value = (
                _to_float_or_none(getattr(prev_year_row, metric_field, None))
                if prev_year_row else None
            )
        else:
            ref_value = None

        triggered, diff_value = _compute_alert(
            comparison_type=comparison_type,
            current_value=current_value,
            reference_value=ref_value,
            threshold=float(rule.threshold_value),
            diff_unit=rule.diff_unit,
        )

        if not triggered:
            continue

        result = AlertResult()
        r = _as_any(result)
        r.tenant_id = tenant_id
        r.empresa_id = empresa_id
        r.alert_code = rule.alert_code
        r.anio = anio
        r.mes = mes
        r.status = "triggered"
        r.severity = rule.severity
        r.current_value = current_value
        r.previous_value = ref_value
        r.diff_value = diff_value
        r.diff_unit = rule.diff_unit
        r.threshold_value = float(rule.threshold_value)
        r.lifecycle_status = "nueva"
        r.resolved_by = None
        r.resolved_at = None
        r.message = _build_message(
            nombre=rule.nombre,
            comparison_type=comparison_type,
            current_value=current_value,
            reference_value=ref_value,
            diff_value=diff_value,
            diff_unit=rule.diff_unit,
            threshold=float(rule.threshold_value),
        )
        db.add(result)
        triggered_count += 1

    db.commit()
    return triggered_count


def recalculate_alerts_all_empresas(
    db: Session,
    *,
    tenant_id: int,
    anio: int,
    mes: int,
) -> Tuple[int, int]:
    """
    Recalcula alertas para todas las empresas activas del tenant en un periodo.
    Devuelve (empresas_procesadas, total_triggered).
    """
    empresas = cast(
        List[Empresa],
        db.query(Empresa).filter(
            Empresa.tenant_id == tenant_id,
            Empresa.activo.is_(True),
        ).all(),
    )
    total_triggered = 0
    empresas_procesadas = 0
    for empresa in empresas:
        empresa_id = _int(empresa, "id")
        row = _get_medida_general(
            db, tenant_id=tenant_id, empresa_id=empresa_id, anio=anio, mes=mes
        )
        if row is None:
            continue
        triggered = recalculate_alerts_for_period(
            db, tenant_id=tenant_id, empresa_id=empresa_id, anio=anio, mes=mes
        )
        total_triggered += triggered
        empresas_procesadas += 1
    return empresas_procesadas, total_triggered


# ── Ciclo de vida ─────────────────────────────────────────────────────────

def change_alert_lifecycle(
    db: Session,
    *,
    alert_id: int,
    tenant_id: int,
    new_status: str,
    comment: str,
    user_id: int,
) -> AlertResult:
    valid = {"nueva", "en_revision", "resuelta"}
    if new_status not in valid:
        raise ValueError(f"Estado no válido: {new_status}. Permitidos: {valid}")

    result = cast(
        Optional[AlertResult],
        db.query(AlertResult).filter(
            AlertResult.id == alert_id,
            AlertResult.tenant_id == tenant_id,
        ).first(),
    )
    if result is None:
        raise ValueError(f"Alerta {alert_id} no encontrada")

    r = _as_any(result)
    r.lifecycle_status = new_status
    if new_status == "resuelta":
        r.resolved_by = user_id
        r.resolved_at = datetime.utcnow()

    c = AlertComment()
    ca = _as_any(c)
    ca.alert_id = alert_id
    ca.user_id = user_id
    ca.comment = comment.strip()
    ca.lifecycle_status_at_time = new_status
    db.add(c)
    db.commit()
    db.refresh(result)
    return result


def add_alert_comment(
    db: Session,
    *,
    alert_id: int,
    tenant_id: int,
    comment: str,
    user_id: int,
) -> AlertComment:
    result = db.query(AlertResult).filter(
        AlertResult.id == alert_id,
        AlertResult.tenant_id == tenant_id,
    ).first()
    if result is None:
        raise ValueError(f"Alerta {alert_id} no encontrada")

    c = AlertComment()
    ca = _as_any(c)
    ca.alert_id = alert_id
    ca.user_id = user_id
    ca.comment = comment.strip()
    ca.lifecycle_status_at_time = _str(result, "lifecycle_status")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def get_alert_comments(
    db: Session,
    *,
    alert_id: int,
    tenant_id: int,
) -> List[AlertCommentRead]:
    result = db.query(AlertResult).filter(
        AlertResult.id == alert_id,
        AlertResult.tenant_id == tenant_id,
    ).first()
    if result is None:
        raise ValueError(f"Alerta {alert_id} no encontrada")

    rows = cast(
        List[Any],
        db.query(AlertComment, User.email.label("user_email"))
        .outerjoin(User, User.id == AlertComment.user_id)
        .filter(AlertComment.alert_id == alert_id)
        .order_by(AlertComment.created_at.asc())
        .all(),
    )
    out: List[AlertCommentRead] = []
    for comment, user_email in rows:
        out.append(AlertCommentRead(
            id=_int(comment, "id"),
            alert_id=_int(comment, "alert_id"),
            user_id=_int(comment, "user_id") or None,
            user_email=user_email,
            comment=_str(comment, "comment"),
            lifecycle_status_at_time=getattr(comment, "lifecycle_status_at_time", None),
            created_at=getattr(comment, "created_at"),
        ))
    return out


# ── Listado de resultados ─────────────────────────────────────────────────

def list_alert_results(
    db: Session,
    *,
    tenant_id: Optional[int] = None,
    allowed_empresa_ids: Optional[Sequence[int]] = None,
    empresa_id: Optional[int] = None,
    anio: Optional[int] = None,
    mes: Optional[int] = None,
    alert_code: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    lifecycle_status: Optional[str] = None,
) -> List[AlertResultRead]:
    q = (
        db.query(
            AlertResult,
            Empresa.nombre.label("empresa_nombre"),
            AlertRuleCatalog.nombre.label("alerta"),
            AlertRuleCatalog.category.label("category"),
            AlertRuleCatalog.comparison_type.label("comparison_type"),
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
    if category:
        q = q.filter(AlertRuleCatalog.category == category)
    if severity:
        q = q.filter(AlertResult.severity == severity)
    if lifecycle_status:
        q = q.filter(AlertResult.lifecycle_status == lifecycle_status)

    rows = q.order_by(
        AlertResult.anio.desc(),
        AlertResult.mes.desc(),
        AlertRuleCatalog.category.asc(),
        AlertResult.severity.desc(),
    ).all()

    out: List[AlertResultRead] = []
    for result, empresa_nombre, alerta, category_val, comparison_type_val in rows:
        out.append(AlertResultRead(
            id=_int(result, "id"),
            tenant_id=_int(result, "tenant_id"),
            empresa_id=_int(result, "empresa_id"),
            empresa_nombre=empresa_nombre,
            alert_code=_str(result, "alert_code"),
            alerta=alerta or "",
            category=category_val or "",
            comparison_type=comparison_type_val or "",
            anio=_int(result, "anio"),
            mes=_int(result, "mes"),
            status=_str(result, "status"),
            severity=_str(result, "severity"),
            current_value=_float_or_none(result, "current_value"),
            previous_value=_float_or_none(result, "previous_value"),
            diff_value=_float_or_none(result, "diff_value"),
            diff_unit=_str(result, "diff_unit"),
            threshold_value=float(getattr(result, "threshold_value")),
            message=getattr(result, "message", None),
            lifecycle_status=_str(result, "lifecycle_status"),
            resolved_by=getattr(result, "resolved_by", None),
            resolved_at=getattr(result, "resolved_at", None),
            created_at=getattr(result, "created_at"),
            updated_at=getattr(result, "updated_at", None),
        ))
    return out


# ── Periodos disponibles ──────────────────────────────────────────────────

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
    anios = sorted({int(a) for a, _ in rows}, reverse=True)
    meses = sorted({int(m) for _, m in rows})
    return anios, meses