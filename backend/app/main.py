# app/main.py
# pyright: reportMissingImports=false

from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_db

from app.tenants.routes import router as auth_router
from app.empresas.routes import router as empresas_router
from app.ingestion.routes import router as ingestion_router
from app.measures.routes import router as medidas_router  # 👈 NUEVO

# Importamos los modelos SOLO para que se registren en Base.metadata
from app.measures.models import MedidaMicro, MedidaGeneral  # noqa: F401

settings = get_settings()

app = FastAPI(title=settings.APP_NAME)

# ---------- STATIC: Plantillas (globales) ----------
# Ruta esperada en el repo: app/static/plantillas/
BASE_DIR = Path(__file__).resolve().parent
PLANTILLAS_DIR = BASE_DIR / "static" / "plantillas"
PLANTILLAS_DIR.mkdir(parents=True, exist_ok=True)

# Disponibles en:
#   GET /plantillas/<nombre_fichero>
app.mount("/plantillas", StaticFiles(directory=str(PLANTILLAS_DIR)), name="plantillas")

# ---------- CORS ----------
# Permitimos el frontend en http://localhost:3000
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

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
    """
    Endpoint sencillo para comprobar que:
    - La API arranca.
    - La conexión a la base de datos funciona (SELECT 1).
    """
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


# ---------- Routers de la aplicación ----------

app.include_router(auth_router)
app.include_router(empresas_router)
app.include_router(ingestion_router)
app.include_router(medidas_router)  # 👈 AÑADIDO