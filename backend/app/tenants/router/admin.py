# app/tenants/router/admin.py
from __future__ import annotations

from typing import Any, List, Sequence, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.security import get_password_hash
from app.core.auth import get_current_active_superuser
from app.tenants.models import User, Tenant
from app.tenants.schemas import (
    UserRead,
    UserCreateAdmin,
    UserUpdate,
    TenantRead,
    TenantCreate,
    TenantUpdate,
)
from app.empresas.models import Empresa

router = APIRouter(prefix="/auth", tags=["auth"])

PROTECTED_USER_EMAIL = ""
ALLOWED_TENANT_ROLES: Sequence[str] = ("user", "admin", "viewer")


def _as_any(obj: Any) -> Any:
    return cast(Any, obj)

def _u_id(u: User) -> int:
    return cast(int, getattr(u, "id"))

def _u_email(u: User) -> str:
    return str(getattr(u, "email"))


@router.get("/admin/users", response_model=List[UserRead])
def list_all_users_as_superuser(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Lista TODOS los usuarios de TODOS los tenants.
    Solo accesible para superusuarios de plataforma.
    """
    users = (
        db.query(User)
        .options(joinedload(User.empresas_permitidas))
        .order_by(User.tenant_id.asc(), User.email.asc())
        .all()
    )
    return users


@router.post("/admin/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user_as_superuser(
    user_in: UserCreateAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Crea un usuario en cualquier tenant. Solo para superusuarios.
    """
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario con ese email",
        )
    user = User()
    u = _as_any(user)
    u.tenant_id = user_in.tenant_id
    u.email = user_in.email
    u.password_hash = get_password_hash(user_in.password)
    u.rol = user_in.rol
    u.is_active = user_in.is_active
    u.is_superuser = user_in.is_superuser
    if user_in.empresa_ids_permitidas:
        empresas = (
            db.query(Empresa)
            .filter(
                Empresa.id.in_(user_in.empresa_ids_permitidas),
                Empresa.tenant_id == user_in.tenant_id,
            )
            .all()
        )
        u.empresas_permitidas = empresas
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/admin/users/{user_id}", response_model=UserRead)
def update_user_as_superuser(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Actualiza un usuario globalmente como superusuario.
    """
    user = (
        db.query(User)
        .options(joinedload(User.empresas_permitidas))
        .filter(User.id == user_id)
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
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
    u = _as_any(user)
    if user_in.rol is not None:
        u.rol = user_in.rol
    if user_in.is_active is not None:
        u.is_active = user_in.is_active
    if user_in.password is not None and user_in.password != "":
        u.password_hash = get_password_hash(user_in.password)
    if user_in.empresa_ids_permitidas is not None:
        if len(user_in.empresa_ids_permitidas) == 0:
            u.empresas_permitidas = []
        else:
            tenant_id_target = cast(int, getattr(user, "tenant_id"))
            empresas = (
                db.query(Empresa)
                .filter(
                    Empresa.id.in_(user_in.empresa_ids_permitidas),
                    Empresa.tenant_id == tenant_id_target,
                )
                .all()
            )
            u.empresas_permitidas = empresas
    db.commit()
    db.refresh(user)
    return user


@router.delete("/admin/users/{user_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_user_as_superuser(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Elimina físicamente un usuario globalmente como superusuario.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
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
    db.delete(user)
    db.commit()
    return None


@router.get("/admin/tenants", response_model=List[TenantRead])
def list_all_tenants_as_superuser(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Lista TODOS los tenants de la plataforma con sus empresas.
    """
    tenants = (
        db.query(Tenant)
        .options(joinedload(Tenant.empresas))
        .order_by(Tenant.id.asc())
        .all()
    )
    return tenants


@router.post("/admin/tenants", response_model=TenantRead, status_code=status.HTTP_201_CREATED)
def create_tenant_as_superuser(
    tenant_in: TenantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Crea un nuevo tenant. Solo para superusuarios.
    """
    tenant = Tenant()
    t = _as_any(tenant)
    t.nombre = tenant_in.nombre
    t.plan = tenant_in.plan
    if tenant_in.empresa_ids:
        empresas = db.query(Empresa).filter(Empresa.id.in_(tenant_in.empresa_ids)).all()
        t.empresas = empresas
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.patch("/admin/tenants/{tenant_id}", response_model=TenantRead)
def update_tenant_as_superuser(
    tenant_id: int,
    tenant_in: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Actualiza parcialmente un tenant. Solo para superusuarios.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")
    t = _as_any(tenant)
    if tenant_in.nombre is not None:
        t.nombre = tenant_in.nombre
    if tenant_in.plan is not None:
        t.plan = tenant_in.plan
    if tenant_in.empresa_ids is not None:
        if len(tenant_in.empresa_ids) == 0:
            t.empresas = []
        else:
            empresas = db.query(Empresa).filter(Empresa.id.in_(tenant_in.empresa_ids)).all()
            t.empresas = empresas
    db.commit()
    db.refresh(tenant)
    return tenant


@router.delete("/admin/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant_as_superuser(
    tenant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Elimina un tenant. Solo para superusuarios.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")
    db.delete(tenant)
    db.commit()
    return None