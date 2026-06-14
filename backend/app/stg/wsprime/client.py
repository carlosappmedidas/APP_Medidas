"""
Cliente abstracto base para WS-PRIME.

Define la interfaz común que todos los adapters de fabricantes deben
implementar (Circutor, ZIV, Sagemcom, Landis, Mock).

Iteración 1 del Paq 11 — alcance mínimo:
- test_conexion(): comprueba que las credenciales/URL son válidas
- leer_info_general(): equivalente a la petición B11 del estándar PRIME
"""

from abc import ABC, abstractmethod


class WSPrimeAdapter(ABC):
    """Adapter base para concentradores PRIME via WS-PRIME (SOAP/HTTPS)."""

    def __init__(
        self,
        url: str,
        usuario: str,
        password: str,
        *,
        timeout: int = 30,
        verify_ssl: bool = True,
    ) -> None:
        self.url = url
        self.usuario = usuario
        self.password = password
        self.timeout = timeout
        self.verify_ssl = verify_ssl

    @abstractmethod
    def test_conexion(self) -> dict:
        """
        Comprueba que se puede conectar al concentrador con las credenciales.

        Returns:
            dict con shape: {
                'ok': bool,           # True si la conexion ha sido OK
                'mensaje': str,       # descripcion humana del resultado
                'info': dict | None,  # datos adicionales si los hay (opcional)
            }
        """
        raise NotImplementedError

    @abstractmethod
    def leer_info_general(self, meter_id: str | None = None) -> dict:
        """
        Lee informacion general del concentrador (PRIME B11 equivalente).

        Args:
            meter_id: opcional. Si se proporciona, lee info de un meter
                      especifico. Si no, info general del concentrador.

        Returns:
            dict con shape: {
                'ok': bool,
                'mensaje': str,
                'info': dict | None,  # claves esperadas si ok=True:
                    # fabricante, modelo, firmware, numero_serie,
                    # fecha_hora, total_meters, ...
            }
        """
        raise NotImplementedError