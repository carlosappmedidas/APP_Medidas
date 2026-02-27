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

    # dev: 60 ok | prod: recomendado 15–30
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Leer variables de entorno desde .env
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # ✅ evita petar si tienes variables extra en .env
    )


@lru_cache()
def get_settings() -> Settings:
    """
    Devuelve una instancia única de Settings leyendo .env.
    """
    s = Settings()

    # ✅ Hardening en PRODUCCIÓN
    if s.ENV == "prod":
        # SECRET_KEY obligatoria y no puede ser la de desarrollo
        if (not s.SECRET_KEY) or ("DEV_SECRET" in s.SECRET_KEY):
            raise RuntimeError(
                "SECRET_KEY insegura en producción. Define SECRET_KEY real en el .env del servidor."
            )

        # Expiración recomendada en producción
        if s.ACCESS_TOKEN_EXPIRE_MINUTES > 30:
            raise RuntimeError(
                "ACCESS_TOKEN_EXPIRE_MINUTES demasiado alto en producción (recomendado <= 30)."
            )

    return s