# app/alerts/routes.py
# pyright: reportMissingImports=false
from __future__ import annotations
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.alerts.models import AlertComment, AlertResult
from app.alerts.schemas import (
    AlertAdminDeletePayload,
    AlertAdminDeleteResponse,
    AlertAdminResetPayload,
    AlertAdminResetResponse,
    AlertAvailablePeriodsRead,
    AlertCommentCreate,
    AlertCommentRead,
    AlertLifecyclePayload,
    AlertRecalculateAllPayload,
    AlertRecalculateAllResponse,
    AlertRecalculatePayload,
    AlertRecalculateResponse,
    AlertResultRead,
    AlertRuleCatalogRead,
    EmpresaAlertRuleConfigItem,
    EmpresaAlertRuleConfigUpdatePayload,
)
from app.alerts.services import (
    add_alert_comment,
    change_alert_lifecycle,
    get_alert_comments,
    get_alert_rule_catalog,
    get_available_periods_for_empresa,
    get_empresa_alert_effective_config,
    list_alert_results,
    recalculate_alerts_all_empresas,
    recalculate_alerts_for_period,
    upsert_empresa_alert_config,
)
from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.tenants.models import User

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ── Helpers de acceso ─────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))

def _user_id(user: User) -> int:
    return int(getattr(user, "id"))

def _role(user: User) -> str:
    return str(getattr(user, "rol", ""))

def _is_superuser(user: User) -> bool:
    return bool(getattr(user, "is_superuser", False))

def _allowed_empresa_ids(user: User) -> List[int]:
    try:
        rel = getattr(user, "empresas_permitidas", None) or []
        return [int(getattr(e, "id")) for e in rel]
    except Exception:
        return []

def _can_manage(user: User) -> bool:
    if _is_superuser(user):
        return True
    return _role(user) in ("admin", "owner")

def _get_empresa_or_404(db: Session, *, empresa_id: int) -> Empresa:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return empresa

def _assert_empresa_access(*, user: User, empresa: Empresa) -> None:
    if _is_superuser(user):
        return
    if int(getattr(empresa, "tenant_id")) != _tenant_id(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")
    allowed = _allowed_empresa_ids(user)
    if allowed and int(getattr(empresa, "id")) not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")


# ── Catálogo ──────────────────────────────────────────────────────────────

@router.get("/catalog", response_model=List[AlertRuleCatalogRead])
def get_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_alert_rule_catalog(db)


# ── Resultados ────────────────────────────────────────────────────────────

@router.get("/results", response_model=List[AlertResultRead])
def get_results(
    empresa_id: Optional[int] = None,
    anio: Optional[int] = None,
    mes: Optional[int] = None,
    alert_code: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    lifecycle_status: Optional[str] = None,
    tenant_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    effective_tenant = tenant_id if _is_superuser(current_user) else _tenant_id(current_user)

    if empresa_id is not None:
        empresa = _get_empresa_or_404(db, empresa_id=empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)

    allowed = None if _is_superuser(current_user) else _allowed_empresa_ids(current_user)

    return list_alert_results(
        db,
        tenant_id=effective_tenant,
        allowed_empresa_ids=allowed,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        alert_code=alert_code,
        category=category,
        severity=severity,
        lifecycle_status=lifecycle_status,
    )


# ── Ciclo de vida ─────────────────────────────────────────────────────────

@router.post("/results/{alert_id}/lifecycle", response_model=AlertResultRead)
def post_lifecycle(
    alert_id: int,
    payload: AlertLifecyclePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.comment.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comentario es obligatorio para cambiar el estado.",
        )
    effective_tenant = 0 if _is_superuser(current_user) else _tenant_id(current_user)
    try:
        change_alert_lifecycle(
            db,
            alert_id=alert_id,
            tenant_id=effective_tenant,
            new_status=payload.lifecycle_status,
            comment=payload.comment,
            user_id=_user_id(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    results = list_alert_results(
        db,
        tenant_id=None if _is_superuser(current_user) else _tenant_id(current_user),
    )
    match = next((r for r in results if r.id == alert_id), None)
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")
    return match


# ── Comentarios ───────────────────────────────────────────────────────────

@router.get("/results/{alert_id}/comments", response_model=List[AlertCommentRead])
def get_comments(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    effective_tenant = 0 if _is_superuser(current_user) else _tenant_id(current_user)
    try:
        return get_alert_comments(db, alert_id=alert_id, tenant_id=effective_tenant)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/results/{alert_id}/comments", response_model=AlertCommentRead)
def post_comment(
    alert_id: int,
    payload: AlertCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.comment.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comentario no puede estar vacío.",
        )
    effective_tenant = 0 if _is_superuser(current_user) else _tenant_id(current_user)
    try:
        comment = add_alert_comment(
            db,
            alert_id=alert_id,
            tenant_id=effective_tenant,
            comment=payload.comment,
            user_id=_user_id(current_user),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user_email = None
    if getattr(comment, "user_id", None):
        u = db.query(User).filter(User.id == comment.user_id).first()
        user_email = str(getattr(u, "email", "")) if u else None

    return AlertCommentRead(
        id=int(getattr(comment, "id")),
        alert_id=int(getattr(comment, "alert_id")),
        user_id=getattr(comment, "user_id", None),
        user_email=user_email,
        comment=str(getattr(comment, "comment")),
        lifecycle_status_at_time=getattr(comment, "lifecycle_status_at_time", None),
        created_at=getattr(comment, "created_at"),
    )


# ── Configuración por empresa ─────────────────────────────────────────────

@router.get("/company-config/{empresa_id}", response_model=List[EmpresaAlertRuleConfigItem])
def get_company_config(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id=empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    return get_empresa_alert_effective_config(
        db,
        tenant_id=int(getattr(empresa, "tenant_id")),
        empresa_id=int(getattr(empresa, "id")),
    )


@router.put("/company-config/{empresa_id}", response_model=List[EmpresaAlertRuleConfigItem])
def put_company_config(
    empresa_id: int,
    payload: EmpresaAlertRuleConfigUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sin permisos para configurar alertas",
        )
    empresa = _get_empresa_or_404(db, empresa_id=empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    return upsert_empresa_alert_config(
        db,
        tenant_id=int(getattr(empresa, "tenant_id")),
        empresa_id=int(getattr(empresa, "id")),
        items=[item.model_dump() for item in payload.items],
    )


# ── Periodos disponibles ──────────────────────────────────────────────────

@router.get("/available-periods/{empresa_id}", response_model=AlertAvailablePeriodsRead)
def get_available_periods(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id=empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    anios, meses = get_available_periods_for_empresa(
        db,
        tenant_id=int(getattr(empresa, "tenant_id")),
        empresa_id=int(getattr(empresa, "id")),
    )
    return AlertAvailablePeriodsRead(
        empresa_id=int(getattr(empresa, "id")),
        anios=anios,
        meses=meses,
    )


# ── Recálculo ─────────────────────────────────────────────────────────────

@router.post("/recalculate", response_model=AlertRecalculateResponse)
def recalculate(
    payload: AlertRecalculatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sin permisos para recalcular alertas",
        )
    empresa = _get_empresa_or_404(db, empresa_id=payload.empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    triggered = recalculate_alerts_for_period(
        db,
        tenant_id=int(getattr(empresa, "tenant_id")),
        empresa_id=int(getattr(empresa, "id")),
        anio=payload.anio,
        mes=payload.mes,
    )
    return AlertRecalculateResponse(
        empresa_id=int(getattr(empresa, "id")),
        anio=payload.anio,
        mes=payload.mes,
        triggered=triggered,
    )


@router.post("/recalculate-all", response_model=AlertRecalculateAllResponse)
def recalculate_all(
    payload: AlertRecalculateAllPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sin permisos para recalcular alertas",
        )
    # El superusuario puede recalcular cualquier tenant pasando tenant_id en el payload.
    if _is_superuser(current_user) and payload.tenant_id:
        tenant = payload.tenant_id
    else:
        tenant = _tenant_id(current_user)

    empresas_procesadas, total_triggered = recalculate_alerts_all_empresas(
        db, tenant_id=tenant, anio=payload.anio, mes=payload.mes,
    )
    return AlertRecalculateAllResponse(
        anio=payload.anio,
        mes=payload.mes,
        empresas_procesadas=empresas_procesadas,
        total_triggered=total_triggered,
    )


# ── Admin: Reset y Borrado (solo superusuario) ────────────────────────────

@router.post("/admin/reset", response_model=AlertAdminResetResponse)
def admin_reset_alerts(
    payload: AlertAdminResetPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reinicia alertas a estado "nueva" y borra sus comentarios.
    Solo superusuario. Filtros opcionales: empresa, año, mes, lifecycle_status.
    """
    if not _is_superuser(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el superusuario puede usar esta operación.",
        )

    # Construir query de alertas a resetear
    q = db.query(AlertResult).filter(AlertResult.tenant_id == payload.tenant_id)
    if payload.empresa_id is not None:
        q = q.filter(AlertResult.empresa_id == payload.empresa_id)
    if payload.anio is not None:
        q = q.filter(AlertResult.anio == payload.anio)
    if payload.mes is not None:
        q = q.filter(AlertResult.mes == payload.mes)
    if payload.lifecycle_status is not None:
        q = q.filter(AlertResult.lifecycle_status == payload.lifecycle_status)

    alertas = q.all()
    alert_ids = [int(getattr(a, "id")) for a in alertas]

    if alert_ids:
        # Borrar comentarios de estas alertas
        db.query(AlertComment).filter(AlertComment.alert_id.in_(alert_ids)).delete(synchronize_session=False)
        # Resetear lifecycle a "nueva" y limpiar resolución
        for a in alertas:
            aa = a  # type: ignore
            aa.lifecycle_status = "nueva"
            aa.resolved_by = None
            aa.resolved_at = None

    db.commit()

    return AlertAdminResetResponse(
        tenant_id=payload.tenant_id,
        empresa_id=payload.empresa_id,
        anio=payload.anio,
        mes=payload.mes,
        lifecycle_status=payload.lifecycle_status,
        alertas_reiniciadas=len(alert_ids),
    )


@router.delete("/admin/delete", response_model=AlertAdminDeleteResponse)
def admin_delete_alerts(
    payload: AlertAdminDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Borra físicamente alertas de BD. Los comentarios se borran en cascada.
    Solo superusuario. Filtros opcionales: empresa, año, mes, lifecycle_status.
    """
    if not _is_superuser(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el superusuario puede usar esta operación.",
        )

    # Construir query
    q = db.query(AlertResult).filter(AlertResult.tenant_id == payload.tenant_id)
    if payload.empresa_id is not None:
        q = q.filter(AlertResult.empresa_id == payload.empresa_id)
    if payload.anio is not None:
        q = q.filter(AlertResult.anio == payload.anio)
    if payload.mes is not None:
        q = q.filter(AlertResult.mes == payload.mes)
    if payload.lifecycle_status is not None:
        q = q.filter(AlertResult.lifecycle_status == payload.lifecycle_status)

    # Primero borrar comentarios (por si el CASCADE no está activo en el ORM)
    alert_ids = [int(getattr(a, "id")) for a in q.all()]
    total = len(alert_ids)

    if alert_ids:
        db.query(AlertComment).filter(AlertComment.alert_id.in_(alert_ids)).delete(synchronize_session=False)
        q.delete(synchronize_session=False)

    db.commit()

    return AlertAdminDeleteResponse(
        tenant_id=payload.tenant_id,
        empresa_id=payload.empresa_id,
        anio=payload.anio,
        mes=payload.mes,
        lifecycle_status=payload.lifecycle_status,
        alertas_borradas=total,
    )
