# app/comunicaciones/services.py
# pyright: reportMissingImports=false

from __future__ import annotations

import ftplib
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Tuple

from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.comunicaciones.models import FtpConfig, FtpSyncLog
from app.empresas.models import Empresa


# ── Cifrado de contraseñas ────────────────────────────────────────────────────

def _get_fernet() -> Fernet:
    from app.core.config import get_settings
    key = get_settings().FTP_SECRET_KEY
    if not key:
        raise RuntimeError(
            "FTP_SECRET_KEY no definida en .env. "
            "Genera una con: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def cifrar_password(password: str) -> str:
    return _get_fernet().encrypt(password.encode()).decode()


def descifrar_password(password_cifrada: str) -> str:
    return _get_fernet().decrypt(password_cifrada.encode()).decode()


# ── FTP_TLS con reutilización de sesión SSL ───────────────────────────────────

class _FTPSReuse(ftplib.FTP_TLS):
    def ntransfercmd(self, cmd: str, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        conn = self.context.wrap_socket(
            conn,
            server_hostname=self.host,
            session=self.sock.session,
        )
        return conn, size


# ── Helpers empresa ───────────────────────────────────────────────────────────

def _nombre_empresa(db: Session, empresa_id: int) -> str:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return str(getattr(emp, "nombre", "") or f"Empresa {empresa_id}") if emp else f"Empresa {empresa_id}"


# ── CRUD FtpConfig ────────────────────────────────────────────────────────────

def list_configs(db: Session, *, tenant_id: int) -> List[dict]:
    rows = db.query(FtpConfig).filter(FtpConfig.tenant_id == tenant_id).all()
    result = []
    for r in rows:
        result.append({
            "id": r.id,
            "empresa_id": r.empresa_id,
            "empresa_nombre": _nombre_empresa(db, int(r.empresa_id)),
            "host": r.host,
            "puerto": r.puerto,
            "usuario": r.usuario,
            "directorio_remoto": r.directorio_remoto,
            "activo": r.activo,
        })
    return result


def create_config(
    db: Session, *,
    tenant_id: int,
    empresa_id: int,
    host: str,
    puerto: int,
    usuario: str,
    password: str,
    directorio_remoto: str,
    activo: bool,
) -> dict:
    obj = FtpConfig(
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        host=host,
        puerto=puerto,
        usuario=usuario,
        password_cifrada=cifrar_password(password),
        directorio_remoto=directorio_remoto,
        activo=activo,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id,
        "empresa_id": obj.empresa_id,
        "empresa_nombre": _nombre_empresa(db, int(obj.empresa_id)),
        "host": obj.host,
        "puerto": obj.puerto,
        "usuario": obj.usuario,
        "directorio_remoto": obj.directorio_remoto,
        "activo": obj.activo,
    }


def update_config(
    db: Session, *,
    config_id: int,
    tenant_id: int,
    host: Optional[str],
    puerto: Optional[int],
    usuario: Optional[str],
    password: Optional[str],
    directorio_remoto: Optional[str],
    activo: Optional[bool],
) -> dict:
    obj = db.query(FtpConfig).filter(
        FtpConfig.id == config_id,
        FtpConfig.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"FtpConfig id={config_id} no encontrada")
    if host is not None:
        obj.host = host  # type: ignore
    if puerto is not None:
        obj.puerto = puerto  # type: ignore
    if usuario is not None:
        obj.usuario = usuario  # type: ignore
    if password:
        obj.password_cifrada = cifrar_password(password)  # type: ignore
    if directorio_remoto is not None:
        obj.directorio_remoto = directorio_remoto  # type: ignore
    if activo is not None:
        obj.activo = activo  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id,
        "empresa_id": obj.empresa_id,
        "empresa_nombre": _nombre_empresa(db, int(obj.empresa_id)),
        "host": obj.host,
        "puerto": obj.puerto,
        "usuario": obj.usuario,
        "directorio_remoto": obj.directorio_remoto,
        "activo": obj.activo,
    }


def delete_config(db: Session, *, config_id: int, tenant_id: int) -> None:
    obj = db.query(FtpConfig).filter(
        FtpConfig.id == config_id,
        FtpConfig.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"FtpConfig id={config_id} no encontrada")
    db.delete(obj)
    db.commit()


def _get_config_or_raise(db: Session, *, config_id: int, tenant_id: int) -> FtpConfig:
    obj = db.query(FtpConfig).filter(
        FtpConfig.id == config_id,
        FtpConfig.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"FtpConfig id={config_id} no encontrada")
    return obj


def _get_config_by_empresa(db: Session, *, empresa_id: int, tenant_id: int) -> FtpConfig:
    obj = db.query(FtpConfig).filter(
        FtpConfig.empresa_id == empresa_id,
        FtpConfig.tenant_id == tenant_id,
        FtpConfig.activo.is_(True),
    ).first()
    if obj is None:
        raise ValueError(f"No hay configuración FTP activa para empresa {empresa_id}")
    return obj


# ── Conexión FTPS ─────────────────────────────────────────────────────────────

def _conectar_en_path(config: FtpConfig, path: str) -> _FTPSReuse:
    ftp = _FTPSReuse()
    ftp.connect(str(config.host), int(config.puerto), timeout=30)
    ftp.auth()
    ftp.login(str(config.usuario), descifrar_password(str(config.password_cifrada)))
    ftp.prot_p()
    ftp.set_pasv(True)
    clean = path.strip() or "/"
    if clean != "/":
        ftp.cwd(clean)
    return ftp


def _directorio_base(config: FtpConfig) -> str:
    return str(config.directorio_remoto or "/").strip() or "/"


# ── Test conexión ─────────────────────────────────────────────────────────────

def test_conexion(db: Session, *, config_id: int, tenant_id: int) -> Tuple[bool, str]:
    try:
        config = _get_config_or_raise(db, config_id=config_id, tenant_id=tenant_id)
        ftp = _conectar_en_path(config, _directorio_base(config))
        bienvenida = ftp.getwelcome()
        ftp.quit()
        return True, f"Conexión exitosa · {bienvenida[:80]}"
    except ValueError as e:
        return False, str(e)
    except ftplib.all_errors as e:
        return False, f"Error FTP: {str(e)[:200]}"
    except Exception as e:
        return False, f"Error: {str(e)[:200]}"


# ── Zona horaria FTP ──────────────────────────────────────────────────────────

def _get_tz_offset() -> int:
    try:
        from app.core.config import get_settings
        val = getattr(get_settings(), "FTP_TZ_OFFSET", 2)
        return int(val)
    except Exception:
        return 2


def _aplicar_tz(hora_utc: str) -> str:
    try:
        h, m = hora_utc.split(":")
        dt = datetime(2000, 1, 1, int(h), int(m)) + timedelta(hours=_get_tz_offset())
        return f"{dt.hour:02d}:{dt.minute:02d}"
    except Exception:
        return hora_utc


# ── Parsear línea LIST ────────────────────────────────────────────────────────

def _parse_list_line(linea: str) -> Optional[dict]:
    """
    Parsea línea LIST Unix: -rw-rw-rw- 1 user group SIZE MES DIA HORA NOMBRE
    """
    partes = linea.split()
    if len(partes) < 9:
        return None
    permisos = partes[0]
    if permisos.startswith("d"):
        tipo = "dir"
    elif permisos.startswith("-"):
        tipo = "file"
    else:
        return None
    try:
        tamanio = int(partes[4])
    except ValueError:
        tamanio = 0
    nombre = " ".join(partes[8:])
    if nombre in (".", ".."):
        return None

    mes_str = partes[5]
    dia_str = partes[6]
    tercero = partes[7]

    meses = {
        "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
        "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
        "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
    }
    mes_num = meses.get(mes_str, "00")
    dia_num = dia_str.zfill(2)

    if ":" in tercero:
        hora_local = _aplicar_tz(tercero)
        anio_num = str(datetime.now().year)
        hora_num = hora_local.replace(":", "")
        fecha_str = f"{mes_str} {dia_str} {hora_local}"
    else:
        anio_num = tercero.zfill(4)
        hora_num = "0000"
        fecha_str = f"{mes_str} {dia_str} {tercero}"

    fecha_sort = f"{anio_num}{mes_num}{dia_num}{hora_num}"
    # YYYYMM para filtro por mes — ej: "202604"
    fecha_mes_key = f"{anio_num}{mes_num}"

    return {
        "tipo": tipo,
        "nombre": nombre,
        "tamanio": tamanio,
        "fecha": fecha_str,
        "fecha_sort": fecha_sort,
        "fecha_mes_key": fecha_mes_key,
    }


# ── Listar contenido de un path (carpetas + ficheros) ─────────────────────────

def listar_path(
    db: Session, *,
    empresa_id: int,
    tenant_id: int,
    path: str,
    filtro_nombre: Optional[str] = None,
    filtro_mes: Optional[str] = None,
    limite: int = 5000,
) -> dict:
    """
    Lista el contenido de un path FTP remoto.
    - filtro_nombre: texto libre que se busca en el nombre del fichero
    - filtro_mes: mes en formato YYYY-MM (ej: 2026-04) — filtra por mes y año
    - Los dos filtros se aplican combinados (AND)
    """
    config = _get_config_by_empresa(db, empresa_id=empresa_id, tenant_id=tenant_id)

    partes_path = path.rstrip("/").rsplit("/", 1)
    path_padre = partes_path[0] if len(partes_path) > 1 and partes_path[0] else "/"

    # Convertir filtro_mes YYYY-MM → YYYYMM para comparar con fecha_mes_key
    mes_key: Optional[str] = None
    if filtro_mes and filtro_mes.strip():
        try:
            partes_mes = filtro_mes.strip().split("-")
            if len(partes_mes) == 2:
                mes_key = f"{partes_mes[0]}{partes_mes[1].zfill(2)}"
        except Exception:
            pass

    ftp = _conectar_en_path(config, path)
    carpetas: List[dict] = []
    ficheros: List[dict] = []

    try:
        lineas: List[str] = []
        ftp.retrlines("LIST", lineas.append)

        for linea in lineas:
            parsed = _parse_list_line(linea)
            if not parsed:
                continue
            if parsed["tipo"] == "dir":
                carpetas.append({
                    "nombre": parsed["nombre"],
                    "path": f"{path.rstrip('/')}/{parsed['nombre']}",
                })
            else:
                # Filtro por nombre — texto libre en el nombre del fichero
                if filtro_nombre and filtro_nombre.strip().lower() not in parsed["nombre"].lower():
                    continue
                # Filtro por mes — coincidencia exacta YYYYMM
                if mes_key and parsed["fecha_mes_key"] != mes_key:
                    continue
                ficheros.append({
                    "nombre": parsed["nombre"],
                    "tamanio": parsed["tamanio"],
                    "fecha": parsed["fecha"],
                    "fecha_sort": parsed["fecha_sort"],
                })

    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    carpetas.sort(key=lambda c: c["nombre"])
    ficheros.sort(key=lambda f: f["fecha_sort"], reverse=True)

    for f in ficheros:
        f.pop("fecha_sort", None)

    return {
        "path_actual": path,
        "path_padre": path_padre,
        "carpetas": carpetas,
        "ficheros": ficheros[:limite],
        "total_ficheros": len(ficheros),
    }


# ── Descargar ficheros ────────────────────────────────────────────────────────

def _directorio_descarga() -> Path:
    base = Path(os.environ.get("FTP_DOWNLOAD_DIR", "/tmp/ftp_downloads"))
    base.mkdir(parents=True, exist_ok=True)
    return base


def descargar_ficheros(
    db: Session, *,
    empresa_id: int,
    tenant_id: int,
    path: str,
    nombres: List[str],
) -> Tuple[int, int, List[str]]:
    config = _get_config_by_empresa(db, empresa_id=empresa_id, tenant_id=tenant_id)
    directorio_local = _directorio_descarga() / str(empresa_id)
    directorio_local.mkdir(parents=True, exist_ok=True)

    descargados = 0
    errores = 0
    detalle: List[str] = []

    ftp = _conectar_en_path(config, path)
    try:
        for nombre in nombres:
            try:
                destino = directorio_local / nombre
                with open(destino, "wb") as f:
                    ftp.retrbinary(f"RETR {nombre}", f.write)
                tamanio = destino.stat().st_size
                _log(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre, tamanio=tamanio, estado="ok")
                descargados += 1
                detalle.append(f"OK: {nombre}")
            except Exception as e:
                errores += 1
                msg = str(e)[:200]
                _log(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre, tamanio=None, estado="error", mensaje_error=msg)
                detalle.append(f"ERROR: {nombre} — {msg}")
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    return descargados, errores, detalle


# ── Historial ─────────────────────────────────────────────────────────────────

def _log(
    db: Session, *,
    tenant_id: int,
    empresa_id: int,
    nombre_fichero: str,
    tamanio: Optional[int],
    estado: str,
    mensaje_error: Optional[str] = None,
) -> None:
    entry = FtpSyncLog(
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        nombre_fichero=nombre_fichero,
        tamanio=tamanio,
        estado=estado,
        mensaje_error=mensaje_error,
    )
    db.add(entry)
    db.commit()


def list_logs(db: Session, *, tenant_id: int, limit: int = 100) -> List[dict]:
    rows = (
        db.query(FtpSyncLog)
        .filter(FtpSyncLog.tenant_id == tenant_id)
        .order_by(FtpSyncLog.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for r in rows:
        result.append({
            "id": r.id,
            "empresa_id": r.empresa_id,
            "empresa_nombre": _nombre_empresa(db, int(r.empresa_id)),
            "nombre_fichero": r.nombre_fichero,
            "tamanio": r.tamanio,
            "estado": r.estado,
            "mensaje_error": r.mensaje_error,
            "created_at": r.created_at,
        })
    return result
