"""
MockAdapter: simula un concentrador PRIME real para tests sin credenciales.

Util para validar endpoints, frontend y flujos sin depender de la red
real de San Jose, ZIV, etc. Genera respuestas plausibles y deterministas.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.stg.wsprime.client import WSPrimeAdapter


class MockAdapter(WSPrimeAdapter):
    """Adapter simulado para tests. NO HACE I/O real."""

    def test_conexion(self) -> dict:
        # Reglas de simulacion:
        #   - url vacia o usuario/password vacios -> fallo
        #   - resto -> exito
        if not self.url or not self.usuario or not self.password:
            return {
                "ok": False,
                "mensaje": "URL, usuario o password vacios (MockAdapter)",
                "info": None,
            }

        return {
            "ok": True,
            "mensaje": "Conexion OK (MockAdapter)",
            "info": {
                "adapter": "mock",
                "url": self.url,
                "usuario": self.usuario,
                "timeout_segundos": self.timeout,
                "verify_ssl": self.verify_ssl,
            },
        }

    def leer_info_general(self, meter_id: str | None = None) -> dict:
        if not self.url:
            return {
                "ok": False,
                "mensaje": "URL vacia (MockAdapter)",
                "info": None,
            }

        ahora_madrid = datetime.now(ZoneInfo("Europe/Madrid"))

        info = {
            "fabricante": "MockCorp",
            "modelo": "PRIME-MOCK-v1",
            "firmware": "1.0.0-mock",
            "numero_serie": "MOCK0000001",
            "fecha_hora": ahora_madrid.isoformat(),
            "total_meters": 42,
            "estado": "OK",
        }

        if meter_id:
            info["meter_id_consultado"] = meter_id
            info["meter_info"] = {
                "id": meter_id,
                "modelo": "MOCK-METER-A",
                "firmware": "2.0.0",
                "ultimo_contacto": ahora_madrid.isoformat(),
            }

        return {
            "ok": True,
            "mensaje": (
                "Info general leida (MockAdapter)"
                if not meter_id
                else f"Info meter {meter_id} leida (MockAdapter)"
            ),
            "info": info,
        }