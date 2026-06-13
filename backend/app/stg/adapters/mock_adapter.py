# app/stg/adapters/mock_adapter.py
# pyright: reportMissingImports=false
"""
Adapter "mock" para desarrollo. Devuelve datos sintéticos sin tocar nada
externo. Útil mientras los adapters reales (GISCE, SFTP, API) están en
construcción (Paquetes 3-5).
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from typing import Optional

from app.core.datetime_utils import ahora_madrid
from app.stg.adapters.base import (
    ConcentradorExterno,
    CupsExterno,
    PingResult,
    SolicitudExterna,
    StgAdapter,
)


class MockStgAdapter(StgAdapter):
    """Devuelve datos sintéticos coherentes. No habla con nada externo."""

    def __init__(self, empresa_id: int = 0):
        self.empresa_id = empresa_id

    def ping(self) -> PingResult:
        return PingResult(ok=True, mensaje="Mock OK", tiempo_ms=random.randint(20, 80))

    def listar_concentradores(self) -> list[ConcentradorExterno]:
        ahora = ahora_madrid()
        fabricantes = ["ZIV", "Landis+Gyr", "Circutor", "Itron", "Sagemcom"]
        protocolos = ["PRIME", "Meters&More", "G3-PLC"]
        salida: list[ConcentradorExterno] = []
        for i in range(1, 11):
            estado = random.choices(
                ["online", "online", "online", "alerta", "offline"],
                k=1,
            )[0]
            minutos_atras = random.randint(5, 60 * 24 * 4)
            salida.append(ConcentradorExterno(
                codigo_ct=f"CT-{i:04d}",
                nombre=f"CT mock {i}",
                direccion=f"Carrer Major, {i}",
                fabricante=random.choice(fabricantes),
                modelo="DCU-100",
                firmware="2.4.1",
                protocolo_pmi=random.choice(protocolos),
                numero_cups_asociados=random.randint(20, 120),
                ultimo_contacto=ahora - timedelta(minutes=minutos_atras),
                estado_comunicacion=estado,
            ))
        return salida

    def listar_cups(self) -> list[CupsExterno]:
        ahora = ahora_madrid()
        fabricantes = ["ZIV", "Landis+Gyr", "Circutor", "Itron", "Sagemcom"]
        tarifas = ["2.0TD", "3.0TD", "6.1TD"]
        salida: list[CupsExterno] = []
        for i in range(1, 51):
            estado = random.choices(
                ["online", "online", "online", "online", "offline"],
                k=1,
            )[0]
            minutos_atras = random.randint(5, 60 * 24 * 7)
            cups = f"ES{self.empresa_id or 99:04d}0000{i:08d}A0F"[:22]
            salida.append(CupsExterno(
                cups=cups,
                numero_contador=f"{random.choice(fabricantes)[:3].upper()}-{random.randint(10_000_000, 99_999_999)}",
                fabricante_contador=random.choice(fabricantes),
                tarifa=random.choice(tarifas),
                codigo_ct=f"CT-{random.randint(1, 10):04d}",
                ultimo_contacto=ahora - timedelta(minutes=minutos_atras),
                estado_comunicacion=estado,
            ))
        return salida

    def solicitar_fichero(
        self,
        tipo_fichero: str,
        fecha_desde: date,
        fecha_hasta: date,
        cups: Optional[str] = None,
        codigo_ct: Optional[str] = None,
        prioridad: str = "normal",
    ) -> SolicitudExterna:
        return SolicitudExterna(
            referencia_externa=f"MOCK-{random.randint(100000, 999999)}",
            estado="enviada",
            mensaje=f"Solicitud {tipo_fichero} encolada (mock)",
        )
