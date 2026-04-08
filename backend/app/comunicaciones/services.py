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

from app.comunicaciones.models import FtpConfig, FtpSyncLog, FtpSyncRule
from app.empresas.models import Empresa


# ── Cifrado ───────────────────────────────────────────────────────────────────

def _get_fernet() -> Fernet:
    from app.core.config import get_settings
    key = get_settings().FTP_SECRET_KEY
    if not key:
        raise RuntimeError("FTP_SECRET_KEY no definida en .env.")
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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _nombre_empresa(db: Session, empresa_id: int) -> str:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return str(getattr(emp, "nombre", "") or f"Empresa {empresa_id}") if emp else f"Empresa {empresa_id}"


def _config_to_dict(obj: FtpConfig, db: Session) -> dict:
    return {
        "id": obj.id,
        "empresa_id": obj.empresa_id,
        "empresa_nombre": _nombre_empresa(db, int(obj.empresa_id)),
        "nombre": obj.nombre,
        "host": obj.host,
        "puerto": obj.puerto,
        "usuario": obj.usuario,
        "directorio_remoto": obj.directorio_remoto,
        "usar_tls": obj.usar_tls,
        "activo": obj.activo,
    }


def _rule_to_dict(obj: FtpSyncRule, db: Session) -> dict:
    config = db.query(FtpConfig).filter(FtpConfig.id == obj.config_id).first()
    return {
        "id": obj.id,
        "config_id": obj.config_id,
        "config_nombre": getattr(config, "nombre", None) if config else None,
        "empresa_nombre": _nombre_empresa(db, int(config.empresa_id)) if config else "—",
        "nombre": obj.nombre,
        "directorio": obj.directorio,
        "patron_nombre": obj.patron_nombre,
        "intervalo_horas": obj.intervalo_horas,
        "activo": obj.activo,
        "ultima_ejecucion": obj.ultima_ejecucion,
        "proxima_ejecucion": obj.proxima_ejecucion,
    }


# ── CRUD FtpConfig ────────────────────────────────────────────────────────────

def list_configs(db: Session, *, tenant_id: int) -> List[dict]:
    rows = db.query(FtpConfig).filter(FtpConfig.tenant_id == tenant_id).all()
    return [_config_to_dict(r, db) for r in rows]


def create_config(
    db: Session, *,
    tenant_id: int,
    empresa_id: int,
    nombre: Optional[str],
    host: str,
    puerto: int,
    usuario: str,
    password: str,
    directorio_remoto: str,
    usar_tls: bool,
    activo: bool,
) -> dict:
    obj = FtpConfig(
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        nombre=nombre,
        host=host,
        puerto=puerto,
        usuario=usuario,
        password_cifrada=cifrar_password(password),
        directorio_remoto=directorio_remoto,
        usar_tls=usar_tls,
        activo=activo,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _config_to_dict(obj, db)


def update_config(
    db: Session, *,
    config_id: int,
    tenant_id: int,
    nombre: Optional[str],
    host: Optional[str],
    puerto: Optional[int],
    usuario: Optional[str],
    password: Optional[str],
    directorio_remoto: Optional[str],
    usar_tls: Optional[bool],
    activo: Optional[bool],
) -> dict:
    obj = db.query(FtpConfig).filter(
        FtpConfig.id == config_id,
        FtpConfig.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"FtpConfig id={config_id} no encontrada")
    if nombre is not None:
        obj.nombre = nombre  # type: ignore
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
    if usar_tls is not None:
        obj.usar_tls = usar_tls  # type: ignore
    if activo is not None:
        obj.activo = activo  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return _config_to_dict(obj, db)


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


def _get_config_by_id_activa(db: Session, *, config_id: int, tenant_id: int) -> FtpConfig:
    obj = db.query(FtpConfig).filter(
        FtpConfig.id == config_id,
        FtpConfig.tenant_id == tenant_id,
        FtpConfig.activo.is_(True),
    ).first()
    if obj is None:
        raise ValueError(f"Config FTP id={config_id} no encontrada o inactiva")
    return obj


# ── CRUD FtpSyncRule ──────────────────────────────────────────────────────────

def list_rules(db: Session, *, tenant_id: int, config_id: Optional[int] = None) -> List[dict]:
    q = db.query(FtpSyncRule).filter(FtpSyncRule.tenant_id == tenant_id)
    if config_id:
        q = q.filter(FtpSyncRule.config_id == config_id)
    return [_rule_to_dict(r, db) for r in q.all()]


def create_rule(
    db: Session, *,
    tenant_id: int,
    config_id: int,
    nombre: Optional[str],
    directorio: str,
    patron_nombre: Optional[str],
    intervalo_horas: int,
    activo: bool,
) -> dict:
    proxima = datetime.utcnow() + timedelta(hours=intervalo_horas)
    obj = FtpSyncRule(
        tenant_id=tenant_id,
        config_id=config_id,
        nombre=nombre,
        directorio=directorio,
        patron_nombre=patron_nombre or None,
        intervalo_horas=intervalo_horas,
        activo=activo,
        proxima_ejecucion=proxima,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _rule_to_dict(obj, db)


def update_rule(
    db: Session, *,
    rule_id: int,
    tenant_id: int,
    nombre: Optional[str],
    directorio: Optional[str],
    patron_nombre: Optional[str],
    intervalo_horas: Optional[int],
    activo: Optional[bool],
) -> dict:
    obj = db.query(FtpSyncRule).filter(
        FtpSyncRule.id == rule_id,
        FtpSyncRule.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"FtpSyncRule id={rule_id} no encontrada")
    if nombre is not None:
        obj.nombre = nombre  # type: ignore
    if directorio is not None:
        obj.directorio = directorio  # type: ignore
    if patron_nombre is not None:
        obj.patron_nombre = patron_nombre or None  # type: ignore
    if intervalo_horas is not None:
        obj.intervalo_horas = intervalo_horas  # type: ignore
        obj.proxima_ejecucion = datetime.utcnow() + timedelta(hours=intervalo_horas)  # type: ignore
    if activo is not None:
        obj.activo = activo  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return _rule_to_dict(obj, db)


def delete_rule(db: Session, *, rule_id: int, tenant_id: int) -> None:
    obj = db.query(FtpSyncRule).filter(
        FtpSyncRule.id == rule_id,
        FtpSyncRule.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"FtpSyncRule id={rule_id} no encontrada")
    db.delete(obj)
    db.commit()


# ── Conexión FTP ──────────────────────────────────────────────────────────────

def _get_tz_offset() -> int:
    try:
        from app.core.config import get_settings
        return int(getattr(get_settings(), "FTP_TZ_OFFSET", 2))
    except Exception:
        return 2


def _aplicar_tz(hora_utc: str) -> str:
    try:
        h, m = hora_utc.split(":")
        dt = datetime(2000, 1, 1, int(h), int(m)) + timedelta(hours=_get_tz_offset())
        return f"{dt.hour:02d}:{dt.minute:02d}"
    except Exception:
        return hora_utc


def _conectar_en_path(config: FtpConfig, path: str):
    usar_tls = bool(getattr(config, "usar_tls", True))
    password = descifrar_password(str(config.password_cifrada))
    clean_path = (path or "/").strip() or "/"
    if usar_tls:
        ftp = _FTPSReuse()
        ftp.connect(str(config.host), int(config.puerto), timeout=30)
        ftp.auth()
        ftp.login(str(config.usuario), password)
        ftp.prot_p()
        ftp.set_pasv(True)
    else:
        ftp = ftplib.FTP()  # type: ignore
        ftp.connect(str(config.host), int(config.puerto), timeout=30)
        ftp.login(str(config.usuario), password)
        ftp.set_pasv(True)
    if clean_path != "/":
        ftp.cwd(clean_path)
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
        modo = "FTPS/TLS" if bool(getattr(config, "usar_tls", True)) else "FTP"
        return True, f"Conexión {modo} exitosa · {bienvenida[:80]}"
    except ValueError as e:
        return False, str(e)
    except ftplib.all_errors as e:
        return False, f"Error FTP: {str(e)[:200]}"
    except Exception as e:
        return False, f"Error: {str(e)[:200]}"


# ── Parsear línea LIST ────────────────────────────────────────────────────────

def _parse_list_line(linea: str) -> Optional[dict]:
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

    return {
        "tipo": tipo,
        "nombre": nombre,
        "tamanio": tamanio,
        "fecha": fecha_str,
        "fecha_sort": f"{anio_num}{mes_num}{dia_num}{hora_num}",
        "fecha_mes_key": f"{anio_num}{mes_num}",
    }


# ── Listar path (explorador manual) ──────────────────────────────────────────

def listar_path(
    db: Session, *,
    config_id: int,
    tenant_id: int,
    path: str,
    filtro_nombre: Optional[str] = None,
    filtro_mes: Optional[str] = None,
    limite: int = 5000,
) -> dict:
    config = _get_config_by_id_activa(db, config_id=config_id, tenant_id=tenant_id)
    partes_path = path.rstrip("/").rsplit("/", 1)
    path_padre = partes_path[0] if len(partes_path) > 1 and partes_path[0] else "/"

    mes_key: Optional[str] = None
    if filtro_mes and filtro_mes.strip():
        try:
            p = filtro_mes.strip().split("-")
            if len(p) == 2:
                mes_key = f"{p[0]}{p[1].zfill(2)}"
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
                if filtro_nombre and filtro_nombre.strip().lower() not in parsed["nombre"].lower():
                    continue
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


# ── Descargar ficheros (manual) ───────────────────────────────────────────────

def _directorio_descarga() -> Path:
    base = Path(os.environ.get("FTP_DOWNLOAD_DIR", "/tmp/ftp_downloads"))
    base.mkdir(parents=True, exist_ok=True)
    return base


def descargar_ficheros(
    db: Session, *,
    config_id: int,
    tenant_id: int,
    path: str,
    nombres: List[str],
) -> Tuple[int, int, List[str]]:
    config = _get_config_by_id_activa(db, config_id=config_id, tenant_id=tenant_id)
    directorio_local = _directorio_descarga() / str(config.empresa_id)
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
                _log(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=int(config.empresa_id),
                    config_id=config_id,
                    rule_id=None,
                    origen="manual",
                    nombre_fichero=nombre,
                    tamanio=tamanio,
                    estado="ok",
                )
                descargados += 1
                detalle.append(f"OK: {nombre}")
            except Exception as e:
                errores += 1
                msg = str(e)[:200]
                _log(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=int(config.empresa_id),
                    config_id=config_id,
                    rule_id=None,
                    origen="manual",
                    nombre_fichero=nombre,
                    tamanio=None,
                    estado="error",
                    mensaje_error=msg,
                )
                detalle.append(f"ERROR: {nombre} — {msg}")
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    return descargados, errores, detalle


# ── Ejecutar regla automática ─────────────────────────────────────────────────

def ejecutar_regla(db: Session, *, rule_id: int) -> Tuple[int, int, List[str]]:
    """
    Ejecuta una regla de sync automática:
    1. Lista ficheros en el FTP que coinciden con el patrón
    2. Filtra los que ya están descargados en ftp_sync_log (estado=ok)
    3. Descarga solo los nuevos
    4. Actualiza ultima_ejecucion y proxima_ejecucion
    """
    rule = db.query(FtpSyncRule).filter(FtpSyncRule.id == rule_id).first()
    if rule is None:
        raise ValueError(f"Regla id={rule_id} no encontrada")

    config = db.query(FtpConfig).filter(
        FtpConfig.id == rule.config_id,
        FtpConfig.activo.is_(True),
    ).first()
    if config is None:
        raise ValueError(f"Conexión id={rule.config_id} no encontrada o inactiva")

    tenant_id = int(rule.tenant_id)
    empresa_id = int(config.empresa_id)
    directorio = str(rule.directorio or "/")
    patron = str(rule.patron_nombre or "").lower().strip()

    # Ficheros ya descargados correctamente para esta conexión
    ya_descargados = set(
        row.nombre_fichero
        for row in db.query(FtpSyncLog).filter(
            FtpSyncLog.config_id == rule.config_id,
            FtpSyncLog.estado == "ok",
        ).all()
    )

    # Listar ficheros del FTP
    ftp = _conectar_en_path(config, directorio)
    candidatos: List[str] = []
    try:
        lineas: List[str] = []
        ftp.retrlines("LIST", lineas.append)
        for linea in lineas:
            parsed = _parse_list_line(linea)
            if not parsed or parsed["tipo"] != "file":
                continue
            nombre = parsed["nombre"]
            if patron and patron not in nombre.lower():
                continue
            if nombre in ya_descargados:
                continue
            candidatos.append(nombre)
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    if not candidatos:
        _actualizar_tiempos_regla(db, rule)
        return 0, 0, ["Sin ficheros nuevos"]

    # Descargar candidatos
    directorio_local = _directorio_descarga() / str(empresa_id)
    directorio_local.mkdir(parents=True, exist_ok=True)

    descargados = 0
    errores = 0
    detalle: List[str] = []

    ftp2 = _conectar_en_path(config, directorio)
    try:
        for nombre in candidatos:
            try:
                destino = directorio_local / nombre
                with open(destino, "wb") as f:
                    ftp2.retrbinary(f"RETR {nombre}", f.write)
                tamanio = destino.stat().st_size
                _log(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    config_id=int(rule.config_id),
                    rule_id=rule_id,
                    origen="auto",
                    nombre_fichero=nombre,
                    tamanio=tamanio,
                    estado="ok",
                )
                descargados += 1
                detalle.append(f"OK: {nombre}")
            except Exception as e:
                errores += 1
                msg = str(e)[:200]
                _log(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    config_id=int(rule.config_id),
                    rule_id=rule_id,
                    origen="auto",
                    nombre_fichero=nombre,
                    tamanio=None,
                    estado="error",
                    mensaje_error=msg,
                )
                detalle.append(f"ERROR: {nombre} — {msg}")
    finally:
        try:
            ftp2.quit()
        except Exception:
            pass

    _actualizar_tiempos_regla(db, rule)
    return descargados, errores, detalle


def _actualizar_tiempos_regla(db: Session, rule: FtpSyncRule) -> None:
    ahora = datetime.utcnow()
    rule.ultima_ejecucion = ahora  # type: ignore
    rule.proxima_ejecucion = ahora + timedelta(hours=int(rule.intervalo_horas))  # type: ignore
    rule.updated_at = ahora  # type: ignore
    db.commit()


# ── Log ───────────────────────────────────────────────────────────────────────

def _log(
    db: Session, *,
    tenant_id: int,
    empresa_id: int,
    config_id: Optional[int],
    rule_id: Optional[int],
    origen: str,
    nombre_fichero: str,
    tamanio: Optional[int],
    estado: str,
    mensaje_error: Optional[str] = None,
) -> None:
    entry = FtpSyncLog(
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        config_id=config_id,
        rule_id=rule_id,
        origen=origen,
        nombre_fichero=nombre_fichero,
        tamanio=tamanio,
        estado=estado,
        mensaje_error=mensaje_error,
    )
    db.add(entry)
    db.commit()


def list_logs(
    db: Session, *,
    tenant_id: int,
    origen: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    q = db.query(FtpSyncLog).filter(FtpSyncLog.tenant_id == tenant_id)
    if origen:
        q = q.filter(FtpSyncLog.origen == origen)
    rows = q.order_by(FtpSyncLog.created_at.desc()).limit(limit).all()
    result = []
    for r in rows:
        result.append({
            "id": r.id,
            "empresa_id": r.empresa_id,
            "empresa_nombre": _nombre_empresa(db, int(r.empresa_id)),
            "config_id": r.config_id,
            "rule_id": r.rule_id,
            "origen": r.origen,
            "nombre_fichero": r.nombre_fichero,
            "tamanio": r.tamanio,
            "estado": r.estado,
            "mensaje_error": r.mensaje_error,
            "created_at": r.created_at,
        })
    return result
