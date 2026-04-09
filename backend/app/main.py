# app/main.py
# pyright: reportMissingImports=false

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.alerts.routes import router as alerts_router
from app.calendario_ree.routes import router as calendario_ree_router
from app.comunicaciones.routes import router as comunicaciones_router
from app.core.config import get_settings
from app.core.db import get_db
from app.dashboard.routes import router as dashboard_router
from app.empresas.routes import router as empresas_router
from app.ingestion.routes import router as ingestion_router
from app.measures.routes import router as medidas_router
from app.medidas_graficos.routes import router as medidas_graficos_router
from app.medidas_graficos.routes_ps import router as medidas_graficos_ps_router
from app.objeciones.routes import router as objeciones_router
from app.tenants.routes import router as auth_router
from app.perdidas.routes import router as perdidas_router


# Importamos los modelos SOLO para que se registren en Base.metadata
from app.alerts.models import AlertComment, AlertResult, AlertRuleCatalog, EmpresaAlertRuleConfig  # noqa: F401
from app.calendario_ree.models import ReeCalendarFile  # noqa: F401
from app.comunicaciones.models import FtpConfig, FtpSyncLog, FtpSyncRule  # noqa: F401
from app.measures.models import MedidaGeneral, MedidaMicro, MedidaPS  # noqa: F401
from app.measures.m1_models import M1PeriodContribution  # noqa: F401
from app.measures.general_contrib_models import GeneralPeriodContribution  # noqa: F401
from app.measures.bald_contrib_models import BaldPeriodContribution  # noqa: F401
from app.measures.ps_models import PSPeriodContribution  # noqa: F401
from app.measures.ps_detail_models import PSPeriodDetail  # noqa: F401
from app.objeciones.models import ObjecionAGRECL, ObjecionINCL, ObjecionCUPS, ObjecionCIL  # noqa: F401
from app.perdidas.models import Concentrador, PerdidaDiaria  # noqa: F401



# Scheduler FTP
from app.comunicaciones.scheduler import start_scheduler, stop_scheduler



settings = get_settings()


# ── Lifespan — arranca y para el scheduler con la app ────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

# ---------- STATIC: Plantillas (globales) ----------
BASE_DIR = Path(__file__).resolve().parent
PLANTILLAS_DIR = BASE_DIR / "static" / "plantillas"
PLANTILLAS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/plantillas", StaticFiles(directory=str(PLANTILLAS_DIR)), name="plantillas")

# ---------- CORS ----------
_default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://100.106.206.66:3000",
]
origins = (
    [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    if settings.CORS_ORIGINS.strip()
    else _default_origins
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Healthcheck ----------
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}

# ---------- Routers ----------
app.include_router(auth_router)
app.include_router(empresas_router)
app.include_router(ingestion_router)
app.include_router(medidas_router)
app.include_router(alerts_router)
app.include_router(dashboard_router)
app.include_router(calendario_ree_router)
app.include_router(medidas_graficos_router)
app.include_router(medidas_graficos_ps_router)
app.include_router(objeciones_router)
app.include_router(comunicaciones_router)
app.include_router(perdidas_router)

