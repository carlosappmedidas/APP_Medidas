# app/stg/adapters/ftp_adapter.py
# pyright: reportMissingImports=false
"""
Adapter FTP del STG.

Pensado para los concentradores / STG de cliente que hablan FTP (con o sin TLS),
muchos detrás de NAT. Reutiliza las clases helper del módulo `comunicaciones`:

  - _FTPSReuse        : FTPS con reutilización de sesión SSL (para FTPS).
  - _FTPNatPassive    : FTP plano que ignora la IP del PASV y usa la del host
                        (necesario para servidores detrás de NAT, ej. San José).

Operaciones implementadas (Paquete 4):
  - ping()
  - listar_ficheros(filtro_patron=None)

Operaciones pendientes:
  - listar_cups(), listar_concentradores(): de parsear ficheros recibidos (Paquete 6).
  - solicitar_fichero(): subir XML de petición (Paquete 5, cuando conozcamos
    el formato real del cliente).
"""
from __future__ import annotations

import io
import re
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
from app.stg.adapters.sftp_adapter import (
    resolver_plantillas_carpeta,
    _join_rutas,
)


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------
class FtpStgAdapter(StgAdapter):
    """
    Adapter FTP/FTPS funcional (Paquete 4 — solo lectura).
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
        usar_tls: bool = False,
        timeout: int = 20,
    ):
        self.host = host
        self.puerto = puerto or 21
        self.usuario = usuario
        self.password = password
        self.ruta_base = ruta_base or "/"
        self.carpeta_recepcion = carpeta_recepcion or ""
        self.carpeta_envio = carpeta_envio or ""
        self.usar_tls = usar_tls
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Conexión interna — reutiliza las clases helper de `comunicaciones`
    # ------------------------------------------------------------------
    def _connect(self):
        """
        Devuelve un cliente FTP/FTPS conectado y autenticado, posicionado en
        ruta_base. Llamar a `_close(ftp)` cuando se haya terminado.
        """
        # Importamos aquí (no a nivel de módulo) para no obligar a cargar el
        # módulo `comunicaciones` si no se usa este adapter.
        from app.comunicaciones.services import _FTPSReuse, _FTPNatPassive

        if self.usar_tls:
            ftp = _FTPSReuse()
            ftp.connect(self.host, int(self.puerto), timeout=self.timeout)
            ftp.login(self.usuario, self.password)
            try:
                ftp.prot_p()  # canal de datos cifrado
            except Exception:
                # Algunos servidores no aceptan PROT P; no es crítico para listar.
                pass
        else:
            ftp = _FTPNatPassive()
            ftp.connect(self.host, int(self.puerto), timeout=self.timeout)
            ftp.login(self.usuario, self.password)

        ftp.set_pasv(True)
        # Navega a la ruta_base si no es root
        if self.ruta_base and self.ruta_base != "/":
            try:
                ftp.cwd(self.ruta_base)
            except Exception:
                # No fatal — quizá la ruta_base se aplica a nivel de carpeta_recepcion
                pass
        return ftp

    def _close(self, ftp):
        try:
            ftp.quit()
        except Exception:
            try:
                ftp.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # ping
    # ------------------------------------------------------------------
    def ping(self) -> PingResult:
        start = time.time()
        try:
            ftp = self._connect()
            try:
                # Comando barato como prueba de vida
                try:
                    ftp.voidcmd("NOOP")
                except Exception:
                    pass
            finally:
                self._close(ftp)
            elapsed_ms = int((time.time() - start) * 1000)
            proto = "FTPS" if self.usar_tls else "FTP"
            return PingResult(
                ok=True,
                mensaje=f"Conectado a {self.host}:{self.puerto} ({proto}) como {self.usuario}",
                tiempo_ms=elapsed_ms,
            )
        except Exception as e:
            return PingResult(ok=False, mensaje=f"{type(e).__name__}: {e}")

    # ------------------------------------------------------------------
    # listar ficheros en carpeta_recepcion (resolviendo plantillas)
    # ------------------------------------------------------------------
    def listar_ficheros(
        self,
        filtro_patron: Optional[str] = None,
    ) -> dict:
        """
        Lista ficheros en la carpeta_recepcion (con plantillas resueltas).

        Devuelve dict: {ruta_consultada, total, items[]}
        donde cada item es {nombre, tamano_bytes, modificado}.
        """
        ruta_relativa = resolver_plantillas_carpeta(self.carpeta_recepcion)
        # La ruta puede ser absoluta (empezando con '/') o relativa a ruta_base.
        # _join_rutas la combina correctamente.
        ruta_final = _join_rutas(self.ruta_base, ruta_relativa)

        ftp = self._connect()
        try:
            try:
                ftp.cwd(ruta_final)
            except Exception as e:
                raise RuntimeError(f"No se puede acceder a la carpeta {ruta_final}: {e}") from e

            # MLSD (FTP moderno) es el más fiable para tamaños y fechas
            items = []
            try:
                for nombre, facts in ftp.mlsd():
                    if facts.get("type") == "dir":
                        continue  # solo ficheros
                    if filtro_patron and filtro_patron.lower() not in nombre.lower():
                        continue
                    items.append({
                        "nombre": nombre,
                        "tamano_bytes": int(facts.get("size", 0) or 0),
                        "modificado": _parse_mlsd_time(facts.get("modify")),
                    })
            except (Exception,) as mlsd_err:
                # MLSD no soportado → fallback a LIST
                items = _listar_via_list(ftp, ruta_final, filtro_patron)

            items.sort(key=lambda x: x["nombre"])
            return {
                "ruta_consultada": ruta_final,
                "total": len(items),
                "items": items,
            }
        finally:
            self._close(ftp)

    # ------------------------------------------------------------------
    # descargar_fichero (Paquete 5)
    # ------------------------------------------------------------------
    def descargar_fichero(self, remote_name: str, local_path: str) -> int:
        """
        Descarga un fichero de la carpeta_recepcion al path local indicado.
        Devuelve el número de bytes descargados.

        El directorio padre del local_path debe existir.
        """
        import os

        ruta_relativa = resolver_plantillas_carpeta(self.carpeta_recepcion) \
            if False else None
        # Importar el helper local (de ftp_adapter)
        from app.stg.adapters.sftp_adapter import (
            resolver_plantillas_carpeta as _resolver,
            _join_rutas,
        )
        ruta_relativa = _resolver(self.carpeta_recepcion)
        ruta_remota_dir = _join_rutas(self.ruta_base, ruta_relativa)

        ftp = self._connect()
        try:
            try:
                ftp.cwd(ruta_remota_dir)
            except Exception as e:
                raise RuntimeError(
                    f"No se puede acceder a la carpeta {ruta_remota_dir}: {e}"
                ) from e

            # Asegurar que el directorio padre del local_path existe
            os.makedirs(os.path.dirname(local_path), exist_ok=True)

            try:
                with open(local_path, "wb") as f:
                    ftp.retrbinary(f"RETR {remote_name}", f.write)
            except Exception as e:
                # Si la descarga falló a medias, borrar el fichero corrupto
                if os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                    except Exception:
                        pass
                raise RuntimeError(f"Error descargando {remote_name}: {e}") from e

            return os.path.getsize(local_path)
        finally:
            self._close(ftp)

    # ------------------------------------------------------------------
    # pendientes
    # ------------------------------------------------------------------
    def listar_cups(self) -> list[CupsExterno]:
        return []

    def listar_concentradores(self) -> list[ConcentradorExterno]:
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
        return SolicitudExterna(
            referencia_externa=None,
            estado="error",
            mensaje=(
                "Envío de peticiones por FTP pendiente de implementar (Paquete 5). "
                "El formato XML depende del STG del cliente."
            ),
        )


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------
def _parse_mlsd_time(modify_str: Optional[str]) -> Optional[str]:
    """Convierte la fecha en formato MLSD ('YYYYMMDDHHMMSS') a ISO 8601."""
    if not modify_str:
        return None
    try:
        dt = datetime.strptime(modify_str[:14], "%Y%m%d%H%M%S")
        return dt.isoformat()
    except Exception:
        return None


# Regex para parsear `LIST` estilo UNIX:
#   -rw-r--r-- 1 user group   1234 May 12 14:30 fichero.txt
_LIST_UNIX_RE = re.compile(
    r"^([\-d])\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$"
)


def _listar_via_list(ftp, ruta: str, filtro_patron: Optional[str]) -> list[dict]:
    """Fallback a LIST cuando MLSD no está disponible."""
    lineas: list[str] = []
    ftp.retrlines("LIST", lineas.append)
    items = []
    for linea in lineas:
        m = _LIST_UNIX_RE.match(linea)
        if not m:
            continue
        tipo, size_str, fecha_str, nombre = m.group(1), m.group(2), m.group(3), m.group(4)
        if tipo == "d":
            continue
        if filtro_patron and filtro_patron.lower() not in nombre.lower():
            continue
        items.append({
            "nombre": nombre,
            "tamano_bytes": int(size_str or 0),
            "modificado": None,  # parsear fecha LIST es frágil; lo dejamos vacío
        })
    return items
