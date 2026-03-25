from __future__ import annotations

from typing import Any, List, Sequence, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.security import get_password_hash
from app.core.auth import get_current_user
from app.tenants.models import User
from app.tenants.schemas import UserRead, UserCreate, UserUpdate
from app.empresas.models import Empresa

router = APIRouter(prefix="/auth", tags=["auth"])

PROTECTED_USER_EMAIL = ""
ALLOWED_TENANT_ROLES: Sequence[str] = ("user", "admin")


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

def _validate_empresas_permitidas(
    db: Session,
    *,
    tenant_id: int,
    empresa_ids: list[int] | None,
) -> list[Empresa]:
    if empresa_ids is None:
        return []

    if len(empresa_ids) == 0:
        return []

    empresas = (
        db.query(Empresa)
        .filter(
            Empresa.id.in_(empresa_ids),
            Empresa.tenant_id == tenant_id,
        )
        .all()
    )

    found_ids = {int(cast(int, e.id)) for e in empresas}
    requested_ids = {int(x) for x in empresa_ids}

    if found_ids != requested_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Alguna empresa indicada no pertenece al tenant",
        )

    return empresas


@router.get("/users", response_model=List[UserRead])
def list_my_tenant_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _u_rol(current_user) not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para listar usuarios del tenant",
        )

    users = (
        db.query(User)
        .options(joinedload(User.empresas_permitidas))
        .filter(User.tenant_id == _u_tenant_id(current_user))
        .order_by(User.email.asc())
        .all()
    )
    users = [u for u in users if _u_email(u) != PROTECTED_USER_EMAIL]
    return users


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user_for_my_tenant(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _u_rol(current_user) not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para crear usuarios en este tenant",
        )

    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario con ese email",
        )

    if user_in.rol not in ALLOWED_TENANT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rol no permitido desde el panel del cliente",
        )

    empresas = _validate_empresas_permitidas(
        db,
        tenant_id=_u_tenant_id(current_user),
        empresa_ids=user_in.empresa_ids_permitidas,
    )

    user = User()
    u = _as_any(user)
    u.tenant_id = _u_tenant_id(current_user)
    u.email = user_in.email
    u.password_hash = get_password_hash(user_in.password)
    u.rol = user_in.rol
    u.is_active = user_in.is_active
    u.is_superuser = False
    u.empresas_permitidas = empresas

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user_in_my_tenant(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _u_rol(current_user) not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para actualizar usuarios en este tenant",
        )

    user = (
        db.query(User)
        .options(joinedload(User.empresas_permitidas))
        .filter(
            User.id == user_id,
            User.tenant_id == _u_tenant_id(current_user),
        )
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado en tu tenant",
        )

    if _u_email(user) == PROTECTED_USER_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuario solo puede ser gestionado por plataforma",
        )

    if _u_id(user) == _u_id(current_user) and user_in.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar tu propio usuario",
        )

    if _u_rol(user) == "owner" and _u_id(user) != _u_id(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Los usuarios con rol 'owner' solo pueden ser gestionados por plataforma",
        )

    u = _as_any(user)

    if user_in.rol is not None:
        if user_in.rol not in ALLOWED_TENANT_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Rol no permitido desde el panel del cliente",
            )
        u.rol = user_in.rol

    if user_in.is_active is not None:
        u.is_active = user_in.is_active

    if user_in.password is not None and user_in.password != "":
        u.password_hash = get_password_hash(user_in.password)

    if user_in.ui_theme_overrides is not None:
        u.ui_theme_overrides = user_in.ui_theme_overrides

    if user_in.empresa_ids_permitidas is not None:
        empresas = _validate_empresas_permitidas(
            db,
            tenant_id=_u_tenant_id(current_user),
            empresa_ids=user_in.empresa_ids_permitidas,
        )
        u.empresas_permitidas = empresas

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user_in_my_tenant(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _u_rol(current_user) not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para desactivar usuarios en este tenant",
        )

    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            User.tenant_id == _u_tenant_id(current_user),
        )
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado en tu tenant",
        )

    if _u_email(user) == PROTECTED_USER_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuario solo puede ser gestionado por plataforma",
        )

    if _u_id(user) == _u_id(current_user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar tu propio usuario",
        )

    if _u_rol(user) == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes desactivar un usuario con rol 'owner' desde el panel del cliente",
        )

    _as_any(user).is_active = False
    db.commit()
    return None


@router.delete("/users/{user_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_user_in_my_tenant(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _u_rol(current_user) not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para eliminar usuarios en este tenant",
        )

    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            User.tenant_id == _u_tenant_id(current_user),
        )
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado en tu tenant",
        )

    if _u_email(user) == PROTECTED_USER_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este usuario solo puede ser gestionado por plataforma",
        )

    if _u_id(user) == _u_id(current_user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propio usuario",
        )

    if _u_rol(user) == "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes eliminar un usuario con rol 'owner' desde el panel del cliente",
        )

    db.delete(user)
    db.commit()
    return None