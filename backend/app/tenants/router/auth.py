# app/tenants/router/auth.py
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, cast

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import verify_password
from app.core.auth import create_access_token, Token, get_current_user
from app.tenants.models import User
from app.tenants.schemas import UserRead

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------
# Helpers de tipado (silencian Pylance sin tocar modelos)
# ---------------------------------------------------------
def _as_any(obj: Any) -> Any:
    return cast(Any, obj)

def _u_id(u: User) -> int:
    return cast(int, getattr(u, "id"))

def _u_tenant_id(u: User) -> int:
    return cast(int, getattr(u, "tenant_id"))

def _u_email(u: User) -> str:
    return str(getattr(u, "email"))

def _u_rol(u: User) -> str:
    return str(getattr(u, "rol"))

def _u_is_active(u: User) -> bool:
    return bool(cast(bool, getattr(u, "is_active")))

def _u_is_superuser(u: User) -> bool:
    return bool(cast(bool, getattr(u, "is_superuser")))


# ---------------------------------------------------------
# LOGIN
# ---------------------------------------------------------
@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Login vía email + contraseña.
    - Recibe form-data con username (email) y password.
    - Devuelve un JWT con user_id y tenant_id.
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(form_data.password, str(getattr(user, "password_hash"))):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(_u_id(user)),
            "tenant_id": _u_tenant_id(user),
            "email": _u_email(user),
        },
        expires_delta=access_token_expires,
    )
    return Token(access_token=access_token, token_type="bearer")


# ---------------------------------------------------------
# USUARIO ACTUAL
# ---------------------------------------------------------
@router.get("/me", response_model=UserRead)
def read_current_user(
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve los datos del usuario actual (id, email, rol, tenant, etc.).
    Construimos el esquema UserRead a mano para evitar errores de serialización
    si hay datos "raros" (por ejemplo en ui_theme_overrides).
    """
    import json

    data: Dict[str, Any] = {
        "id": _u_id(current_user),
        "tenant_id": _u_tenant_id(current_user),
        "email": _u_email(current_user),
        "rol": _u_rol(current_user),
        "is_active": _u_is_active(current_user),
        "is_superuser": _u_is_superuser(current_user),
        "created_at": getattr(current_user, "created_at", None),
        "updated_at": getattr(current_user, "updated_at", None),
        "empresa_ids_permitidas": [],
        "ui_theme_overrides": None,
    }

    try:
        empresas_rel = getattr(current_user, "empresas_permitidas", None)
        if empresas_rel:
            data["empresa_ids_permitidas"] = [
                int(getattr(e, "id")) for e in empresas_rel
            ]
    except Exception:
        data["empresa_ids_permitidas"] = []

    try:
        overrides = getattr(current_user, "ui_theme_overrides", None)
        if overrides is None or overrides == "":
            data["ui_theme_overrides"] = None
        elif isinstance(overrides, dict):
            data["ui_theme_overrides"] = overrides
        else:
            try:
                if isinstance(overrides, str):
                    data["ui_theme_overrides"] = json.loads(overrides)
                else:
                    data["ui_theme_overrides"] = dict(overrides)
            except Exception:
                data["ui_theme_overrides"] = None
    except Exception:
        data["ui_theme_overrides"] = None

    return UserRead.model_validate(data, from_attributes=False)