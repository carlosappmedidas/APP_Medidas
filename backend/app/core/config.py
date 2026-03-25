# app/core/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Nombre de la app
    APP_NAME: str = "Medidas SaaS API"

    # Entorno (dev / prod)
    ENV: str = "dev"

    # Defaults para dev (si no hay .env)
    DATABASE_URL: str = "postgresql://carlosortiz@localhost:5432/app_medidas"

    # ⚠️ En prod, DEBE venir del .env (clave larga y aleatoria)
    SECRET_KEY: str = "DEV_SECRET_KEY_CAMBIALA_LUEGO"
    ALGORITHM: str = "HS256"

    # dev: 480 ok | prod: máximo 480 (8 horas = jornada laboral)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Borrado de ficheros de ingestion tras procesar OK
    INGESTION_DELETE_AFTER_OK: bool = True

    # Orígenes CORS permitidos, separados por coma
    CORS_ORIGINS: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    s = Settings()

    # Hardening en PRODUCCIÓN
    if s.ENV == "prod":
        if (not s.SECRET_KEY) or ("DEV_SECRET" in s.SECRET_KEY):
            raise RuntimeError(
                "SECRET_KEY insegura en producción. Define SECRET_KEY real en el .env del servidor."
            )
        if s.ACCESS_TOKEN_EXPIRE_MINUTES > 480:
            raise RuntimeError(
                "ACCESS_TOKEN_EXPIRE_MINUTES demasiado alto en producción (máximo 480 = 8h)."
            )

    return s