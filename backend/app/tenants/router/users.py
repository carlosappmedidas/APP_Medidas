# app/tenants/router/users.py
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


# ---------------------------------------------------------
# GESTIÓN DE USUARIOS DEL PROPIO TENANT
# ---------------------------------------------------------
@router.get("/users", response_model=List[UserRead])
def list_my_tenant_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista los usuarios del tenant actual.
    Solo permitido para roles 'admin' o 'owner'.
    El usuario protegido no aparece.
    """
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
    """
    Crea un usuario dentro del mismo tenant que el usuario actual.
    No permite crear superusuarios ni usuarios con rol 'owner'.
    Solo permitido para roles 'admin' o 'owner'.
    """
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
    user = User()
    u = _as_any(user)
    u.tenant_id = _u_tenant_id(current_user)
    u.email = user_in.email
    u.password_hash = get_password_hash(user_in.password)
    u.rol = user_in.rol
    u.is_active = user_in.is_active
    u.is_superuser = False
    if user_in.empresa_ids_permitidas:
        empresas = (
            db.query(Empresa)
            .filter(
                Empresa.id.in_(user_in.empresa_ids_permitidas),
                Empresa.tenant_id == _u_tenant_id(current_user),
            )
            .all()
        )
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
    """
    Actualiza rol / activo / contraseña de un usuario de tu tenant.
    """
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
        if _u_rol(user) == "owner" and user_in.rol != "owner":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El rol 'owner' solo puede cambiarlo plataforma",
            )
        u.rol = user_in.rol
    if user_in.is_active is not None:
        u.is_active = user_in.is_active
    if user_in.password is not None and user_in.password != "":
        u.password_hash = get_password_hash(user_in.password)
    if user_in.empresa_ids_permitidas is not None:
        if len(user_in.empresa_ids_permitidas) == 0:
            u.empresas_permitidas = []
        else:
            empresas = (
                db.query(Empresa)
                .filter(
                    Empresa.id.in_(user_in.empresa_ids_permitidas),
                    Empresa.tenant_id == _u_tenant_id(current_user),
                )
                .all()
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
    """
    Desactiva (is_active = False) un usuario de tu mismo tenant.
    """
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
    """
    Elimina físicamente un usuario de tu mismo tenant.
    """
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