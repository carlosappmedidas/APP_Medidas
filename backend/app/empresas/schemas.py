from pydantic import BaseModel, ConfigDict


class EmpresaBase(BaseModel):
    nombre: str
    codigo_ree: str | None = None
    codigo_cnmc: str | None = None
    activo: bool = True


class EmpresaCreate(EmpresaBase):
    """Datos necesarios para crear una empresa."""
    # 👇 NUEVO: solo lo usará el superuser; para usuario normal se ignora
    tenant_id: int | None = None


class EmpresaUpdate(BaseModel):
    """
    Datos para actualizar una empresa.
    Todos opcionales para permitir updates parciales.
    """
    nombre: str | None = None
    codigo_ree: str | None = None
    codigo_cnmc: str | None = None
    activo: bool | None = None

    # 👇 Opcional: si quieres permitir que el superuser cambie el tenant de la empresa
    tenant_id: int | None = None


class EmpresaRead(EmpresaBase):
    """Datos que devolvemos al cliente."""
    id: int
    tenant_id: int

    # Para leer desde modelos ORM
    model_config = ConfigDict(from_attributes=True)