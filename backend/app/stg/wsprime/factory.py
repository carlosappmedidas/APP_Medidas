"""
Factory para instanciar el adapter WS-PRIME correcto segun fabricante.

Iteracion 1: solo MockAdapter esta implementado. Los otros fabricantes
devuelven NotImplementedError hasta que se implementen los adapters
reales en sub-paqs siguientes (11-5 CircutorAdapter el lunes 16-jun).
"""

from app.stg.wsprime.client import WSPrimeAdapter
from app.stg.wsprime.adapters.mock import MockAdapter


# Lista de fabricantes validos.
# Debe estar sincronizada con FABRICANTES_VALIDOS de models.py.
FABRICANTES_VALIDOS = frozenset({
    "mock",
    "circutor",
    "ziv",
    "sagemcom",
    "landis",
})


def get_adapter(
    fabricante: str,
    url: str,
    usuario: str,
    password: str,
    *,
    timeout: int = 30,
    verify_ssl: bool = True,
) -> WSPrimeAdapter:
    """
    Devuelve la instancia de adapter adecuada al fabricante.

    Args:
        fabricante: nombre normalizado del fabricante (lowercase).
        url, usuario, password: credenciales WS-PRIME del concentrador.
        timeout: timeout en segundos (default 30).
        verify_ssl: verificar certificado SSL (default True).

    Returns:
        WSPrimeAdapter concreto.

    Raises:
        ValueError: fabricante no valido.
        NotImplementedError: fabricante valido pero adapter no implementado aun.
    """
    fab = (fabricante or "").strip().lower()

    if fab not in FABRICANTES_VALIDOS:
        raise ValueError(
            f"Fabricante '{fabricante}' no valido. "
            f"Validos: {sorted(FABRICANTES_VALIDOS)}"
        )

    if fab == "mock":
        return MockAdapter(
            url=url,
            usuario=usuario,
            password=password,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

    if fab == "circutor":
        raise NotImplementedError(
            "CircutorAdapter pendiente (sub-paq 11-5, lunes 2026-06-16)"
        )

    if fab == "ziv":
        raise NotImplementedError(
            "ZivAdapter pendiente (Paq 11 iteracion futura)"
        )

    if fab == "sagemcom":
        raise NotImplementedError(
            "SagemcomAdapter pendiente (Paq 11 iteracion futura)"
        )

    if fab == "landis":
        raise NotImplementedError(
            "LandisAdapter pendiente (Paq 11 iteracion futura)"
        )

    # Defensivo: si llegamos aqui, hay desalineacion entre FABRICANTES_VALIDOS
    # y las ramas if. No deberia ocurrir nunca.
    raise NotImplementedError(f"Adapter para '{fab}' sin implementar")