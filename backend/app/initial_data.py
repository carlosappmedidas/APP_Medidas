# app/initial_data.py

from __future__ import annotations

from typing import Any, cast

from app.core.db import SessionLocal
from app.core.security import get_password_hash
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa  # noqa: F401  (solo para registrar el modelo)

# 👇 Cambia estos valores a lo que quieras
TENANT_NAME = "Luxida"
ADMIN_EMAIL = "carlos@example.com"
ADMIN_PASSWORD = "changeme123"  # solo para desarrollo


def create_initial_data() -> None:
    db = SessionLocal()
    try:
        # 1) Tenant
        tenant = db.query(Tenant).filter(Tenant.nombre == TENANT_NAME).first()
        if not tenant:
            tenant = Tenant()
            t = cast(Any, tenant)
            t.nombre = TENANT_NAME
            t.plan = "starter"

            db.add(tenant)
            db.commit()
            db.refresh(tenant)
            print(f"✅ Tenant creado: {cast(Any, tenant).nombre} (id={cast(Any, tenant).id})")
        else:
            print(f"ℹ️ Tenant ya existe: {cast(Any, tenant).nombre} (id={cast(Any, tenant).id})")

        # 2) Usuario owner / superusuario de plataforma
        user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if not user:
            user = User()
            u = cast(Any, user)

            # tenant.id en SQLAlchemy suele estar tipado como Column[int] a ojos de Pylance
            u.tenant_id = int(cast(Any, tenant).id)
            u.email = ADMIN_EMAIL
            u.password_hash = get_password_hash(ADMIN_PASSWORD)
            u.rol = "owner"
            u.is_active = True
            u.is_superuser = True  # 👈 superusuario de plataforma

            db.add(user)
            db.commit()
            db.refresh(user)
            print(
                f"✅ Usuario superadmin creado: {cast(Any, user).email} "
                f"(id={cast(Any, user).id}, tenant_id={cast(Any, user).tenant_id})"
            )
        else:
            # Si ya existe, nos aseguramos de que siga activo y como superusuario
            u = cast(Any, user)
            changed = False

            if not bool(getattr(u, "is_superuser", False)):
                u.is_superuser = True
                changed = True

            if not bool(getattr(u, "is_active", False)):
                u.is_active = True
                changed = True

            if changed:
                db.commit()
                print(
                    "🔧 Usuario existente actualizado como superadmin activo: "
                    f"{u.email} (id={u.id})"
                )
            else:
                print(f"ℹ️ Usuario superadmin ya existente: {u.email} (id={u.id})")

    finally:
        db.close()


if __name__ == "__main__":
    create_initial_data()