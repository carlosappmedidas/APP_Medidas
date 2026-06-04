# app/core/crypto.py
"""
Cifrado simétrico Fernet compartido entre todos los módulos.

Lee la clave de FTP_SECRET_KEY en .env. El nombre se mantiene por
compatibilidad histórica con los 8 configs FTP ya cifrados en el módulo
comunicaciones; la clave es de hecho genérica para todo el proyecto
(STG, futuro GISCE, etc.), no solo FTP.

Generar una nueva clave (solo si se monta un entorno desde cero):

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken


def _get_fernet() -> Fernet:
    from app.core.config import get_settings
    key = get_settings().FTP_SECRET_KEY
    if not key:
        raise RuntimeError("FTP_SECRET_KEY no definida en .env.")
    return Fernet(key.encode())


def cifrar_password(password: str) -> str:
    """Cifra un string en claro y devuelve el token Fernet (str base64-urlsafe)."""
    return _get_fernet().encrypt(password.encode()).decode()


def descifrar_password(password_cifrada: str) -> str:
    """Descifra un token Fernet (str base64-urlsafe) y devuelve el string en claro."""
    return _get_fernet().decrypt(password_cifrada.encode()).decode()


def es_token_fernet(valor: str | None) -> bool:
    """
    True si `valor` parece un token Fernet válido descifrable con la clave actual.
    Útil para detectar passwords todavía en claro en BD durante migraciones.
    """
    if not valor:
        return False
    try:
        _get_fernet().decrypt(valor.encode())
        return True
    except (InvalidToken, ValueError):
        return False
