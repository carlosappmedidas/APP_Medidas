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
        from app.stg.wsprime.adapters.circutor import CircutorAdapter
        return CircutorAdapter(
            url=url,
            usuario=usuario,
            password=password,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

    if fab == "ziv":
        from app.stg.wsprime.adapters.ziv import ZivAdapter
        return ZivAdapter(
            url=url,
            usuario=usuario,
            password=password,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

    if fab == "sagemcom":
        from app.stg.wsprime.adapters.sagemcom import SagemcomAdapter
        return SagemcomAdapter(
            url=url,
            usuario=usuario,
            password=password,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

    if fab == "landis":
        from app.stg.wsprime.adapters.landis import LandisAdapter
        return LandisAdapter(
            url=url,
            usuario=usuario,
            password=password,
            timeout=timeout,
            verify_ssl=verify_ssl,
        )

    # Defensivo: si llegamos aqui, hay desalineacion entre FABRICANTES_VALIDOS
    # y las ramas if. No deberia ocurrir nunca.
    raise NotImplementedError(f"Adapter para '{fab}' sin implementar")