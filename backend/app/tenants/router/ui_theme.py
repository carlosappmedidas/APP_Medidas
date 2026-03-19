# app/tenants/router/ui_theme.py
from __future__ import annotations

from typing import Any, Dict, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth import get_current_user
from app.tenants.models import User
from app.tenants.schemas import UiThemePayload

router = APIRouter(prefix="/auth", tags=["auth"])


def _as_any(obj: Any) -> Any:
    return cast(Any, obj)

def _u_rol(u: User) -> str:
    return str(getattr(u, "rol"))

def _u_is_superuser(u: User) -> bool:
    return bool(cast(bool, getattr(u, "is_superuser")))

def _can_manage_ui_settings(u: User) -> bool:
    if _u_is_superuser(u):
        return True
    return _u_rol(u) in ("admin", "owner")


@router.get("/ui-theme", response_model=UiThemePayload)
def get_ui_theme(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el JSON de overrides del tema para el usuario actual.
    Solo permitido para roles 'admin' o 'owner' (o superuser).
    """
    if not _can_manage_ui_settings(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver los ajustes de UI",
        )
    overrides = getattr(current_user, "ui_theme_overrides", None)
    return UiThemePayload(ui_theme_overrides=cast(Optional[Dict[str, Any]], overrides))


@router.patch("/ui-theme", response_model=UiThemePayload)
def patch_ui_theme(
    payload: UiThemePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Guarda (o limpia) el JSON de overrides del tema para el usuario actual.
    Solo permitido para roles 'admin' o 'owner' (o superuser).
    """
    if not _can_manage_ui_settings(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para guardar los ajustes de UI",
        )
    _as_any(current_user).ui_theme_overrides = payload.ui_theme_overrides
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    overrides = getattr(current_user, "ui_theme_overrides", None)
    return UiThemePayload(ui_theme_overrides=cast(Optional[Dict[str, Any]], overrides))


@router.put("/ui-theme", response_model=UiThemePayload)
def set_ui_theme(
    payload: UiThemePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Alias de compatibilidad: hace lo mismo que PATCH /ui-theme.
    """
    return patch_ui_theme(payload=payload, db=db, current_user=current_user)


@router.delete("/ui-theme", response_model=UiThemePayload)
def clear_ui_theme(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Limpia (pone a NULL) los overrides del tema del usuario actual.
    Solo permitido para roles 'admin' o 'owner' (o superuser).
    """
    if not _can_manage_ui_settings(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para borrar los ajustes de UI",
        )
    _as_any(current_user).ui_theme_overrides = None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UiThemePayload(ui_theme_overrides=None)