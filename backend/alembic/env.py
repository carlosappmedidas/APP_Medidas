from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from alembic import context

from app.core.config import get_settings
from app.core.models_base import Base

# Importamos modelos para que se registren en Base.metadata
from app.measures import models as measures_models  # noqa: F401
from app.tenants import models as tenants_models  # noqa: F401
from app.empresas import models as empresas_models  # noqa: F401
from app.ingestion import models as ingestion_models  # noqa: F401

# Config Alembic
config = context.config

# Settings de la app (aquí viene la DATABASE_URL)
settings = get_settings()

# Para que Alembic tenga la URL de la BD (por si alguien la usa desde config)
if settings.DATABASE_URL:
    config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# MetaData global (todas las tablas registradas en Base)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # ⚠️ Usamos DIRECTAMENTE settings.DATABASE_URL
    connectable = create_engine(
        settings.DATABASE_URL,
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()