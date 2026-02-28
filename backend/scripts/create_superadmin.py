from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ✅ Asegura imports tipo "from app..." aunque ejecutes el script desde /scripts
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.tenants.models import Tenant, User

# ✅ IMPORTANTE: importar modelos para que SQLAlchemy registre relaciones
# (Tenant tiene relationship("Empresa") y si no se importa Empresa, peta)
from app.empresas import models as empresas_models  # noqa: F401
from app.ingestion import models as ingestion_models  # noqa: F401
from app.measures import models as measures_models  # noqa: F401

TENANT_NAME = "plataforma"
EMAIL = "superadmin@plataforma.com"
PASSWORD = "SuperAdmin123!"


def main() -> int:
    settings = get_settings()
    if not settings.DATABASE_URL:
        print("ERROR: DATABASE_URL no está configurada")
        return 1

    engine = create_engine(settings.DATABASE_URL, future=True)
    SessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        future=True,
    )

    with SessionLocal() as db:
        tenant = db.query(Tenant).filter(Tenant.nombre == TENANT_NAME).one_or_none()

        if tenant is None:
            tenant = Tenant()
            tenant.nombre = TENANT_NAME  # type: ignore[assignment]
            tenant.plan = "platform"  # type: ignore[assignment]
            db.add(tenant)
            db.flush()
            print(f"✅ Tenant creado: {TENANT_NAME} (id={tenant.id})")
        else:
            print(f"ℹ️ Tenant ya existe: {TENANT_NAME} (id={tenant.id})")

        user = db.query(User).filter(User.email == EMAIL).one_or_none()

        if user is None:
            user = User()
            user.tenant_id = tenant.id  # type: ignore[assignment]
            user.email = EMAIL  # type: ignore[assignment]
            user.password_hash = get_password_hash(PASSWORD)  # type: ignore[assignment]
            user.rol = "owner"  # type: ignore[assignment]
            user.is_active = True  # type: ignore[assignment]
            user.is_superuser = True  # type: ignore[assignment]

            db.add(user)
            db.commit()

            print("✅ Superadmin creado:")
            print(f"   email: {EMAIL}")
            print(f"   password: {PASSWORD}")
            print(f"   tenant: {TENANT_NAME}")
            print("   is_superuser: True")
            return 0

        # Si existe, lo “arreglamos” para asegurar flags correctos
        user.tenant_id = tenant.id  # type: ignore[assignment]
        user.is_active = True  # type: ignore[assignment]
        user.is_superuser = True  # type: ignore[assignment]

        # ✅ Evita "if not user.password_hash" (Pylance lo ve como Column[str])
        current_hash = getattr(user, "password_hash", None)
        if current_hash in (None, ""):
            user.password_hash = get_password_hash(PASSWORD)  # type: ignore[assignment]

        db.commit()

        print("✅ Superadmin ya existía, actualizado (is_superuser=True, is_active=True).")
        print(f"   email: {EMAIL}")
        print(f"   password: {PASSWORD}")
        print(f"   tenant: {TENANT_NAME}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())