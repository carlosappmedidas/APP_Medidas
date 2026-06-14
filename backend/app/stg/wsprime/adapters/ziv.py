# app/stg/wsprime/adapters/ziv.py
# pyright: reportMissingImports=false
"""
ZivAdapter — WS-PRIME para concentradores ZIV.

Estado: ESQUELETO. Iteración futura cuando llegue cliente con concentradores ZIV.
Estructura idéntica a CircutorAdapter (zeep + WSDL); solo cambian operaciones
SOAP específicas del fabricante.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.stg.wsprime.client import WSPrimeAdapter


class ZivAdapter(WSPrimeAdapter):
    """Adapter WS-PRIME para concentradores ZIV."""

    def __init__(
        self,
        url: str,
        usuario: str,
        password: str,
        *,
        timeout: int = 30,
        verify_ssl: bool = True,
    ) -> None:
        super().__init__(url, usuario, password, timeout=timeout, verify_ssl=verify_ssl)
        self._client = None

    def _build_client(self):
        if self._client is not None:
            return self._client
        try:
            from zeep import Client
            from zeep.transports import Transport
            from requests import Session
            from requests.auth import HTTPBasicAuth
        except ImportError as e:
            raise RuntimeError(f"Dependencia zeep no disponible: {e}") from e

        session = Session()
        session.auth = HTTPBasicAuth(self.usuario, self.password)
        session.verify = self.verify_ssl
        transport = Transport(session=session, timeout=self.timeout)
        self._client = Client(self.url, transport=transport)
        return self._client

    def test_conexion(self) -> dict:
        if not self.url or not self.usuario or not self.password:
            return {"ok": False, "mensaje": "URL, usuario o password vacios", "info": None}

        try:
            client = self._build_client()
            servicios = list(client.wsdl.services.keys())
            return {
                "ok": True,
                "mensaje": f"WSDL ZIV parseado ({len(servicios)} servicios)",
                "info": {
                    "adapter": "ziv",
                    "url": self.url,
                    "servicios_disponibles": servicios,
                },
            }
        except Exception as e:
            return {
                "ok": False,
                "mensaje": f"Error conectando ZIV: {type(e).__name__}: {e}",
                "info": None,
            }

    def leer_info_general(self, meter_id: str | None = None) -> dict:
        """TODO: implementar operación SOAP cuando llegue cliente ZIV."""
        if not self.url:
            return {"ok": False, "mensaje": "URL vacia", "info": None}
        try:
            client = self._build_client()
            ahora = datetime.now(ZoneInfo("Europe/Madrid"))
            return {
                "ok": True,
                "mensaje": "WSDL ZIV accesible. Operacion SOAP pendiente de implementar.",
                "info": {
                    "adapter": "ziv",
                    "url": self.url,
                    "fecha_hora_consulta": ahora.isoformat(),
                    "wsdl_servicios": list(client.wsdl.services.keys()),
                    "estado": "WSDL_PARSEADO_PERO_OP_SOAP_PENDIENTE",
                },
            }
        except Exception as e:
            return {
                "ok": False,
                "mensaje": f"Error leyendo info general ZIV: {type(e).__name__}: {e}",
                "info": None,
            }