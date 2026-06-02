# app/stg/adapters/sftp_adapter.py
# pyright: reportMissingImports=false
"""
Adapter para STG vía SFTP.

Implementación PENDIENTE (Paquete 3 / Fase 3 del plan evolutivo).

Hablará SFTP contra el servidor del cliente para:
  - Depositar ficheros de "petición" en una carpeta
  - Recoger ficheros S0X de respuesta de otra carpeta
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


class SftpStgAdapter(StgAdapter):
    """Stub pendiente de implementar en el Paquete 3."""

    def __init__(
        self,
        host: str,
        puerto: int,
        usuario: str,
        password: str,
        ruta_base: str,
    ):
        self.host = host
        self.puerto = puerto
        self.usuario = usuario
        self.password = password
        self.ruta_base = ruta_base

    def _not_implemented(self):
        raise NotImplementedError(
            "SftpStgAdapter está pendiente de implementar (Paquete 3)"
        )

    def ping(self) -> PingResult:
        return PingResult(
            ok=False,
            mensaje="Adapter SFTP no implementado todavía (pendiente Paquete 3)",
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
