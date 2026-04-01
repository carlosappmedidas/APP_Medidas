# app/tenants/router/ui_table_settings.py
from __future__ import annotations

from typing import Any, Dict, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth import get_current_user
from app.tenants.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schema ────────────────────────────────────────────────────────────────────

class UiTableSettingsPayload(BaseModel):
    """
    Configuración de tablas del usuario.
    Estructura esperada en ui_table_settings:
    {
      "appearance": {
        "stripedRows":     true,
        "columnGroups":    true,
        "pctBadges":       true,
        "periodSeparator": false
      },
      "general": {
        "columnOrder":   ["empresa_id", "anio", ...],
        "hiddenColumns": ["energia_pf_final_kwh", ...]
      },
      "ps": {
        "columnOrder":   ["empresa_id", "anio", ...],
        "hiddenColumns": []
      }
    }
    """
    ui_table_settings: Optional[Dict[str, Any]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _as_any(obj: Any) -> Any:
    return cast(Any, obj)

def _u_rol(u: User) -> str:
    return str(getattr(u, "rol"))

def _can_manage_ui_settings(u: User) -> bool:
    # Todos los usuarios autenticados pueden guardar su propia configuración de tablas,
    # excepto viewer (rol de solo lectura sin personalización).
    return _u_rol(u) != "viewer"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/ui-table-settings", response_model=UiTableSettingsPayload)
def get_ui_table_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve la configuración de tablas del usuario actual.
    Permitido para todos los roles excepto viewer.
    """
    if not _can_manage_ui_settings(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver la configuración de tablas",
        )
    settings = getattr(current_user, "ui_table_settings", None)
    return UiTableSettingsPayload(
        ui_table_settings=cast(Optional[Dict[str, Any]], settings)
    )


@router.put("/ui-table-settings", response_model=UiTableSettingsPayload)
def set_ui_table_settings(
    payload: UiTableSettingsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Guarda la configuración de tablas del usuario actual.
    Permitido para todos los roles excepto viewer.
    """
    if not _can_manage_ui_settings(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para guardar la configuración de tablas",
        )
    _as_any(current_user).ui_table_settings = payload.ui_table_settings
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    settings = getattr(current_user, "ui_table_settings", None)
    return UiTableSettingsPayload(
        ui_table_settings=cast(Optional[Dict[str, Any]], settings)
    )


@router.delete("/ui-table-settings", response_model=UiTableSettingsPayload)
def clear_ui_table_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Resetea la configuración de tablas del usuario (pone NULL en BD).
    Permitido para todos los roles excepto viewer.
    """
    if not _can_manage_ui_settings(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para borrar la configuración de tablas",
        )
    _as_any(current_user).ui_table_settings = None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UiTableSettingsPayload(ui_table_settings=None)
