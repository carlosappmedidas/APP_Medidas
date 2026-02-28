# scripts/create_superadmin.py
import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.tenants.models import Tenant, User
from app.core.security import get_password_hash


TENANT_NAME = "plataforma"
EMAIL = "superadmin@plataforma.com"
PASSWORD = "SuperAdmin123!"


def main() -> int:
    settings = get_settings()
    if not settings.DATABASE_URL:
        print("ERROR: DATABASE_URL no está configurada")
        return 1

    engine = create_engine(settings.DATABASE_URL, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        # 1) Tenant "plataforma"
        tenant = db.query(Tenant).filter(Tenant.nombre == TENANT_NAME).one_or_none()
        if tenant is None:
            tenant = Tenant(nombre=TENANT_NAME, plan="platform")
            db.add(tenant)
            db.flush()  # para obtener tenant.id
            print(f"✅ Tenant creado: {TENANT_NAME} (id={tenant.id})")
        else:
            print(f"ℹ️ Tenant ya existe: {TENANT_NAME} (id={tenant.id})")

        # 2) Usuario superadmin
        user = db.query(User).filter(User.email == EMAIL).one_or_none()
        if user is None:
            user = User(
                tenant_id=tenant.id,
                email=EMAIL,
                password_hash=get_password_hash(PASSWORD),
                rol="owner",
                is_active=True,
                is_superuser=True,
            )
            db.add(user)
            db.commit()
            print("✅ Superadmin creado:")
            print(f"   email: {EMAIL}")
            print(f"   tenant: {TENANT_NAME}")
            print("   is_superuser: True")
            return 0

        # Si existe, lo “arreglamos” para asegurar flags correctos
        user.tenant_id = tenant.id
        user.is_active = True
        user.is_superuser = True
        if not user.password_hash:
            user.password_hash = get_password_hash(PASSWORD)

        db.commit()
        print("✅ Superadmin ya existía, actualizado (is_superuser=True, is_active=True).")
        print(f"   email: {EMAIL}")
        print(f"   tenant: {TENANT_NAME}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())