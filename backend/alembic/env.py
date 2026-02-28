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

config = context.config

# Settings de la app
settings = get_settings()

# ✅ Forzamos URL a string "limpio"
DB_URL = str(getattr(settings, "DATABASE_URL", "") or "").strip()
if not DB_URL:
    raise RuntimeError("DATABASE_URL no está configurada (revisa backend/.env)")

# ✅ Guardamos también en config por compatibilidad
config.set_main_option("sqlalchemy.url", DB_URL)

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DB_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        DB_URL,
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