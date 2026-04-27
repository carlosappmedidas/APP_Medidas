# pyright: reportCallIssue=false
"""
Tests unitarios del módulo `app.core.permissions`.

Cubre las 4 reglas de `get_allowed_empresa_ids` y los principales caminos
de `assert_empresa_access`. Usa el `db_session` y `reset_db` de conftest.py.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.permissions import (
    assert_empresa_access,
    get_allowed_empresa_ids,
)
from app.core.security import get_password_hash
from app.empresas.models import Empresa
from app.tenants.models import Tenant, User


# ---------------------------------------------------------------------------
# Helpers de creación de fixtures puntuales
#
# Nota Pylance: los constructores de SQLAlchemy 2.0 con declarative_base()
# no exponen los kwargs como parámetros tipados, así que se silencia el
# warning correspondiente con `# pyright: ignore[reportCallIssue]`.
# ---------------------------------------------------------------------------


def _crear_tenant(db: Session, nombre: str) -> int:
    """Crea un Tenant y devuelve su ID (ya como int) para evitar Column[int]."""
    tenant = Tenant(  # pyright: ignore[reportCallIssue]
        nombre=nombre,
        plan="starter",
    )
    db.add(tenant)
    db.flush()
    return int(tenant.id)  # type: ignore[arg-type]


def _crear_empresa(
    db: Session,
    tenant_id: int,
    nombre: str,
    activo: bool = True,
) -> Empresa:
    empresa = Empresa(  # pyright: ignore[reportCallIssue]
        tenant_id=tenant_id,
        nombre=nombre,
        codigo_ree=None,
        codigo_cnmc=None,
        activo=activo,
    )
    db.add(empresa)
    db.flush()
    return empresa


def _crear_user(
    db: Session,
    tenant_id: int,
    email: str,
    rol: str,
    is_superuser: bool = False,
    empresas: list[Empresa] | None = None,
) -> User:
    user = User(  # pyright: ignore[reportCallIssue]
        tenant_id=tenant_id,
        email=email,
        password_hash=get_password_hash("changeme123"),
        rol=rol,
        is_active=True,
        is_superuser=is_superuser,
    )
    if empresas:
        user.empresas_permitidas = empresas
    db.add(user)
    db.flush()
    return user


def _eid(empresa: Empresa) -> int:
    """Helper para extraer el ID de una empresa como int (evita Column[int])."""
    return int(empresa.id)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Tests de get_allowed_empresa_ids
# ---------------------------------------------------------------------------


class TestGetAllowedEmpresaIds:
    """4 reglas + casos defensivos cross-tenant."""

    def test_regla_1_superuser_ve_todas_del_tenant(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")
        e2 = _crear_empresa(db_session, tenant_id, "E2")
        e3 = _crear_empresa(db_session, tenant_id, "E3")

        super_user = _crear_user(
            db_session,
            tenant_id,
            "super@example.com",
            rol="admin",
            is_superuser=True,
        )

        ids = get_allowed_empresa_ids(db_session, super_user)
        assert sorted(ids) == sorted([_eid(e1), _eid(e2), _eid(e3)])

    def test_regla_1_superuser_no_ve_empresas_de_otros_tenants(
        self,
        db_session: Session,
    ) -> None:
        t1_id = _crear_tenant(db_session, "T1")
        t2_id = _crear_tenant(db_session, "T2")
        e1_t1 = _crear_empresa(db_session, t1_id, "E1-T1")
        _crear_empresa(db_session, t2_id, "E1-T2")

        super_user = _crear_user(
            db_session,
            t1_id,
            "super@example.com",
            rol="admin",
            is_superuser=True,
        )

        ids = get_allowed_empresa_ids(db_session, super_user)
        assert ids == [_eid(e1_t1)]

    def test_regla_2_user_con_empresas_explicitas_ve_solo_esas(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")
        e2 = _crear_empresa(db_session, tenant_id, "E2")
        _crear_empresa(db_session, tenant_id, "E3")  # no asignada

        user = _crear_user(
            db_session,
            tenant_id,
            "user@example.com",
            rol="user",
            empresas=[e1, e2],
        )

        ids = get_allowed_empresa_ids(db_session, user)
        assert sorted(ids) == sorted([_eid(e1), _eid(e2)])

    def test_regla_3_admin_sin_empresas_ve_todas_del_tenant(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")
        e2 = _crear_empresa(db_session, tenant_id, "E2")

        admin = _crear_user(
            db_session,
            tenant_id,
            "admin@example.com",
            rol="admin",
            empresas=None,
        )

        ids = get_allowed_empresa_ids(db_session, admin)
        assert sorted(ids) == sorted([_eid(e1), _eid(e2)])

    def test_regla_3_owner_sin_empresas_ve_todas_del_tenant(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")

        owner = _crear_user(
            db_session,
            tenant_id,
            "owner@example.com",
            rol="owner",
            empresas=None,
        )

        ids = get_allowed_empresa_ids(db_session, owner)
        assert ids == [_eid(e1)]

    def test_regla_4_user_sin_empresas_no_ve_nada(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        _crear_empresa(db_session, tenant_id, "E1")
        _crear_empresa(db_session, tenant_id, "E2")

        user = _crear_user(
            db_session,
            tenant_id,
            "user@example.com",
            rol="user",
            empresas=None,
        )

        ids = get_allowed_empresa_ids(db_session, user)
        assert ids == []

    def test_regla_4_viewer_sin_empresas_no_ve_nada(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        _crear_empresa(db_session, tenant_id, "E1")

        viewer = _crear_user(
            db_session,
            tenant_id,
            "viewer@example.com",
            rol="viewer",
            empresas=None,
        )

        ids = get_allowed_empresa_ids(db_session, viewer)
        assert ids == []


# ---------------------------------------------------------------------------
# Tests de assert_empresa_access
# ---------------------------------------------------------------------------


class TestAssertEmpresaAccess:
    """Comportamiento por rol y casos de cross-tenant."""

    def test_empresa_inexistente_lanza_404(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        user = _crear_user(
            db_session,
            tenant_id,
            "u@example.com",
            rol="admin",
        )

        with pytest.raises(HTTPException) as exc:
            assert_empresa_access(db_session, user, empresa_id=99999)
        assert exc.value.status_code == 404

    def test_superuser_acceso_total(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        empresa = _crear_empresa(db_session, tenant_id, "E1")
        super_user = _crear_user(
            db_session,
            tenant_id,
            "s@example.com",
            rol="admin",
            is_superuser=True,
        )

        out = assert_empresa_access(db_session, super_user, _eid(empresa))
        assert _eid(out) == _eid(empresa)

    def test_otro_tenant_lanza_403(
        self,
        db_session: Session,
    ) -> None:
        t1_id = _crear_tenant(db_session, "T1")
        t2_id = _crear_tenant(db_session, "T2")
        empresa_t2 = _crear_empresa(db_session, t2_id, "E1-T2")
        user_t1 = _crear_user(
            db_session,
            t1_id,
            "u@example.com",
            rol="admin",
        )

        with pytest.raises(HTTPException) as exc:
            assert_empresa_access(db_session, user_t1, _eid(empresa_t2))
        assert exc.value.status_code == 403

    def test_user_con_empresa_asignada_acceso_ok(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")
        e2 = _crear_empresa(db_session, tenant_id, "E2")
        user = _crear_user(
            db_session,
            tenant_id,
            "u@example.com",
            rol="user",
            empresas=[e1],
        )

        # E1: ok
        out = assert_empresa_access(db_session, user, _eid(e1))
        assert _eid(out) == _eid(e1)

        # E2: 403
        with pytest.raises(HTTPException) as exc:
            assert_empresa_access(db_session, user, _eid(e2))
        assert exc.value.status_code == 403

    def test_admin_sin_asignacion_acceso_a_todas(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")
        admin = _crear_user(
            db_session,
            tenant_id,
            "a@example.com",
            rol="admin",
        )

        out = assert_empresa_access(db_session, admin, _eid(e1))
        assert _eid(out) == _eid(e1)

    def test_user_sin_asignacion_lanza_403(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")
        user = _crear_user(
            db_session,
            tenant_id,
            "u@example.com",
            rol="user",
        )

        with pytest.raises(HTTPException) as exc:
            assert_empresa_access(db_session, user, _eid(e1))
        assert exc.value.status_code == 403

    def test_viewer_sin_asignacion_lanza_403(
        self,
        db_session: Session,
    ) -> None:
        tenant_id = _crear_tenant(db_session, "T1")
        e1 = _crear_empresa(db_session, tenant_id, "E1")
        viewer = _crear_user(
            db_session,
            tenant_id,
            "v@example.com",
            rol="viewer",
        )

        with pytest.raises(HTTPException) as exc:
            assert_empresa_access(db_session, viewer, _eid(e1))
        assert exc.value.status_code == 403