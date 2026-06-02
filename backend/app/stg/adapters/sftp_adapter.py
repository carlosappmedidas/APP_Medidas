# app/stg/adapters/sftp_adapter.py
# pyright: reportMissingImports=false
"""
Adapter SFTP del STG.

Implementación PAQUETE 3:
  - ping(): conecta y desconecta, devuelve PingResult con latencia.
  - listar_ficheros(): lista ficheros en la carpeta_recepcion resuelta
    (con plantillas {anio}/{mes}/{mes_actual}/{mes_anterior}).

Operaciones PENDIENTES de paquetes posteriores:
  - listar_cups(), listar_concentradores(): el SFTP no provee esto
    directamente — vendrán de parsear ficheros recibidos (Paquete 6).
  - solicitar_fichero(): subir XML de petición (Paquete 5, cuando
    sepamos el formato real del cliente).
"""
from __future__ import annotations

import os
import stat as stat_lib
import time
from datetime import date, datetime
from typing import Optional

from app.stg.adapters.base import (
    ConcentradorExterno,
    CupsExterno,
    PingResult,
    SolicitudExterna,
    StgAdapter,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def resolver_plantillas_carpeta(ruta: str, hoy: Optional[date] = None) -> str:
    """
    Resuelve las plantillas en una ruta de carpeta SFTP.

    Plantillas soportadas (compatibles con las usadas en
    `app/comunicaciones/models.py FtpConfig.carpeta_*`):

        {anio}           → 2026
        {mes}            → 06  (dos dígitos)
        {mes_actual}     → 2026-06
        {mes_anterior}   → 2026-05
        {mes_actual_es}  → "junio"
        {mes_anterior_es} → "mayo"

    Ejemplos:
        "respuestas/{mes_actual}"  →  "respuestas/2026-06"
        "{anio}/{mes}/S02"          →  "2026/06/S02"
    """
    if not ruta:
        return ""
    if hoy is None:
        hoy = date.today()

    # mes anterior (manejo manual sin dateutil)
    if hoy.month == 1:
        mes_ant = date(hoy.year - 1, 12, 1)
    else:
        mes_ant = date(hoy.year, hoy.month - 1, 1)

    meses_es = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]

    return (
        ruta
        .replace("{anio}", str(hoy.year))
        .replace("{mes}", f"{hoy.month:02d}")
        .replace("{mes_actual}", hoy.strftime("%Y-%m"))
        .replace("{mes_anterior}", mes_ant.strftime("%Y-%m"))
        .replace("{mes_actual_es}", meses_es[hoy.month - 1])
        .replace("{mes_anterior_es}", meses_es[mes_ant.month - 1])
    )


def _join_rutas(base: str, relativa: str) -> str:
    """
    Combina ruta_base + ruta relativa, gestionando barras correctamente.
    Si la relativa empieza por "/", se considera absoluta y se ignora base.
    """
    if not relativa:
        return base or "/"
    if relativa.startswith("/"):
        return relativa
    base = (base or "/").rstrip("/")
    relativa = relativa.lstrip("/")
    if not base:
        return "/" + relativa
    return f"{base}/{relativa}"


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------
class SftpStgAdapter(StgAdapter):
    """
    Adapter SFTP funcional (Paquete 3 — solo lectura: ping + listado).
    """

    def __init__(
        self,
        host: str,
        puerto: int,
        usuario: str,
        password: str,
        ruta_base: str = "/",
        carpeta_recepcion: str = "",
        carpeta_envio: str = "",
        usar_tls: bool = True,
        timeout: int = 15,
    ):
        self.host = host
        self.puerto = puerto or 22
        self.usuario = usuario
        self.password = password
        self.ruta_base = ruta_base or "/"
        self.carpeta_recepcion = carpeta_recepcion or ""
        self.carpeta_envio = carpeta_envio or ""
        self.usar_tls = usar_tls
        self.timeout = timeout

    # ---- conexión interna ----
    def _connect(self):
        """
        Devuelve una tupla (transport, sftp_client). Llamar a `_close(transport)`
        cuando se haya terminado.

        Importamos `paramiko` aquí (no a nivel de módulo) para no obligar
        a tenerlo instalado si no se usa este adapter.
        """
        try:
            import paramiko  # noqa: F401
        except ImportError as e:
            raise RuntimeError(
                "El módulo SFTP requiere la librería 'paramiko'. "
                "Instálala con: pip install paramiko"
            ) from e

        transport = paramiko.Transport((self.host, int(self.puerto)))
        transport.banner_timeout = self.timeout
        transport.connect(username=self.usuario, password=self.password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        if sftp is None:
            transport.close()
            raise RuntimeError("No se pudo abrir canal SFTP tras conectar.")
        return transport, sftp

    def _close(self, transport):
        try:
            transport.close()
        except Exception:
            pass

    # ---- métodos públicos ----
    def ping(self) -> PingResult:
        start = time.time()
        try:
            transport, sftp = self._connect()
            try:
                # Hacemos un getcwd o stat sobre la ruta base como prueba de vida.
                try:
                    sftp.stat(self.ruta_base or ".")
                except Exception:
                    # Si la ruta_base no existe, igualmente la conexión se abrió OK.
                    pass
            finally:
                self._close(transport)
            elapsed_ms = int((time.time() - start) * 1000)
            return PingResult(
                ok=True,
                mensaje=f"Conectado a {self.host}:{self.puerto} como {self.usuario}",
                tiempo_ms=elapsed_ms,
            )
        except Exception as e:
            return PingResult(ok=False, mensaje=f"{type(e).__name__}: {e}")

    def listar_ficheros(
        self,
        filtro_patron: Optional[str] = None,
    ) -> dict:
        """
        Lista ficheros en `carpeta_recepcion` resuelta.

        Devuelve dict con: ruta_consultada, total, items[]
        donde cada item es {nombre, tamano_bytes, modificado}.
        """
        ruta_relativa_resuelta = resolver_plantillas_carpeta(self.carpeta_recepcion)
        ruta_final = _join_rutas(self.ruta_base, ruta_relativa_resuelta)

        transport, sftp = self._connect()
        try:
            try:
                entries = sftp.listdir_attr(ruta_final)
            except FileNotFoundError as e:
                raise RuntimeError(f"La carpeta no existe en el SFTP: {ruta_final}") from e
            except IOError as e:
                raise RuntimeError(f"No se puede leer la carpeta {ruta_final}: {e}") from e

            items = []
            for entry in entries:
                # Saltar directorios — solo ficheros
                if entry.st_mode is not None and stat_lib.S_ISDIR(entry.st_mode):
                    continue
                if filtro_patron and filtro_patron.lower() not in entry.filename.lower():
                    continue
                items.append({
                    "nombre": entry.filename,
                    "tamano_bytes": int(entry.st_size or 0),
                    "modificado": (
                        datetime.fromtimestamp(entry.st_mtime).isoformat()
                        if entry.st_mtime
                        else None
                    ),
                })
            items.sort(key=lambda x: x["nombre"])
            return {
                "ruta_consultada": ruta_final,
                "total": len(items),
                "items": items,
            }
        finally:
            self._close(transport)

    # ---- métodos pendientes ----
    def listar_cups(self) -> list[CupsExterno]:
        """No aplica para SFTP (se descubrirán al parsear ficheros, Paquete 6)."""
        return []

    def listar_concentradores(self) -> list[ConcentradorExterno]:
        """No aplica para SFTP (se descubrirán al parsear ficheros, Paquete 6)."""
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
        """
        Subir petición XML al SFTP. PENDIENTE Paquete 5 (necesita formato
        real del cliente). Por ahora devuelve error explicativo sin reventar.
        """
        return SolicitudExterna(
            referencia_externa=None,
            estado="error",
            mensaje=(
                "Envío de peticiones por SFTP pendiente de implementar (Paquete 5). "
                "El formato XML depende del STG del cliente."
            ),
        )
