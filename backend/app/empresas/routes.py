from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth import get_current_user
from app.empresas.models import Empresa
from app.empresas.schemas import (
    EmpresaCreate,
    EmpresaRead,
    EmpresaUpdate,
)
from app.tenants.models import User

router = APIRouter(prefix="/empresas", tags=["empresas"])


def _aplicar_scope_empresas(
    query,
    current_user: User,
):
    """
    Aplica el scope de empresas que puede ver el usuario.

    - Superuser: no se restringe nada.
    - Usuario normal:
        * Siempre restringido a su tenant.
        * Si tiene empresa_ids_permitidas no vacío → solo esas.
        * Si está vacío → todas las de su tenant.
    """
    if bool(getattr(current_user, "is_superuser", False)):
        return query

    query = query.filter(Empresa.tenant_id == current_user.tenant_id)

    empresa_ids = getattr(current_user, "empresa_ids_permitidas", []) or []
    if empresa_ids:
        query = query.filter(Empresa.id.in_(empresa_ids))

    return query


def _get_empresa_or_404(
    empresa_id: int,
    current_user: User,
    db: Session,
) -> Empresa:
    """
    Si es usuario normal: solo puede acceder a empresas de su tenant
    y a las que tenga permitidas (si se ha configurado).
    Si es superuser: puede acceder a cualquier empresa.
    """
    query = db.query(Empresa).filter(Empresa.id == empresa_id)
    query = _aplicar_scope_empresas(query, current_user)

    empresa = query.first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada",
        )
    return empresa


@router.get("/", response_model=list[EmpresaRead])
def list_empresas(
    solo_activas: bool = True,
    tenant_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista empresas.

    - Usuario normal:
        * Solo ve empresas de su tenant.
        * Si tiene empresas asignadas → solo esas.
    - Superuser:
        * Si se pasa tenant_id -> filtra por ese tenant.
        * Si NO se pasa tenant_id -> devuelve empresas de todos los tenants.
    """
    query = db.query(Empresa)

    if bool(getattr(current_user, "is_superuser", False)):
        if tenant_id is not None:
            query = query.filter(Empresa.tenant_id == tenant_id)
    else:
        query = _aplicar_scope_empresas(query, current_user)

    if solo_activas:
        query = query.filter(Empresa.activo.is_(True))

    empresas = query.order_by(Empresa.id).all()
    return empresas


@router.post("/", response_model=EmpresaRead, status_code=status.HTTP_201_CREATED)
def create_empresa(
    data: EmpresaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Crea una empresa.

    - Usuario normal:
        * Siempre se crea en su propio tenant.
    - Superuser:
        * Si data.tenant_id viene informado -> se crea para ese tenant.
        * Si no viene -> se crea en su tenant actual.
    """
    resolved_tenant_id = current_user.tenant_id
    if bool(getattr(current_user, "is_superuser", False)) and data.tenant_id:
        resolved_tenant_id = data.tenant_id

    payload: dict[str, Any] = {
        "tenant_id": resolved_tenant_id,
        "nombre": data.nombre,
        "codigo_ree": data.codigo_ree,
        "codigo_cnmc": data.codigo_cnmc,
        "activo": data.activo,
    }

    # SQLAlchemy clásico no tipa bien kwargs para Pylance/Pyright.
    empresa = Empresa(**payload)  # type: ignore[call-arg]

    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa


@router.get("/{empresa_id}", response_model=EmpresaRead)
def get_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el detalle de una empresa.

    - Usuario normal: solo empresas del scope permitido
      (tenant + empresas_permitidas si están configuradas).
    - Superuser: cualquier empresa.
    """
    empresa = _get_empresa_or_404(empresa_id, current_user, db)
    return empresa


@router.put("/{empresa_id}", response_model=EmpresaRead)
def update_empresa(
    empresa_id: int,
    data: EmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Actualiza una empresa.
    """
    empresa = _get_empresa_or_404(empresa_id, current_user, db)

    update_data = data.model_dump(exclude_unset=True)

    if "tenant_id" in update_data:
        if not bool(getattr(current_user, "is_superuser", False)):
            update_data.pop("tenant_id", None)

    for field, value in update_data.items():
        setattr(empresa, field, value)

    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa


@router.delete("/{empresa_id}", response_model=EmpresaRead)
def delete_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Baja lógica (activo=False).
    """
    empresa = _get_empresa_or_404(empresa_id, current_user, db)

    # Evita warnings de tipado (Column[bool] vs bool) y es equivalente.
    setattr(empresa, "activo", False)

    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa