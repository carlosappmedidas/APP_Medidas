# app/stg/adapters/gisce_adapter.py
# pyright: reportMissingImports=false
"""
Adapter para GISCE-ERP (Odoo-based).

Implementación PENDIENTE (Paquete 4 / Fase 4 del plan evolutivo).

Hablará XML-RPC contra el GISCE del cliente para:
  - Listar CUPS, contadores y concentradores
  - Pedir ficheros S0X
  - Consultar estado de comunicación

NOTA: este adapter NO copia código de GISCE. Llama a la API XML-RPC que
expone GISCE (que es la API estándar de Odoo, no propiedad intelectual
exclusiva de GISCE).
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from app.stg.adapters.base import (
    ConcentradorExterno,
    CupsExterno,
    PingResult,
    SolicitudExterna,
    StgAdapter,
)


class GisceAdapter(StgAdapter):
    """Stub pendiente de implementar en el Paquete 4."""

    def __init__(
        self,
        host: str,
        puerto: int,
        usuario: str,
        password: str,
        database: str,
    ):
        self.host = host
        self.puerto = puerto
        self.usuario = usuario
        self.password = password
        self.database = database

    def _not_implemented(self):
        raise NotImplementedError(
            "GiscereERPAdapter está pendiente de implementar (Paquete 4)"
        )

    def ping(self) -> PingResult:
        return PingResult(
            ok=False,
            mensaje="Adapter GISCE no implementado todavía (pendiente Paquete 4)",
        )

    def listar_cups(self) -> list[CupsExterno]:
        self._not_implemented()
        return []

    def listar_concentradores(self) -> list[ConcentradorExterno]:
        self._not_implemented()
        return []

    def solicitar_fichero(
        self,
        tipo_fichero: str,
        fecha_desde: date,
        fecha_hasta: date,
        cups: Optional[str] = None,
        codigo_ct: Optional[str] = None,
        prioridad: str = "normal",
    ) -> SolicitudExterna:
        self._not_implemented()
        return SolicitudExterna(referencia_externa=None, estado="error")
