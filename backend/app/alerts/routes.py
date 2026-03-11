# app/alerts/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.alerts.schemas import (
    AlertAvailablePeriodsRead,
    AlertRecalculatePayload,
    AlertRecalculateResponse,
    AlertResultRead,
    AlertRuleCatalogRead,
    EmpresaAlertRuleConfigItem,
    EmpresaAlertRuleConfigUpdatePayload,
)
from app.alerts.services import (
    get_alert_rule_catalog,
    get_available_periods_for_empresa,
    get_empresa_alert_effective_config,
    list_alert_results,
    recalculate_alerts_for_period,
    upsert_empresa_alert_config,
)
from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.tenants.models import User

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _user_tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))


def _user_role(user: User) -> str:
    return str(getattr(user, "rol", ""))


def _is_superuser(user: User) -> bool:
    return bool(getattr(user, "is_superuser", False))


def _allowed_empresa_ids(user: User) -> List[int]:
    """
    Si la lista está vacía => acceso a todas las empresas del tenant.
    """
    try:
        rel = getattr(user, "empresas_permitidas", None) or []
        return [int(getattr(e, "id")) for e in rel]
    except Exception:
        return []


def _can_manage_alerts(user: User) -> bool:
    if _is_superuser(user):
        return True
    return _user_role(user) in ("admin", "owner")


def _get_empresa_or_404(
    db: Session,
    *,
    empresa_id: int,
) -> Empresa:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada",
        )
    return empresa


def _assert_empresa_access(
    *,
    user: User,
    empresa: Empresa,
) -> None:
    if _is_superuser(user):
        return

    if int(getattr(empresa, "tenant_id")) != _user_tenant_id(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )

    allowed_ids = _allowed_empresa_ids(user)
    if allowed_ids and int(getattr(empresa, "id")) not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a esta empresa",
        )


@router.get("/catalog", response_model=List[AlertRuleCatalogRead])
def get_alert_catalog(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    return get_alert_rule_catalog(db)


@router.get("/results", response_model=List[AlertResultRead])
def get_alert_results(
    empresa_id: Optional[int] = None,
    anio: Optional[int] = None,
    mes: Optional[int] = None,
    alert_code: Optional[str] = None,
    severity: Optional[str] = None,
    status_value: Optional[str] = None,
    tenant_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    effective_tenant_id: Optional[int]
    if _is_superuser(current_user):
        effective_tenant_id = tenant_id
    else:
        effective_tenant_id = _user_tenant_id(current_user)

    if empresa_id is not None:
        empresa = _get_empresa_or_404(db, empresa_id=empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)

    allowed_ids = _allowed_empresa_ids(current_user)

    return list_alert_results(
        db,
        tenant_id=effective_tenant_id,
        allowed_empresa_ids=None if _is_superuser(current_user) else allowed_ids,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        alert_code=alert_code,
        severity=severity,
        status=status_value,
    )


@router.get(
    "/available-periods/{empresa_id}",
    response_model=AlertAvailablePeriodsRead,
)
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


@router.get(
    "/company-config/{empresa_id}",
    response_model=List[EmpresaAlertRuleConfigItem],
)
def get_company_alert_config(
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


@router.put(
    "/company-config/{empresa_id}",
    response_model=List[EmpresaAlertRuleConfigItem],
)
def put_company_alert_config(
    empresa_id: int,
    payload: EmpresaAlertRuleConfigUpdatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_alerts(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para configurar alertas",
        )

    empresa = _get_empresa_or_404(db, empresa_id=empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)

    return upsert_empresa_alert_config(
        db,
        tenant_id=int(getattr(empresa, "tenant_id")),
        empresa_id=int(getattr(empresa, "id")),
        items=[item.model_dump() for item in payload.items],
    )


@router.post("/recalculate", response_model=AlertRecalculateResponse)
def recalculate_alerts(
    payload: AlertRecalculatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage_alerts(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para recalcular alertas",
        )

    empresa = _get_empresa_or_404(db, empresa_id=payload.empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)

    try:
        recalculate_alerts_for_period(
            db,
            tenant_id=int(getattr(empresa, "tenant_id")),
            empresa_id=int(getattr(empresa, "id")),
            anio=payload.anio,
            mes=payload.mes,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    results = list_alert_results(
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
        results_created=len(results),
        results=results,
    )