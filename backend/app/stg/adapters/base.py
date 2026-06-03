# app/stg/adapters/base.py
# pyright: reportMissingImports=false
"""
Interfaz abstracta para hablar con un STG externo (GISCE, SFTP, API, BD).

Cada implementación (gisce_adapter, sftp_adapter, api_adapter, db_adapter, mock)
hereda de esta clase y la cumple. La fábrica `get_adapter()` decide cuál
instanciar según el `tipo` configurado en stg_conexion_empresa.

NOTA Fase 1: solo el MockStgAdapter está implementado. Los demás son stubs
que devuelven NotImplementedError. Se irán implementando en los paquetes 3-5.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional


# ---------------------------------------------------------------------------
# DTOs simples (no Pydantic, son pasarela entre adapter y service)
# ---------------------------------------------------------------------------
@dataclass
class PingResult:
    ok: bool
    mensaje: str
    tiempo_ms: Optional[int] = None


@dataclass
class CupsExterno:
    cups: str
    numero_contador: Optional[str] = None
    fabricante_contador: Optional[str] = None
    modelo_contador: Optional[str] = None
    tarifa: Optional[str] = None
    codigo_ct: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    direccion: Optional[str] = None
    municipio: Optional[str] = None
    ultimo_contacto: Optional[datetime] = None
    estado_comunicacion: str = "desconocido"


@dataclass
class ConcentradorExterno:
    codigo_ct: str
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    fabricante: Optional[str] = None
    modelo: Optional[str] = None
    firmware: Optional[str] = None
    protocolo_pmi: Optional[str] = None
    numero_cups_asociados: Optional[int] = None
    ultimo_contacto: Optional[datetime] = None
    estado_comunicacion: str = "desconocido"


@dataclass
class SolicitudExterna:
    """Resultado tras enviar una solicitud al STG externo."""
    referencia_externa: Optional[str]  # id que devuelve el STG
    estado: str  # "enviada", "en_proceso", etc.
    mensaje: Optional[str] = None


# ---------------------------------------------------------------------------
# Interfaz abstracta
# ---------------------------------------------------------------------------
class StgAdapter(ABC):
    """
    Adapter abstracto. Cada implementación concreta resuelve cómo se hablan
    estas operaciones contra el STG del cliente (GISCE, SFTP, API, BD, mock).
    """

    @abstractmethod
    def ping(self) -> PingResult:
        """Comprueba si el STG está accesible y responde."""

    @abstractmethod
    def listar_cups(self) -> list[CupsExterno]:
        """Lista todos los CUPS telegestionados según el STG."""

    @abstractmethod
    def listar_concentradores(self) -> list[ConcentradorExterno]:
        """Lista todos los concentradores conocidos por el STG."""

    @abstractmethod
    def solicitar_fichero(
        self,
        tipo_fichero: str,
        fecha_desde: date,
        fecha_hasta: date,
        cups: Optional[str] = None,
        codigo_ct: Optional[str] = None,
        prioridad: str = "normal",
    ) -> SolicitudExterna:
        """
        Encola en el STG una solicitud de fichero S0X.
        Devuelve la referencia externa con la que poder consultar el estado.
        """

    # ------------------------------------------------------------------
    # Operaciones opcionales (Paquete 5+)
    # No abstractas — cada adapter las implementa si las soporta.
    # ------------------------------------------------------------------
    def descargar_fichero(self, remote_name: str, local_path: str) -> int:
        """
        Descarga un fichero de la carpeta_recepcion del STG remoto al
        path local indicado. Devuelve el número de bytes descargados.

        Cada adapter que soporte descarga (SFTP, FTP) lo implementa.
        Los que no (mock, api_rest sin descarga) heredan el NotImplementedError.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} no implementa descargar_fichero()"
        )
