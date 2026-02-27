# tests/conftest.py

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.main import app
from app.core.db import get_db
from app.core.models_base import Base
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa
from app.core.security import get_password_hash


# BD de tests: SQLite local
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_app_medidas.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db() -> Generator[Session, None, None]:
    """
    Dependencia de BD que se usa en tests.
    """
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Sobrescribimos la dependencia de BD en la app real
app.dependency_overrides[get_db] = override_get_db


# 🔁 BD limpia antes de CADA test
@pytest.fixture(autouse=True)
def reset_db() -> Generator[None, None, None]:
    """
    Antes de cada test:
    - Borramos todas las tablas
    - Las volvemos a crear
    Así cada test empieza con una BD vacía.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    # No hace falta nada al terminar


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """
    Sesión de BD para cada test.
    """
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """
    Cliente de tests. Crea:
    - tenant Luxida
    - usuario owner carlos@example.com
    - empresa demo
    en la BD limpia generada por reset_db().
    """
    # Tenant
    tenant = Tenant(  # type: ignore[arg-type]
        nombre="Luxida",
        plan="starter",
    )
    db_session.add(tenant)
    db_session.flush()  # para tener tenant.id

    # Usuario owner
    hashed = get_password_hash("changeme123")
    user = User(  # type: ignore[arg-type]
        tenant_id=tenant.id,
        email="carlos@example.com",
        password_hash=hashed,
        rol="owner",
        is_active=True,
    )
    db_session.add(user)

    # Empresa demo
    empresa = Empresa(  # type: ignore[arg-type]
        tenant_id=tenant.id,
        nombre="Empresa Demo 1",
        codigo_ree="REE123",
        codigo_cnmc="CNMC456",
        activo=True,
    )
    db_session.add(empresa)

    db_session.commit()

    with TestClient(app) as c:
        yield c