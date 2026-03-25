from datetime import datetime
from typing import Optional, List, Dict, Any
import json

from pydantic import BaseModel, EmailStr, ConfigDict, field_validator  # type: ignore[reportMissingImports]


class UserBase(BaseModel):
    email: EmailStr
    rol: str = "user"
    is_active: bool = True


class UserCreate(UserBase):
    password: str
    empresa_ids_permitidas: Optional[List[int]] = None


class UserCreateAdmin(UserCreate):
    tenant_id: int
    is_superuser: bool = False


class UserUpdate(BaseModel):
    rol: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    empresa_ids_permitidas: Optional[List[int]] = None
    ui_theme_overrides: Optional[Dict[str, Any]] = None


class UserRead(UserBase):
    id: int
    tenant_id: int
    is_superuser: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    empresa_ids_permitidas: List[int] = []
    ui_theme_overrides: Optional[Dict[str, Any]] = None

    @field_validator("ui_theme_overrides", mode="before")
    @classmethod
    def normalize_ui_theme_overrides(cls, v: Any) -> Optional[Dict[str, Any]]:
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


class UiThemePayload(BaseModel):
    ui_theme_overrides: Optional[Dict[str, Any]] = None


class EmpresaInTenant(BaseModel):
    id: int
    nombre: str
    codigo: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TenantBase(BaseModel):
    nombre: str
    plan: str = "starter"


class TenantCreate(TenantBase):
    empresa_ids: Optional[List[int]] = None


class TenantUpdate(BaseModel):
    nombre: Optional[str] = None
    plan: Optional[str] = None
    empresa_ids: Optional[List[int]] = None


class TenantRead(TenantBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    empresas: List[EmpresaInTenant] = []

    model_config = ConfigDict(from_attributes=True)