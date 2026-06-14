# app/stg/wsprime/adapters/circutor.py
# pyright: reportMissingImports=false
"""
CircutorAdapter — WS-PRIME para concentradores Circutor.

Estado: ESQUELETO listo para iteración 1 (test conexión + info general).
El lunes 16-Jun-2026 se rellenan los nombres exactos de operaciones SOAP
una vez tengamos el WSDL del cliente San José.

Dependencias:
- zeep (ya en requirements.txt vía primestg)

Notas Circutor:
- Endpoint WSDL típico: http://IP:PUERTO/services/PrimeMeterDataExchangeSOAP?wsdl
- Auth: BASIC HTTP normalmente, o WS-Security UsernameToken
- Operaciones PRIME esperadas: B01_Login (opcional), B11_InfoGeneral
- Algunos endpoints usan certificado SSL autofirmado → verify_ssl=False
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.stg.wsprime.client import WSPrimeAdapter


class CircutorAdapter(WSPrimeAdapter):
    """Adapter WS-PRIME para concentradores Circutor."""

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
        self._client = None  # lazy init de zeep.Client

    def _build_client(self):
        """Construye el cliente zeep con auth y verify_ssl.

        Lazy init: solo crea el cliente cuando se necesita, evita penalizar el
        constructor con la descarga del WSDL.
        """
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
        """Comprueba accesibilidad del WSDL + auth.

        Iteración 1: si zeep consigue parsear el WSDL → OK.
        Iteración 2: añadir un ping real (B01_Login o similar).
        """
        if not self.url or not self.usuario or not self.password:
            return {
                "ok": False,
                "mensaje": "URL, usuario o password vacios",
                "info": None,
            }

        try:
            client = self._build_client()
            # Listamos servicios del WSDL para confirmar parseo OK
            servicios = list(client.wsdl.services.keys())
            return {
                "ok": True,
                "mensaje": f"WSDL parseado correctamente ({len(servicios)} servicios)",
                "info": {
                    "adapter": "circutor",
                    "url": self.url,
                    "usuario": self.usuario,
                    "servicios_disponibles": servicios,
                },
            }
        except Exception as e:
            return {
                "ok": False,
                "mensaje": f"Error conectando a WS-PRIME Circutor: {type(e).__name__}: {e}",
                "info": None,
            }

    def leer_info_general(self, meter_id: str | None = None) -> dict:
        """Lee info general del concentrador.

        TODO sub-paq 11-5 lunes: rellenar nombre exacto de operación SOAP
        una vez tengamos el WSDL real del cliente. Operaciones esperadas:
            - B11_InfoGeneral
            - getDateTime
            - getCurrentDateTimeInfo

        Por ahora devuelve OK con info básica del WSDL.
        """
        if not self.url:
            return {"ok": False, "mensaje": "URL vacia", "info": None}

        try:
            client = self._build_client()
            ahora_madrid = datetime.now(ZoneInfo("Europe/Madrid"))

            # Listar operaciones disponibles del primer servicio (debugging)
            operaciones = []
            for svc_name, svc in client.wsdl.services.items():
                for port_name, port in svc.ports.items():
                    for op_name in port.binding._operations:
                        operaciones.append(f"{svc_name}/{port_name}/{op_name}")

            info = {
                "adapter": "circutor",
                "url": self.url,
                "fecha_hora_consulta": ahora_madrid.isoformat(),
                "wsdl_servicios": list(client.wsdl.services.keys()),
                "wsdl_operaciones_disponibles": operaciones[:30],
                "estado": "WSDL_PARSEADO_PERO_OP_SOAP_PENDIENTE_DE_IMPLEMENTAR",
            }
            if meter_id:
                info["meter_id_consultado"] = meter_id

            return {
                "ok": True,
                "mensaje": (
                    "WSDL Circutor accesible. Operacion SOAP real pendiente "
                    "de implementar en sub-paq 11-5 (lunes 2026-06-16) cuando "
                    "tengamos credenciales y nombres de operaciones."
                ),
                "info": info,
            }
        except Exception as e:
            return {
                "ok": False,
                "mensaje": f"Error leyendo info general Circutor: {type(e).__name__}: {e}",
                "info": None,
            }