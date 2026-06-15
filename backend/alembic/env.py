from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from alembic import context

from app.core.config import get_settings
from app.core.models_base import Base

# Importamos modelos para que se registren en Base.metadata.
# IMPORTANTE: este bloque debe mantenerse sincronizado con el bloque
# equivalente en app/main.py. Si falta cualquier modelo aquí, Alembic
# autogenerate marcará todas sus tablas como "removed" y generará
# drop_table catastróficos.
from app.measures import models as measures_models  # noqa: F401
from app.tenants import models as tenants_models  # noqa: F401
from app.empresas import models as empresas_models  # noqa: F401
from app.ingestion import models as ingestion_models  # noqa: F401

# --- Resto de modelos (sincronizado con app/main.py) ---
from app.alerts.models import (  # noqa: F401
    AlertComment, AlertResult, AlertRuleCatalog, EmpresaAlertRuleConfig,
)
from app.calendario_laboral.models import DiaFestivoMadrid  # noqa: F401
from app.calendario_ree.models import ReeCalendarFile  # noqa: F401
from app.comunicaciones.models import FtpConfig, FtpSyncLog, FtpSyncRule  # noqa: F401
from app.measures.models import MedidaGeneral, MedidaMicro, MedidaPS  # noqa: F401
from app.measures.m1_models import M1PeriodContribution  # noqa: F401
from app.measures.general_contrib_models import GeneralPeriodContribution  # noqa: F401
from app.measures.bald_contrib_models import BaldPeriodContribution  # noqa: F401
from app.measures.ps_models import PSPeriodContribution  # noqa: F401
from app.measures.ps_detail_models import PSPeriodDetail  # noqa: F401
from app.objeciones.models import (  # noqa: F401
    ObjecionAGRECL, ObjecionINCL, ObjecionCUPS, ObjecionCIL,
)
from app.objeciones.automatizacion.models import (  # noqa: F401
    ObjecionesAutomatizacion, ObjecionesAlerta,
)
from app.measures.descarga.automatizacion.models import (  # noqa: F401
    PublicacionesAutomatizacion, PublicacionesAlerta,
)
from app.envios.automatizacion.models import EnviosAutomatizacion, EnvioAlerta  # noqa: F401
from app.envios.models import EnvioInventario  # noqa: F401
from app.perdidas.models import Concentrador, PerdidaDiaria  # noqa: F401
from app.topologia.models import CtInventario, CtTransformador, CupsTopologia  # noqa: F401
from app.stg.models import (  # noqa: F401
    ConexionStgEmpresa, StgConcentrador, Cups,
    SolicitudFichero, FicheroRecibido,
)
# Paquete 11 — WS-PRIME (modelo modular en submódulo wsprime/)
from app.stg.wsprime.models import StgWsPrimeConfig  # noqa: F401

# Módulo ERP
from app.erp.models import ErpTitular, ErpSuministro  # noqa: F401

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