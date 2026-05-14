# app/initial_data.py

from __future__ import annotations

import getpass
import os
import sys
from typing import Any, cast

from app.core.db import SessionLocal
from app.core.security import get_password_hash
from app.tenants.models import Tenant, User
from app.empresas.models import Empresa  # noqa: F401  (solo para registrar el modelo)


def _get_initial_config() -> tuple[str, str, str]:
    """
    Obtiene los datos iniciales para crear Tenant + superadmin.

    Prioriza variables de entorno (útil para CI/CD o despliegues automatizados).
    Si faltan, pregunta interactivamente por teclado (útil para humanos).
    La password NUNCA tiene default por seguridad: o env var o prompt.
    """
    tenant_name = os.environ.get("INITIAL_TENANT_NAME")
    if not tenant_name:
        try:
            tenant_name = input("Tenant name [Luxida]: ").strip() or "Luxida"
        except EOFError:
            tenant_name = "Luxida"

    admin_email = os.environ.get("INITIAL_ADMIN_EMAIL")
    if not admin_email:
        try:
            admin_email = input("Admin email: ").strip()
        except EOFError:
            admin_email = ""
        if not admin_email:
            sys.stderr.write("❌ ERROR: email de admin obligatorio.\n")
            sys.exit(1)

    admin_password = os.environ.get("INITIAL_ADMIN_PASSWORD")
    if not admin_password:
        try:
            admin_password = getpass.getpass("Admin password: ")
            confirm = getpass.getpass("Repite password: ")
        except EOFError:
            sys.stderr.write(
                "❌ ERROR: este entorno no permite input interactivo.\n"
                "   Define INITIAL_ADMIN_PASSWORD como variable de entorno.\n"
            )
            sys.exit(1)
        if not admin_password:
            sys.stderr.write("❌ ERROR: password de admin obligatorio.\n")
            sys.exit(1)
        if admin_password != confirm:
            sys.stderr.write("❌ ERROR: las dos passwords no coinciden.\n")
            sys.exit(1)

    return tenant_name, admin_email, admin_password


def create_initial_data() -> None:
    # Pedir credenciales solo cuando se va a usar (no en import)
    tenant_name, admin_email, admin_password = _get_initial_config()

    db = SessionLocal()
    try:
        # 1) Tenant
        tenant = db.query(Tenant).filter(Tenant.nombre == tenant_name).first()
        if not tenant:
            tenant = Tenant()
            t = cast(Any, tenant)
            t.nombre = tenant_name
            t.plan = "starter"

            db.add(tenant)
            db.commit()
            db.refresh(tenant)
            print(f"✅ Tenant creado: {cast(Any, tenant).nombre} (id={cast(Any, tenant).id})")
        else:
            print(f"ℹ️ Tenant ya existe: {cast(Any, tenant).nombre} (id={cast(Any, tenant).id})")

        # 2) Usuario owner / superusuario de plataforma
        user = db.query(User).filter(User.email == admin_email).first()
        if not user:
            user = User()
            u = cast(Any, user)

            # tenant.id en SQLAlchemy suele estar tipado como Column[int] a ojos de Pylance
            u.tenant_id = int(cast(Any, tenant).id)
            u.email = admin_email
            u.password_hash = get_password_hash(admin_password)
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