"""
Helpers centralizados de permisos por empresa.

Este módulo es la ÚNICA fuente de verdad sobre qué empresas puede ver un
usuario. Cualquier endpoint que devuelva datos por empresa o que reciba un
`empresa_id` por path/query debe usar estos helpers en lugar de implementar
su propia lógica.

Reglas (orden de evaluación) para `get_allowed_empresa_ids`:

1. Superuser            → TODAS las empresas del tenant del user.
2. Tiene asignación     → solo esas empresas (filtradas por tenant del user
                          como salvaguarda defensiva).
3. Sin asignación + admin/owner
                        → TODAS las empresas del tenant (fallback "ver todo
                          si no me han limitado").
4. Sin asignación + user/viewer
                        → lista vacía (no ve nada). Esto fuerza al admin a
                          asignar empresas explícitamente al crear users.

`assert_empresa_access` aplica las mismas reglas pero para un único
`empresa_id`, devolviendo el objeto `Empresa` cargado para que el caller
no tenga que hacerlo de nuevo.
"""

from __future__ import annotations

from typing import cast

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.empresas.models import Empresa
from app.tenants.models import User


__all__ = [
    "get_allowed_empresa_ids",
    "assert_empresa_access",
]


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------


def _todas_empresas_del_tenant(db: Session, tenant_id: int) -> list[int]:
    """
    Devuelve los IDs de todas las empresas del tenant indicado, ordenados.

    Nota: NO filtra por `Empresa.activo`. Si en el futuro se quiere ocultar
    empresas inactivas en algún listado concreto, ese filtro debe aplicarse
    en el endpoint, no aquí (este módulo es de PERMISOS, no de visibilidad
    de empresas inactivas).
    """
    rows = (
        db.query(Empresa.id)
        .filter(Empresa.tenant_id == tenant_id)
        .order_by(Empresa.id.asc())
        .all()
    )
    return [int(row[0]) for row in rows if row and row[0] is not None]


def _explicit_empresa_ids(user: User, tenant_id: int) -> list[int]:
    """
    Lee la relación SQLA `User.empresas_permitidas` (lista de objetos
    `Empresa`) y devuelve los IDs filtrados defensivamente por `tenant_id`.

    El filtro por `tenant_id` es una salvaguarda: en condiciones normales
    todas las empresas asignadas a un user pertenecen ya a su tenant, pero
    si por cualquier motivo (manipulación directa de BD, bug futuro)
    apareciera una empresa de otro tenant, NUNCA debe colarse en el
    resultado.
    """
    rel = getattr(user, "empresas_permitidas", None) or []
    out: list[int] = []
    for emp in rel:
        emp_tenant = getattr(emp, "tenant_id", None)
        emp_id = getattr(emp, "id", None)
        if emp_id is None or emp_tenant is None:
            continue
        if int(emp_tenant) != tenant_id:
            continue
        out.append(int(emp_id))
    return out


def _is_superuser(user: User) -> bool:
    return bool(getattr(user, "is_superuser", False))


def _user_role(user: User) -> str:
    return str(getattr(user, "rol", "") or "").lower()


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------


def get_allowed_empresa_ids(db: Session, user: User) -> list[int]:
    """
    Devuelve la lista de IDs de empresas que `user` puede ver.

    Una lista vacía significa "no ve ninguna empresa" (NO significa
    "ve todas"; eso es un bug clásico que este helper evita).

    Ver el docstring del módulo para las 4 reglas aplicadas.
    """
    tenant_id = int(cast(int, user.tenant_id))

    # 1) Superuser: todas las empresas del tenant del user
    if _is_superuser(user):
        return _todas_empresas_del_tenant(db, tenant_id)

    # 2) User con empresas asignadas explícitamente: solo esas
    explicit = _explicit_empresa_ids(user, tenant_id)
    if explicit:
        return explicit

    # 3) Sin empresas asignadas + rol owner/admin: todas del tenant
    if _user_role(user) in {"owner", "admin"}:
        return _todas_empresas_del_tenant(db, tenant_id)

    # 4) user/viewer sin empresas asignadas: ninguna
    return []


def assert_empresa_access(
    db: Session,
    user: User,
    empresa_id: int,
) -> Empresa:
    """
    Lanza HTTPException si `user` no puede acceder a `empresa_id`.

    Devuelve el objeto `Empresa` cargado para que el caller no tenga que
    hacer la query otra vez. Lanza 404 si la empresa no existe.

    Reglas (mismo modelo que `get_allowed_empresa_ids`):
      - Superuser: acceso libre (siempre que la empresa exista).
      - Resto: la empresa debe pertenecer al tenant del user Y, si el user
        tiene asignación explícita de empresas, debe estar entre ellas.
        Si NO tiene asignación explícita, solo owner/admin tienen acceso
        completo al tenant; user/viewer sin asignación → 403.
    """
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada",
        )

    # 1) Superuser: bypass total
    if _is_superuser(user):
        return empresa

    # 2) Mismo tenant (defensa estricta)
    user_tenant_id = int(cast(int, user.tenant_id))
    empresa_tenant_id = int(cast(int, empresa.tenant_id))
    if empresa_tenant_id != user_tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sin acceso a esta empresa",
        )

    empresa_id_int = int(cast(int, empresa.id))
    explicit = _explicit_empresa_ids(user, user_tenant_id)

    # 3) Si tiene empresas asignadas, debe estar en la lista
    if explicit:
        if empresa_id_int not in explicit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sin acceso a esta empresa",
            )
        return empresa

    # 4) Sin empresas asignadas: solo owner/admin entran
    if _user_role(user) in {"owner", "admin"}:
        return empresa

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Sin acceso a esta empresa",
    )