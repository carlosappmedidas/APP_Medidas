# app/main.py
# pyright: reportMissingImports=false
# ruff: noqa: E402
# flake8: noqa: E402
# Los imports están deliberadamente después del bloque os.environ["TZ"]=... para
# forzar la zona horaria a nivel proceso ANTES de cargar cualquier módulo que
# use datetime. Suprimimos E402 (module-level import not at top of file) porque
# en este fichero ES intencional.

# ── Forzar TZ a nivel proceso ANTES de cualquier import que use datetime ──
# Esto hace que:
#   - time.localtime(), time.strftime() sin tz, logging timestamps, etc.
#     trabajen siempre en Madrid en Linux/macOS (servidor de prod y dev Mac).
#   - En Windows, time.tzset no existe (no rompe, simplemente no aplica;
#     en ese caso lo controla el helper ahora_madrid() del datetime_utils).
import os
os.environ["TZ"] = "Europe/Madrid"
try:
    import time
    time.tzset()  # type: ignore[attr-defined]  # No existe en Windows
except (AttributeError, OSError):
    pass

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.alerts.routes import router as alerts_router
from app.calendario_laboral.routes import router as calendario_laboral_router
from app.calendario_ree.routes import router as calendario_ree_router
from app.comunicaciones.routes import router as comunicaciones_router
from app.core.config import get_settings
from app.core.db import get_db
from app.dashboard.routes import router as dashboard_router
from app.dashboard_tablas.routes import router as dashboard_tablas_router
from app.empresas.routes import router as empresas_router
from app.ingestion.routes import router as ingestion_router
from app.measures.routes import router as medidas_router
from app.medidas_graficos.routes import router as medidas_graficos_router
from app.medidas_graficos.routes_ps import router as medidas_graficos_ps_router
from app.objeciones.routes import router as objeciones_router
from app.objeciones.descarga.routes import router as objeciones_descarga_router
from app.envios.routes import router as envios_router
from app.envios.routes_inventario import router as envios_inventario_router
from app.envios.automatizacion.routes_config import router as envios_automatizacion_router
from app.envios.automatizacion.routes_alertas import router as envios_alertas_router
from app.measures.descarga.routes import router as measures_descarga_router
from app.measures.descarga.automatizacion.routes import router as measures_descarga_automatizacion_router
from app.objeciones.automatizacion.routes_config import router as objeciones_automatizacion_router
from app.objeciones.automatizacion.routes_alertas import router as objeciones_alertas_router
from app.tenants.routes import router as auth_router
from app.perdidas.routes import router as perdidas_router
from app.topologia.routes import router as topologia_router
from app.stg.routes import router as stg_router
from app.stg.gisce.routes import router as gisce_router

# ── Custom JSON response: añade offset Madrid a datetimes naive ──────────────
# Los datetimes naive que escribe el backend ya están en hora Madrid local. JS
# en el frontend interpreta strings ISO sin TZ como UTC y aplica +2h al
# mostrarlas → mostraba 18:07 cuando eran las 16:07. Aquí post-procesamos cada
# respuesta JSON añadiendo el offset Madrid correcto (CEST=+02:00 o CET=+01:00
# según DST) a cada string datetime ISO naive.
import re
from datetime import datetime
from fastapi.responses import JSONResponse
from app.core.datetime_utils import TZ_MADRID

_RE_NAIVE_DT_IN_JSON = re.compile(r'"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)"')


def _add_madrid_offset_to_iso(match: "re.Match[str]") -> str:
    """Toma un string ISO naive entre comillas y añade el offset Madrid (DST-aware)."""
    iso = match.group(1)
    try:
        naive = datetime.fromisoformat(iso)
        aware = naive.replace(tzinfo=TZ_MADRID)
        return f'"{aware.isoformat()}"'
    except (ValueError, TypeError):
        return match.group(0)


class MadridJSONResponse(JSONResponse):
    """JSONResponse que añade offset Madrid a cualquier datetime naive ISO en el body."""

    def render(self, content) -> bytes:
        body = super().render(content)
        try:
            text = body.decode("utf-8")
            transformed = _RE_NAIVE_DT_IN_JSON.sub(_add_madrid_offset_to_iso, text)
            return transformed.encode("utf-8")
        except (UnicodeDecodeError, ValueError):
            return body


# Importamos los modelos SOLO para que se registren en Base.metadata
from app.alerts.models import AlertComment, AlertResult, AlertRuleCatalog, EmpresaAlertRuleConfig  # noqa: F401
from app.calendario_laboral.models import DiaFestivoMadrid  # noqa: F401
from app.calendario_ree.models import ReeCalendarFile  # noqa: F401
from app.comunicaciones.models import FtpConfig, FtpSyncLog, FtpSyncRule  # noqa: F401
from app.measures.models import MedidaGeneral, MedidaMicro, MedidaPS  # noqa: F401
from app.measures.m1_models import M1PeriodContribution  # noqa: F401
from app.measures.general_contrib_models import GeneralPeriodContribution  # noqa: F401
from app.measures.bald_contrib_models import BaldPeriodContribution  # noqa: F401
from app.measures.ps_models import PSPeriodContribution  # noqa: F401
from app.measures.ps_detail_models import PSPeriodDetail  # noqa: F401
from app.objeciones.models import ObjecionAGRECL, ObjecionINCL, ObjecionCUPS, ObjecionCIL  # noqa: F401
from app.objeciones.automatizacion.models import ObjecionesAutomatizacion, ObjecionesAlerta  # noqa: F401
from app.measures.descarga.automatizacion.models import PublicacionesAutomatizacion, PublicacionesAlerta  # noqa: F401
from app.envios.automatizacion.models import EnviosAutomatizacion, EnvioAlerta  # noqa: F401
from app.envios.models import EnvioInventario  # noqa: F401
from app.perdidas.models import Concentrador, PerdidaDiaria  # noqa: F401
from app.topologia.models import CtInventario, CtTransformador, CupsTopologia  # noqa: F401
from app.stg.models import (  # noqa: F401
    ConexionStgEmpresa, StgConcentrador, Cups,
    SolicitudFichero, FicheroRecibido,
)

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


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
    default_response_class=MadridJSONResponse,
)

# ---------- STATIC: Plantillas (globales) ----------
BASE_DIR = Path(__file__).resolve().parent
PLANTILLAS_DIR = BASE_DIR / "static" / "plantillas"
PLANTILLAS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/plantillas", StaticFiles(directory=str(PLANTILLAS_DIR)), name="plantillas")

# ---------- CORS ----------
# Defaults SOLO para dev local sin .env. NUNCA poner IPs específicas aquí
# (Tailscale, dominios públicos, etc.) — esas deben ir en CORS_ORIGINS del .env
# de cada entorno (ver .env.example).
_default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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
    expose_headers=["Content-Disposition"],
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
app.include_router(dashboard_tablas_router)
app.include_router(calendario_ree_router)
app.include_router(calendario_laboral_router)
app.include_router(medidas_graficos_router)
app.include_router(medidas_graficos_ps_router)
app.include_router(objeciones_router)
app.include_router(objeciones_descarga_router)
app.include_router(envios_router)
app.include_router(envios_inventario_router)
app.include_router(envios_automatizacion_router)
app.include_router(envios_alertas_router)
app.include_router(objeciones_automatizacion_router)
app.include_router(objeciones_alertas_router)
app.include_router(comunicaciones_router)
app.include_router(perdidas_router)
app.include_router(topologia_router)
app.include_router(measures_descarga_router)
app.include_router(measures_descarga_automatizacion_router)
app.include_router(stg_router)
app.include_router(gisce_router)
