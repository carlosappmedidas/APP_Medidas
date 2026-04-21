from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.core.config import get_settings

# Cargamos la configuración
settings = get_settings()

# Crear el engine de SQLAlchemy (modo síncrono)
engine = create_engine(
    settings.DATABASE_URL,
    future=True,          # API 2.0
    echo=False,           # ponlo a True si quieres ver las queries en consola
    pool_pre_ping=True,   # testea la conexión antes de usarla (evita conexiones muertas)
)

# Factoría de sesiones
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    """
    Dependencia de FastAPI para obtener una sesión de base de datos.
    Abre una sesión y garantiza que la transacción se cierra correctamente:
      - Si el endpoint lanza una excepción, hace rollback para dejar la
        sesión limpia antes de devolverla al pool.
      - Siempre cierra la sesión al final.

    Esto evita el error 'InFailedSqlTransaction' en peticiones posteriores
    que reusan una conexión del pool previamente contaminada.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        db.close()

# app/core/db.py

def get_engine():
    return engine