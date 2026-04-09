# app/comunicaciones/services.py
# pyright: reportMissingImports=false

from __future__ import annotations

import ftplib
import io
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

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


# ── FTP plano con fix NAT — fuerza IP del host en PASV ───────────────────────

class _FTPNatPassive(ftplib.FTP):
    """
    FTP pasivo que ignora la IP devuelta por PASV y usa la IP del host.
    Necesario para servidores FTP detrás de NAT (ej: San José, Las Mercedes).
    """
    def makepasv(self):
        _, port = super().makepasv()
        return self.host, port


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
        "descargar_desde": obj.descargar_desde,
    }


# ── Directorio dinámico ───────────────────────────────────────────────────────

def _resolver_directorio(directorio: str, mes: Optional[str] = None) -> str:
    """
    Sustituye placeholders de fecha en el directorio FTP:
      {mes_actual}   → YYYYMM del mes en curso       ej: 202604
      {mes_anterior} → YYYYMM del mes anterior        ej: 202603
    Si se pasa 'mes' (formato YYYYMM), {mes_actual} se sustituye por ese mes.
    """
    hoy = date.today()
    mes_actual = mes if mes else hoy.strftime("%Y%m")
    primer_dia = hoy.replace(day=1)
    mes_anterior = (primer_dia - timedelta(days=1)).strftime("%Y%m")
    directorio = directorio.replace("{mes_actual}", mes_actual)
    directorio = directorio.replace("{mes_anterior}", mes_anterior)
    return directorio


def _es_directorio_mensual(directorio: str) -> bool:
    return "{mes_actual}" in directorio


def _meses_entre(desde: date, hasta: date) -> List[str]:
    meses = []
    actual = desde.replace(day=1)
    fin = hasta.replace(day=1)
    while actual <= fin:
        meses.append(actual.strftime("%Y%m"))
        if actual.month == 12:
            actual = actual.replace(year=actual.year + 1, month=1)
        else:
            actual = actual.replace(month=actual.month + 1)
    return meses


# ── Filtro S02 más grande por concentrador/día ────────────────────────────────

def _filtrar_s02_mas_grandes(candidatos: List[dict]) -> List[dict]:
    """
    De una lista de ficheros candidatos, selecciona solo el S02 de mayor
    tamaño por cada concentrador y día. Devuelve la lista completa de dicts
    (no solo nombres) para preservar fecha_ftp.
    """
    patron_s02 = re.compile(r"^([A-Z]{3}\d+)_[^_]+_S02_[^_]+_(\d{8})\d+$")

    grupos: Dict[Tuple[str, str], dict] = {}
    no_s02: List[dict] = []

    for item in candidatos:
        nombre = item["nombre"]
        tamanio = item["tamanio"]
        m = patron_s02.match(nombre)
        if m:
            clave = (m.group(1), m.group(2))
            if clave not in grupos or tamanio > grupos[clave]["tamanio"]:
                grupos[clave] = item
        else:
            no_s02.append(item)

    return list(grupos.values()) + no_s02


# ── Descarga de un directorio concreto ───────────────────────────────────────

def _descargar_directorio(
    config: FtpConfig,
    directorio: str,
    patron: str,
    ya_descargados: set,
    directorio_local: Path,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    rule_id: int,
) -> Tuple[int, int, List[str]]:
    """
    Lista y descarga ficheros de un directorio FTP concreto.
    Guarda la fecha de publicación FTP (fecha_ftp) en el log.
    """
    ftp = _conectar_en_path(config, directorio)
    candidatos_raw: List[dict] = []
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
            candidatos_raw.append({
                "nombre": nombre,
                "tamanio": parsed["tamanio"],
                "fecha_ftp": parsed["fecha"],  # fecha de publicación en el FTP
            })
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    candidatos = _filtrar_s02_mas_grandes(candidatos_raw)

    if not candidatos:
        return 0, 0, []

    descargados = 0
    errores = 0
    detalle: List[str] = []

    ftp2 = _conectar_en_path(config, directorio)
    try:
        for item in candidatos:
            nombre = item["nombre"]
            fecha_ftp = item.get("fecha_ftp")
            try:
                destino = directorio_local / nombre
                with open(destino, "wb") as f:
                    ftp2.retrbinary(f"RETR {nombre}", f.write)
                tamanio = destino.stat().st_size
                _log(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    config_id=int(config.id),
                    rule_id=rule_id,
                    origen="auto",
                    nombre_fichero=nombre,
                    tamanio=tamanio,
                    estado="ok",
                    fecha_ftp=fecha_ftp,
                )
                ya_descargados.add(nombre)
                descargados += 1
                detalle.append(f"OK [{directorio}]: {nombre}")
            except Exception as e:
                errores += 1
                msg = str(e)[:200]
                _log(
                    db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    config_id=int(config.id),
                    rule_id=rule_id,
                    origen="auto",
                    nombre_fichero=nombre,
                    tamanio=None,
                    estado="error",
                    mensaje_error=msg,
                    fecha_ftp=fecha_ftp,
                )
                detalle.append(f"ERROR [{directorio}]: {nombre} — {msg}")
    finally:
        try:
            ftp2.quit()
        except Exception:
            pass

    return descargados, errores, detalle


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
    descargar_desde: Optional[date] = None,
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
        descargar_desde=descargar_desde,
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
    descargar_desde: Optional[date] = None,
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
    if descargar_desde is not None:
        obj.descargar_desde = descargar_desde  # type: ignore
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
        ftp = _FTPNatPassive()  # type: ignore
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
        ahora = datetime.now()
        try:
            fecha_tentativa = datetime(ahora.year, int(mes_num), int(dia_num))
            anio_num = str(ahora.year if fecha_tentativa <= ahora else ahora.year - 1)
        except Exception:
            anio_num = str(ahora.year)
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
            elif len(p) == 1 and p[0].isdigit():
                mes_key = p[0]
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
                if mes_key:
                    if len(mes_key) == 6 and parsed["fecha_mes_key"] != mes_key:
                        continue
                    elif len(mes_key) == 4 and not parsed["fecha_mes_key"].startswith(mes_key):
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


# ── Descargar ficheros (al servidor) — descarga manual ───────────────────────

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
    """Descarga manual — obtiene fecha_ftp de un LIST previo."""
    config = _get_config_by_id_activa(db, config_id=config_id, tenant_id=tenant_id)
    directorio_local = _directorio_descarga() / str(config.empresa_id)
    directorio_local.mkdir(parents=True, exist_ok=True)

    # Obtener fechas FTP de los ficheros a descargar
    fechas_ftp: Dict[str, str] = {}
    try:
        ftp_list = _conectar_en_path(config, path)
        lineas: List[str] = []
        ftp_list.retrlines("LIST", lineas.append)
        for linea in lineas:
            parsed = _parse_list_line(linea)
            if parsed and parsed["tipo"] == "file" and parsed["nombre"] in nombres:
                fechas_ftp[parsed["nombre"]] = parsed["fecha"]
        ftp_list.quit()
    except Exception:
        pass

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
                    fecha_ftp=fechas_ftp.get(nombre),
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
                    fecha_ftp=fechas_ftp.get(nombre),
                )
                detalle.append(f"ERROR: {nombre} — {msg}")
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    return descargados, errores, detalle


# ── Leer fichero en memoria (descarga directa al navegador) ──────────────────

def leer_fichero_ftp(
    db: Session, *,
    config_id: int,
    tenant_id: int,
    path: str,
    fichero: str,
    registrar: bool = True,
) -> bytes:
    config = _get_config_by_id_activa(db, config_id=config_id, tenant_id=tenant_id)
    ftp = _conectar_en_path(config, path)
    try:
        buf = io.BytesIO()
        ftp.retrbinary(f"RETR {fichero}", buf.write)
        contenido = buf.getvalue()
    finally:
        try:
            ftp.quit()
        except Exception:
            pass
    if registrar:
        _log(
            db,
            tenant_id=tenant_id,
            empresa_id=int(config.empresa_id),
            config_id=config_id,
            rule_id=None,
            origen="manual",
            nombre_fichero=fichero,
            tamanio=len(contenido),
            estado="ok",
        )
    return contenido


# ── Ejecutar regla automática ─────────────────────────────────────────────────

def ejecutar_regla(db: Session, *, rule_id: int) -> Tuple[int, int, List[str]]:
    """
    Ejecuta una regla de sync automática.

    Si el directorio contiene {mes_actual} + descargar_desde + primera ejecución:
      → Modo histórico: recorre todos los meses desde descargar_desde hasta hoy.

    En ejecuciones posteriores o directorios fijos:
      → Modo normal: solo el directorio actual.
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
    patron = str(rule.patron_nombre or "").lower().strip()

    ya_descargados = set(
        row.nombre_fichero
        for row in db.query(FtpSyncLog).filter(
            FtpSyncLog.config_id == rule.config_id,
            FtpSyncLog.estado == "ok",
        ).all()
    )

    directorio_local = _directorio_descarga() / str(empresa_id)
    directorio_local.mkdir(parents=True, exist_ok=True)

    total_descargados = 0
    total_errores = 0
    total_detalle: List[str] = []

    es_mensual = _es_directorio_mensual(str(rule.directorio or "/"))
    es_primera_ejecucion = rule.ultima_ejecucion is None

    if es_mensual and rule.descargar_desde and es_primera_ejecucion:
        # ── MODO HISTÓRICO ────────────────────────────────────────────────────
        meses = _meses_entre(rule.descargar_desde, date.today())
        for mes in meses:
            directorio_mes = _resolver_directorio(str(rule.directorio), mes=mes)
            try:
                d, e, det = _descargar_directorio(
                    config=config,
                    directorio=directorio_mes,
                    patron=patron,
                    ya_descargados=ya_descargados,
                    directorio_local=directorio_local,
                    db=db,
                    tenant_id=tenant_id,
                    empresa_id=empresa_id,
                    rule_id=rule_id,
                )
                total_descargados += d
                total_errores += e
                total_detalle.extend(det)
            except Exception as ex:
                total_detalle.append(f"ERROR directorio {directorio_mes}: {str(ex)[:200]}")
    else:
        # ── MODO NORMAL ───────────────────────────────────────────────────────
        directorio = _resolver_directorio(str(rule.directorio or "/"))
        try:
            d, e, det = _descargar_directorio(
                config=config,
                directorio=directorio,
                patron=patron,
                ya_descargados=ya_descargados,
                directorio_local=directorio_local,
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                rule_id=rule_id,
            )
            total_descargados += d
            total_errores += e
            total_detalle.extend(det)
        except Exception as ex:
            total_detalle.append(f"ERROR directorio {directorio}: {str(ex)[:200]}")

    if not total_detalle:
        total_detalle = ["Sin ficheros nuevos"]

    _actualizar_tiempos_regla(db, rule)
    return total_descargados, total_errores, total_detalle


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
    fecha_ftp: Optional[str] = None,
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
        fecha_ftp=fecha_ftp,
    )
    db.add(entry)
    db.commit()


def count_logs(
    db: Session, *,
    tenant_id: int,
    origen: Optional[str] = None,
) -> int:
    """Devuelve el total real de registros en BD sin límite."""
    q = db.query(FtpSyncLog).filter(FtpSyncLog.tenant_id == tenant_id)
    if origen:
        q = q.filter(FtpSyncLog.origen == origen)
    return q.count()


def list_logs(
    db: Session, *,
    tenant_id: int,
    origen: Optional[str] = None,
    limit: int = 500,
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
            "fecha_ftp": r.fecha_ftp,
            "created_at": r.created_at,
        })
    return result


# ── Borrado de logs ───────────────────────────────────────────────────────────

def delete_log_by_id(db: Session, *, log_id: int, tenant_id: int) -> None:
    obj = db.query(FtpSyncLog).filter(
        FtpSyncLog.id == log_id,
        FtpSyncLog.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"Log id={log_id} no encontrado")
    db.delete(obj)
    db.commit()


def delete_logs(
    db: Session, *,
    tenant_id: int,
    origen: Optional[str] = None,
    dias: Optional[int] = None,
) -> int:
    q = db.query(FtpSyncLog).filter(FtpSyncLog.tenant_id == tenant_id)
    if origen:
        q = q.filter(FtpSyncLog.origen == origen)
    if dias is not None:
        desde = datetime.utcnow() - timedelta(days=dias)
        q = q.filter(FtpSyncLog.created_at < desde)
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return count


# ── Dashboard ─────────────────────────────────────────────────────────────────

def get_dashboard(db: Session, *, tenant_id: int) -> dict:
    hoy_inicio = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    configs = db.query(FtpConfig).filter(FtpConfig.tenant_id == tenant_id).all()
    rules   = db.query(FtpSyncRule).filter(FtpSyncRule.tenant_id == tenant_id).all()

    logs_hoy = db.query(FtpSyncLog).filter(
        FtpSyncLog.tenant_id == tenant_id,
        FtpSyncLog.created_at >= hoy_inicio,
    ).all()

    semana_inicio = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    semana_inicio = semana_inicio - timedelta(days=semana_inicio.weekday())
    logs_semana = db.query(FtpSyncLog).filter(
        FtpSyncLog.tenant_id == tenant_id,
        FtpSyncLog.created_at >= semana_inicio,
    ).all()

    ultimo_ok_global = (
        db.query(FtpSyncLog)
        .filter(FtpSyncLog.tenant_id == tenant_id, FtpSyncLog.estado == "ok")
        .order_by(FtpSyncLog.created_at.desc())
        .first()
    )

    auto_hoy    = sum(1 for log in logs_hoy if log.estado == "ok" and log.origen == "auto")
    manual_hoy  = sum(1 for log in logs_hoy if log.estado == "ok" and log.origen == "manual")
    errores_hoy = sum(1 for log in logs_hoy if log.estado == "error")

    auto_semana    = sum(1 for log in logs_semana if log.estado == "ok" and log.origen == "auto")
    manual_semana  = sum(1 for log in logs_semana if log.estado == "ok" and log.origen == "manual")
    errores_semana = sum(1 for log in logs_semana if log.estado == "error")

    proximas = [r.proxima_ejecucion for r in rules if r.activo and r.proxima_ejecucion]
    proxima_sync_global = min(proximas, default=None)

    conexiones = []
    for c in configs:
        logs_config_hoy = [log for log in logs_hoy if log.config_id == c.id]
        reglas_config   = [r for r in rules if r.config_id == c.id and r.activo]

        proxima_sync_config = min(
            (r.proxima_ejecucion for r in reglas_config if r.proxima_ejecucion),
            default=None,
        )
        ultima_ejec_config = max(
            (r.ultima_ejecucion for r in reglas_config if r.ultima_ejecucion),
            default=None,
        )

        ultimo_ok_config = (
            db.query(FtpSyncLog)
            .filter(FtpSyncLog.config_id == c.id, FtpSyncLog.estado == "ok")
            .order_by(FtpSyncLog.created_at.desc())
            .first()
        )

        ultimo_error_config = (
            db.query(FtpSyncLog)
            .filter(FtpSyncLog.config_id == c.id, FtpSyncLog.estado == "error")
            .order_by(FtpSyncLog.created_at.desc())
            .first()
        )

        conexiones.append({
            "id":               c.id,
            "nombre":           c.nombre,
            "empresa_id":       c.empresa_id,
            "empresa_nombre":   _nombre_empresa(db, int(c.empresa_id)),
            "host":             c.host,
            "puerto":           c.puerto,
            "usar_tls":         c.usar_tls,
            "activo":           c.activo,
            "reglas_activas":   len(reglas_config),
            "sync_auto":        len(reglas_config) > 0,
            "auto_hoy":         sum(1 for log in logs_config_hoy if log.estado == "ok" and log.origen == "auto"),
            "manual_hoy":       sum(1 for log in logs_config_hoy if log.estado == "ok" and log.origen == "manual"),
            "errores_hoy":      sum(1 for log in logs_config_hoy if log.estado == "error"),
            "ultimo_ok":        ultimo_ok_config.created_at if ultimo_ok_config else None,
            "ultimo_fichero":   ultimo_ok_config.nombre_fichero if ultimo_ok_config else None,
            "proxima_sync":     proxima_sync_config,
            "ultima_ejecucion": ultima_ejec_config,
            "ultimo_error":         ultimo_error_config.created_at if ultimo_error_config else None,
            "ultimo_error_msg":     ultimo_error_config.mensaje_error if ultimo_error_config else None,
            "ultimo_error_fichero": ultimo_error_config.nombre_fichero if ultimo_error_config else None,
        })

    return {
        "scheduler_activo":      True,
        "conexiones_activas":    sum(1 for c in configs if c.activo),
        "reglas_activas":        sum(1 for r in rules if r.activo),
        "auto_hoy":              auto_hoy,
        "manual_hoy":            manual_hoy,
        "errores_hoy":           errores_hoy,
        "auto_semana":           auto_semana,
        "manual_semana":         manual_semana,
        "errores_semana":        errores_semana,
        "total_descargados_hoy": auto_hoy + manual_hoy,
        "total_errores_hoy":     errores_hoy,
        "ultima_descarga":       ultimo_ok_global.created_at if ultimo_ok_global else None,
        "ultimo_fichero":        ultimo_ok_global.nombre_fichero if ultimo_ok_global else None,
        "proxima_sync_global":   proxima_sync_global,
        "conexiones":            conexiones,
    }
