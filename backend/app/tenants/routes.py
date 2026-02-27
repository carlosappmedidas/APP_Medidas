# app/tenants/routes.py

from __future__ import annotations

from datetime import timedelta
from typing import Any, List, Sequence, cast, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import verify_password, get_password_hash
from app.core.auth import (
    create_access_token,
    Token,
    get_current_user,
    get_current_active_superuser,
)
from app.tenants.models import User, Tenant
from app.tenants.schemas import (
    UserRead,
    UserCreate,
    UserCreateAdmin,
    UserUpdate,
    TenantRead,
    TenantCreate,
    TenantUpdate,
)
from app.empresas.models import Empresa

settings = get_settings()

# Usuario “blindado”
PROTECTED_USER_EMAIL = "carlos@example.com"

# Roles que SÍ se pueden usar desde el panel del cliente
ALLOWED_TENANT_ROLES: Sequence[str] = ("user", "admin")

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------
# Helpers tipado (para silenciar Pylance sin tocar modelos)
# ---------------------------------------------------------


def _as_any(obj: Any) -> Any:
    """Convierte a Any a ojos del tipador (runtime no cambia nada)."""
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


def _can_manage_ui_settings(u: User) -> bool:
    """
    ✅ Permiso para gestionar ajustes UI persistidos (tema).
    Requisito: admin/owner del tenant o superuser de plataforma.
    """
    if _u_is_superuser(u):
        return True
    return _u_rol(u) in ("admin", "owner")


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
    """
    return current_user


# ---------------------------------------------------------
# ✅ AJUSTES UI (TEMA) PERSISTIDOS EN BD
#   - Guardado en users.ui_theme_overrides (JSON)
#   - Solo admin/owner (o superuser)
# ---------------------------------------------------------


class UiThemePayload(BaseModel):
    # Lo dejamos flexible (Dict[str, Any]) porque son CSS vars -> string,
    # pero no pasa nada si mañana guardas más metadatos.
    ui_theme_overrides: Optional[Dict[str, Any]] = None


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


# ✅ IMPORTANTE: el frontend está llamando a PATCH /auth/ui-theme
@router.patch("/ui-theme", response_model=UiThemePayload)
def patch_ui_theme(
    payload: UiThemePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Guarda (o limpia) el JSON de overrides del tema para el usuario actual.

    - Si ui_theme_overrides = null => se guarda NULL en BD (sin overrides)
    - Si ui_theme_overrides = {...} => se guarda el JSON

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


# ✅ Mantengo PUT por compatibilidad (no desaparece nada)
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


# ---------------------------------------------------------
# GESTIÓN DE USUARIOS DEL PROPIO TENANT
# (vista "Usuarios cliente")
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

    # ⛔️ Desde el panel del cliente solo se admiten roles user/admin
    if user_in.rol not in ALLOWED_TENANT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rol no permitido desde el panel del cliente",
        )

    user = User()
    u = _as_any(user)  # <- clave para Pylance en asignaciones
    u.tenant_id = _u_tenant_id(current_user)
    u.email = user_in.email
    u.password_hash = get_password_hash(user_in.password)
    u.rol = user_in.rol
    u.is_active = user_in.is_active
    u.is_superuser = False

    # Asociar empresas permitidas si vienen
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

    Desde aquí:
      - Solo se pueden usar roles 'user' o 'admin'.
      - No se puede cambiar el rol de un usuario 'owner'.
      - No se puede convertir a nadie en 'owner'.
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

    # ⛔️ Si el usuario objetivo es owner y NO soy yo, no lo puedo tocar
    if _u_rol(user) == "owner" and _u_id(user) != _u_id(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Los usuarios con rol 'owner' solo pueden ser gestionados por plataforma",
        )

    u = _as_any(user)  # <- clave para Pylance en asignaciones

    # Rol
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

    # Activo
    if user_in.is_active is not None:
        u.is_active = user_in.is_active

    # Password
    if user_in.password is not None and user_in.password != "":
        u.password_hash = get_password_hash(user_in.password)

    # Actualizar empresas permitidas
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


# ---------------------------------------------------------
# ENDPOINTS SOLO SUPERUSUARIO (plataforma)
# ---------------------------------------------------------


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
    Crea un usuario en cualquier tenant.
    Solo para superusuarios.
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


@router.get("/admin/tenants", response_model=List[TenantRead])
def list_all_tenants_as_superuser(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Lista TODOS los tenants (clientes) de la plataforma,
    incluyendo sus empresas asociadas.
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
    Crea un nuevo tenant (cliente).
    Solo para superusuarios.
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
    Actualiza parcialmente un tenant (nombre/plan/empresas).
    Solo para superusuarios.
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
    Elimina un tenant (cliente) de la plataforma.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    db.delete(tenant)
    db.commit()
    return None