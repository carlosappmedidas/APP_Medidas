# app/core/datetime_utils.py
"""
Helper canónico de tiempo para toda la app.

Todas las operaciones de tiempo del backend deben pasar por aquí.
NUNCA usar datetime.utcnow() ni datetime.now() directamente.

Política:
  - La app vive en Europe/Madrid.
  - Devolvemos naive (sin tzinfo) para encajar con las columnas
    TIMESTAMP WITHOUT TIME ZONE existentes en la BD.
  - Equivalente a "qué hora marca un reloj de pared en Madrid ahora mismo".
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

TZ_MADRID = ZoneInfo("Europe/Madrid")


def ahora_madrid() -> datetime:
    """Datetime actual en Europe/Madrid, naive (sin tzinfo).

    Reemplazo directo de datetime.utcnow() y datetime.now() en todo
    el backend.
    """
    return datetime.now(TZ_MADRID).replace(tzinfo=None)


def hoy_madrid_str(fmt: str = "%Y-%m-%d") -> str:
    """Fecha actual en Madrid formateada como string.

    Para nombres de fichero, claves de cache, etc.
    """
    return ahora_madrid().strftime(fmt)