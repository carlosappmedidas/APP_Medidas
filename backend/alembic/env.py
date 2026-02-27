from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.core.models_base import Base

# Importamos modelos para que se registren en Base.metadata
from app.measures import models as measures_models  # noqa: F401
from app.tenants import models as tenants_models  # noqa: F401
from app.empresas import models as empresas_models  # noqa: F401
from app.ingestion import models as ingestion_models  # noqa: F401

# Config Alembic
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# MetaData global (todas las tablas registradas en Base)
target_metadata = Base.metadata


def _get_db_url() -> str:
    """
    Devuelve la URL de BD desde settings (.env).
    Si no existe, intenta usar la de alembic.ini (fallback).
    """
    settings = get_settings()
    url = (getattr(settings, "DATABASE_URL", None) or "").strip()

    if not url:
        # Fallback: por si alguien ejecuta alembic sin .env
        url = (config.get_main_option("sqlalchemy.url") or "").strip()

    if not url or url.startswith("driver://"):
        raise RuntimeError(
            "DATABASE_URL no está configurada correctamente. "
            "Revisa backend/.env (o variable de entorno DATABASE_URL)."
        )

    # Aseguramos str limpio
    return str(url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = _get_db_url()

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    url = _get_db_url()

    connectable = create_engine(
        url,
        poolclass=pool.NullPool,
        future=True,
        # Si algún Windows da guerra con codificación, esto ayuda:
        connect_args={"options": "-c client_encoding=UTF8"},
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()