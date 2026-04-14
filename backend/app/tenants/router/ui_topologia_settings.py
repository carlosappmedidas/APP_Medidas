# app/tenants/router/ui_topologia_settings.py
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

class UiTopologiaSettingsPayload(BaseModel):
    """
    Configuración de topología del usuario.
    Estructura esperada en ui_topologia_settings:
    {
      "tabla_lineas":   { "identificador_tramo": true, "cini": false, ... },
      "tabla_tramos":   { ... },
      "tabla_cts":      { ... },
      "tabla_cups":     { ... },
      "tabla_celdas":   { ... },
      "tabla_trafos":   { ... },
      "tooltip_lineas": { "mostrar_identificador_tramo": true, ... },
      "tooltip_tramos": { ... },
      "tooltip_cts":    { ... },
      "tooltip_cups":   { ... }
    }
    """
    ui_topologia_settings: Optional[Dict[str, Any]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _as_any(obj: Any) -> Any:
    return cast(Any, obj)

def _u_rol(u: User) -> str:
    return str(getattr(u, "rol"))

def _can_manage(u: User) -> bool:
    return _u_rol(u) != "viewer"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/ui-topologia-settings", response_model=UiTopologiaSettingsPayload)
def get_ui_topologia_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para ver la configuración de topología",
        )
    settings = getattr(current_user, "ui_topologia_settings", None)
    return UiTopologiaSettingsPayload(
        ui_topologia_settings=cast(Optional[Dict[str, Any]], settings),
    )


@router.put("/ui-topologia-settings", response_model=UiTopologiaSettingsPayload)
def set_ui_topologia_settings(
    payload: UiTopologiaSettingsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para guardar la configuración de topología",
        )
    _as_any(current_user).ui_topologia_settings = payload.ui_topologia_settings
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    settings = getattr(current_user, "ui_topologia_settings", None)
    return UiTopologiaSettingsPayload(
        ui_topologia_settings=cast(Optional[Dict[str, Any]], settings),
    )


@router.delete("/ui-topologia-settings", response_model=UiTopologiaSettingsPayload)
def clear_ui_topologia_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _can_manage(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para borrar la configuración de topología",
        )
    _as_any(current_user).ui_topologia_settings = None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UiTopologiaSettingsPayload(ui_topologia_settings=None)