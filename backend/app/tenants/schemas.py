from datetime import datetime
from typing import Optional, List, Dict, Any
import json

from pydantic import BaseModel, EmailStr, ConfigDict, field_validator  # type: ignore[reportMissingImports]


# ----- MODELOS PÚBLICOS (USUARIOS) -----


class UserBase(BaseModel):
    email: EmailStr
    rol: str = "user"
    is_active: bool = True


class UserCreate(UserBase):
    """
    Crear usuario dentro del propio tenant.
    El tenant_id lo ponemos en el backend a partir del usuario logado.
    """
    password: str
    # 🔴 NUEVO: empresas que puede ver (IDs). Si None → no tocar (todas).
    empresa_ids_permitidas: Optional[List[int]] = None


class UserCreateAdmin(UserCreate):
    """
    Crear usuario desde un superusuario, pudiendo indicar el tenant
    y si será superusuario o no.
    """
    tenant_id: int
    is_superuser: bool = False


class UserUpdate(BaseModel):
    """
    Actualización parcial de usuario (rol, activo, password…).
    """
    rol: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    # Si viene:
    #   - None  -> no tocamos empresas
    #   - []    -> el usuario NO verá ninguna empresa
    #   - [ids] -> solo verá esas empresas
    empresa_ids_permitidas: Optional[List[int]] = None

    # ✅ NUEVO: tema UI guardado en BD (solo lo usaremos desde el frontend)
    # (En UserUpdate lo dejamos opcional por si más adelante quieres permitir editarlo por API)
    ui_theme_overrides: Optional[Dict[str, Any]] = None


class UserRead(UserBase):
    id: int
    tenant_id: int
    is_superuser: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    # 🔴 NUEVO: IDs de empresas que puede ver
    empresa_ids_permitidas: List[int] = []

    # ✅ NUEVO: overrides del tema UI
    ui_theme_overrides: Optional[Dict[str, Any]] = None

    @field_validator("ui_theme_overrides", mode="before")
    @classmethod
    def normalize_ui_theme_overrides(cls, v: Any) -> Optional[Dict[str, Any]]:
        """
        Normaliza valores heredados/raros de BD para evitar errores de serialización.

        Casos soportados:
        - None -> None
        - dict -> dict
        - "null", "None", "" -> None
        - string JSON válido -> dict si representa un objeto
        - cualquier otra cosa -> None
        """
        if v is None:
            return None

        if isinstance(v, dict):
            return v

        if isinstance(v, str):
            raw = v.strip()
            if raw == "":
                return None
            if raw.lower() in ("null", "none"):
                return None

            try:
                parsed = json.loads(raw)
            except Exception:
                return None

            if isinstance(parsed, dict):
                return parsed

            return None

        return None

    model_config = ConfigDict(from_attributes=True)


# ----- TENANTS (CLIENTES) Y EMPRESAS PARA LA VISTA GLOBAL -----


class TenantBase(BaseModel):
    nombre: str
    plan: str = "starter"


class EmpresaInTenant(BaseModel):
    """
    Empresa “ligera” para devolverla embebida dentro del Tenant.
    Ajusta los campos a los que tenga tu modelo Empresa.
    """
    id: int
    nombre: str
    codigo: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TenantCreate(TenantBase):
    """
    Crear un nuevo tenant (cliente).

    - nombre (obligatorio)
    - plan (por defecto "starter")
    - empresa_ids (opcional): lista de IDs de empresas que queremos
      asociar a este tenant en el momento de crearlo.
    """
    empresa_ids: Optional[List[int]] = None


class TenantUpdate(BaseModel):
    """
    Actualización parcial de un tenant.

    - nombre / plan opcionales
    - empresa_ids opcional:
        * Si viene None → no tocamos las empresas
        * Si viene lista vacía [] → dejamos el tenant sin empresas
        * Si viene con IDs → asociamos esas empresas al tenant
    """
    nombre: Optional[str] = None
    plan: Optional[str] = None
    empresa_ids: Optional[List[int]] = None


class TenantRead(TenantBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    # lista de empresas asociadas a este tenant
    empresas: List[EmpresaInTenant] = []

    model_config = ConfigDict(from_attributes=True)