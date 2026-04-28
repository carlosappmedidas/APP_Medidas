# app/measures/descarga/services.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false

"""
Servicio de búsqueda y ejecución de descargas SFTP de publicaciones REE (BALD).

API pública:
    buscar_ftp(...)          → lista filas con estado nuevo/importado/actualizable/obsoleta
    descargar_e_importar(...)→ descarga + importa items seleccionados

NO duplica lógica de parsing M1/BALD: cada item se entrega a
`process_ingestion_file()` de app/ingestion/services.py, exactamente igual
que la subida manual desde "Carga de datos".
"""

from __future__ import annotations

import bz2
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, cast

from sqlalchemy.orm import Session

from app.comunicaciones.models import FtpConfig
from app.empresas.models import Empresa
from app.ingestion.models import IngestionFile
from app.ingestion.services import process_ingestion_file
from app.ingestion.utils import find_existing_ingestion_file, safe_unlink
from app.measures.descarga.parser import (
    PublicacionFilename,
    parse_publicacion_filename,
)


# ── Constantes ────────────────────────────────────────────────────────────────

_TIPOS_PUBLICACION = ("BALD",)

# Misma raíz que usa la subida manual (app/ingestion/router.py · UPLOAD_BASE_PATH).
# Si en el futuro se mueve a settings, sincronizar ambos lados.
_UPLOAD_BASE_PATH = Path("data/ingestion")

# Empresas exploradas en paralelo (mismo número que objeciones).
_MAX_WORKERS = 4

# Auto-filtro por defecto cuando no hay filtros: últimos 20 días.
_DIAS_AUTO_FILTRO = 20


# ── Scope de empresas del usuario ─────────────────────────────────────────────

def _empresas_accesibles(db: Session, *, tenant_id: int, current_user) -> List[Empresa]:
    q = db.query(Empresa).filter(Empresa.tenant_id == tenant_id)
    if not bool(getattr(current_user, "is_superuser", False)):
        permitidas = getattr(current_user, "empresa_ids_permitidas", []) or []
        if permitidas:
            q = q.filter(Empresa.id.in_(permitidas))
    return q.order_by(Empresa.id.asc()).all()


# ── Periodos (filtros) ────────────────────────────────────────────────────────

def _resolver_meses(periodo: Optional[str]) -> List[str]:
    """
    Si periodo viene → ['YYYYMM']. Si no → [] (no filtra por mes).
    """
    if periodo:
        return [periodo.replace("-", "")]
    return []


def _mes_actual_yyyymm() -> str:
    hoy = date.today()
    return f"{hoy.year:04d}{hoy.month:02d}"


def _mes_anterior_yyyymm() -> str:
    hoy = date.today()
    year, month = hoy.year, hoy.month
    month -= 1
    if month == 0:
        month = 12
        year -= 1
    return f"{year:04d}{month:02d}"


def _resolver_carpeta(carpeta: str, mes_yyyymm: str) -> str:
    if "{mes_actual}" in carpeta:
        carpeta = carpeta.replace("{mes_actual}", mes_yyyymm)
    if "{mes_anterior}" in carpeta:
        carpeta = carpeta.replace("{mes_anterior}", _mes_anterior_yyyymm())
    return carpeta


def _carpeta_es_dinamica(carpeta: str) -> bool:
    return "{mes_actual}" in carpeta


# ── Cálculo de fecha_desde inteligente basado en calendario REE ───────────────

def _calcular_fecha_desde_calendario_ree(db: Session, *, tenant_id: int) -> Optional[str]:
    """
    Calcula la fecha mínima a partir de la cual buscar publicaciones REE,
    basándose en las fechas oficiales de publicación del calendario REE
    para el mes en curso + mes anterior.

    Devuelve la fecha más antigua de las 4 fechas REE (M2/M7/M11/ART15) de
    los 2 meses en formato 'YYYY-MM-DD', o None si no hay calendario cargado
    para el tenant — en cuyo caso el caller cae al filtro genérico de 20 días.

    Cubrir mes en curso + mes anterior evita perder ficheros publicados en
    las últimas semanas que correspondían al ciclo del mes pasado.
    """
    from app.calendario_ree.models import ReeCalendarEvent

    hoy = date.today()
    target_anio = hoy.year

    # Mes en curso y mes anterior.
    mes_actual = hoy.month
    if mes_actual == 1:
        mes_anterior_anio = hoy.year - 1
        mes_anterior_mes  = 12
    else:
        mes_anterior_anio = hoy.year
        mes_anterior_mes  = hoy.month - 1

    # Si el mes anterior está en otro año, hacemos 2 consultas; si no, 1 sola
    # con anio = hoy.year y filtramos por mes (mes_anterior, mes_actual).
    fechas_relevantes: List[date] = []

    if mes_anterior_anio == target_anio:
        # Misma consulta — un solo año, dos meses
        rows = (
            db.query(ReeCalendarEvent.fecha)
            .filter(
                ReeCalendarEvent.tenant_id == tenant_id,
                ReeCalendarEvent.anio == target_anio,
            )
            .all()
        )
        for (fecha_evt,) in rows:
            if fecha_evt is None:
                continue
            f = cast(date, fecha_evt)
            if (f.year == hoy.year and f.month == mes_actual) \
               or (f.year == mes_anterior_anio and f.month == mes_anterior_mes):
                fechas_relevantes.append(f)
    else:
        # Cruce de año (enero → diciembre del año anterior).
        rows_actual = (
            db.query(ReeCalendarEvent.fecha)
            .filter(
                ReeCalendarEvent.tenant_id == tenant_id,
                ReeCalendarEvent.anio == target_anio,
            )
            .all()
        )
        for (fecha_evt,) in rows_actual:
            if fecha_evt is None:
                continue
            f = cast(date, fecha_evt)
            if f.year == hoy.year and f.month == mes_actual:
                fechas_relevantes.append(f)

        rows_anterior = (
            db.query(ReeCalendarEvent.fecha)
            .filter(
                ReeCalendarEvent.tenant_id == tenant_id,
                ReeCalendarEvent.anio == mes_anterior_anio,
            )
            .all()
        )
        for (fecha_evt,) in rows_anterior:
            if fecha_evt is None:
                continue
            f = cast(date, fecha_evt)
            if f.year == mes_anterior_anio and f.month == mes_anterior_mes:
                fechas_relevantes.append(f)

    if not fechas_relevantes:
        return None

    fecha_min = min(fechas_relevantes)
    return fecha_min.isoformat()


# ── Listado SFTP ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class _FtpEntry:
    nombre: str
    size:   int
    fecha:  Optional[datetime]


def _parse_fecha_sort(fecha_sort: Optional[str]) -> Optional[datetime]:
    if not fecha_sort or len(fecha_sort) != 12 or not fecha_sort.isdigit():
        return None
    try:
        return datetime(
            year   = int(fecha_sort[0:4]),
            month  = int(fecha_sort[4:6]),
            day    = int(fecha_sort[6:8]),
            hour   = int(fecha_sort[8:10]),
            minute = int(fecha_sort[10:12]),
        )
    except (ValueError, TypeError):
        return None


def _parse_fecha_dia(fecha: Optional[str], *, fin_de_dia: bool) -> Optional[datetime]:
    if not fecha:
        return None
    fecha = fecha.strip()
    if not fecha:
        return None
    try:
        y, m, d = fecha.split("-")
        year, month, day = int(y), int(m), int(d)
        if fin_de_dia:
            return datetime(year, month, day, 23, 59, 59, 999999)
        return datetime(year, month, day, 0, 0, 0, 0)
    except (ValueError, TypeError):
        return None


def _listar_path(config: FtpConfig, path: str) -> List[_FtpEntry]:
    from app.comunicaciones.services import _conectar_en_path, _parse_list_line

    ftp = _conectar_en_path(config, path)
    entries: List[_FtpEntry] = []
    try:
        lines: List[str] = []
        ftp.retrlines("LIST", lines.append)
        for line in lines:
            parsed = _parse_list_line(line)
            if parsed is None:
                continue
            if parsed.get("tipo") != "file":
                continue
            entries.append(_FtpEntry(
                nombre=parsed["nombre"],
                size=int(parsed.get("tamanio") or 0),
                fecha=_parse_fecha_sort(parsed.get("fecha_sort")),
            ))
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    return entries


# ── Hits SFTP ─────────────────────────────────────────────────────────────────

@dataclass
class _SftpHit:
    empresa_id:     int
    empresa_nombre: str
    config_id:      int
    ruta_sftp:      str
    parsed:         PublicacionFilename
    tamanio:        int
    fecha_sftp:     Optional[datetime]


def _explorar_empresa(
    empresa: Empresa,
    config: FtpConfig,
    meses: List[str],
    nombre_filtro: Optional[str],
) -> List[_SftpHit]:
    carpeta = getattr(config, "carpeta_publicaciones", None)
    if not carpeta or not str(carpeta).strip():
        return []

    codigo_ree = (getattr(empresa, "codigo_ree", None) or "").strip() or None
    if codigo_ree is None:
        return []

    if _carpeta_es_dinamica(carpeta):
        rutas_a_explorar = [(mes, _resolver_carpeta(carpeta, mes)) for mes in meses]
    else:
        rutas_a_explorar = [(None, _resolver_carpeta(carpeta, _mes_actual_yyyymm()))]

    meses_set = set(meses)
    nombre_filtro_lower = (nombre_filtro or "").lower().strip() or None
    nombre_empresa = getattr(empresa, "nombre", None) or f"Empresa {empresa.id}"

    hits: List[_SftpHit] = []

    for mes_contexto, ruta in rutas_a_explorar:
        try:
            entries = _listar_path(config, ruta)
        except Exception:
            continue

        for entry in entries:
            parsed = parse_publicacion_filename(entry.nombre)
            if parsed is None:
                continue
            if parsed.tipo not in _TIPOS_PUBLICACION:
                continue
            if parsed.dddd != codigo_ree:
                continue

            # Filtro por mes (solo aplica si carpeta es fija y el usuario indicó periodo).
            if mes_contexto is None and meses_set:
                if parsed.aaaamm not in meses_set:
                    continue

            if nombre_filtro_lower and nombre_filtro_lower not in entry.nombre.lower():
                continue

            hits.append(_SftpHit(
                empresa_id     = int(empresa.id),
                empresa_nombre = nombre_empresa,
                config_id      = int(config.id),
                ruta_sftp      = ruta,
                parsed         = parsed,
                tamanio        = entry.size,
                fecha_sftp     = entry.fecha,
            ))

    return hits


def _primera_config_activa(db: Session, *, tenant_id: int, empresa_id: int) -> Optional[FtpConfig]:
    q = db.query(FtpConfig).filter(
        FtpConfig.tenant_id == tenant_id,
        FtpConfig.activo == True,  # noqa: E712
    )
    if hasattr(FtpConfig, "empresa_id"):
        q = q.filter(FtpConfig.empresa_id == empresa_id)
    return q.order_by(FtpConfig.id.asc()).first()


# ── Versiones importadas en BD (IngestionFile · tipo=BALD) ────────────────────

def _versiones_en_bd(
    db: Session,
    *,
    tenant_id: int,
    empresa_ids: List[int],
) -> Dict[Tuple[int, str], int]:
    """
    Devuelve {(empresa_id, clave_base): version_max_importada} consultando IngestionFile.

    Cruza por nombre exacto: el filename guardado por la subida manual y el
    nombre_sin_bz2 producido por la descarga SFTP son idénticos
    (ej. 'BALD_0148_202509_20260423.0').
    """
    if not empresa_ids:
        return {}

    rows = db.query(
        IngestionFile.empresa_id,
        IngestionFile.filename,
    ).filter(
        IngestionFile.tenant_id == tenant_id,
        IngestionFile.empresa_id.in_(empresa_ids),
        IngestionFile.tipo == "BALD",
        IngestionFile.filename.isnot(None),
        IngestionFile.status == IngestionFile.STATUS_OK,
    ).distinct().all()

    resultado: Dict[Tuple[int, str], int] = {}
    for empresa_id, nombre in rows:
        parsed = parse_publicacion_filename(nombre or "")
        if parsed is None:
            continue
        key = (int(empresa_id), parsed.clave_base)
        prev = resultado.get(key)
        if prev is None or parsed.version > prev:
            resultado[key] = parsed.version

    return resultado


# ── Cálculo de estado ─────────────────────────────────────────────────────────

def _calcular_estado(
    version_sftp: int,
    version_max_sftp_para_clave: int,
    version_en_bd: Optional[int],
) -> str:
    if version_sftp != version_max_sftp_para_clave:
        return "obsoleta"
    if version_en_bd is None:
        return "nuevo"
    if version_sftp > version_en_bd:
        return "actualizable"
    return "importado"


# ── API PÚBLICA — buscar ──────────────────────────────────────────────────────

def buscar_ftp(
    db: Session,
    *,
    tenant_id: int,
    current_user,
    empresa_ids: Optional[List[int]] = None,
    periodo: Optional[str] = None,
    nombre_filtro: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> List[dict]:
    """
    Busca ficheros BALD publicados por REE en el SFTP de las empresas del tenant.
    """
    empresas_accesibles = _empresas_accesibles(db, tenant_id=tenant_id, current_user=current_user)

    if empresa_ids:
        ids_set = set(int(x) for x in empresa_ids)
        empresas_a_buscar = [e for e in empresas_accesibles if int(e.id) in ids_set]
    else:
        empresas_a_buscar = empresas_accesibles

    if not empresas_a_buscar:
        return []

    meses = _resolver_meses(periodo)

    tareas: List[Tuple[Empresa, FtpConfig]] = []
    for emp in empresas_a_buscar:
        config = _primera_config_activa(db, tenant_id=tenant_id, empresa_id=int(emp.id))
        if config is None:
            continue
        if not (getattr(config, "carpeta_publicaciones", None) or "").strip():
            continue
        tareas.append((emp, config))

    if not tareas:
        return []

    hits: List[_SftpHit] = []
    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = [pool.submit(_explorar_empresa, emp, cfg, meses, nombre_filtro) for emp, cfg in tareas]
        for f in futures:
            try:
                hits.extend(f.result())
            except Exception:
                continue

    if not hits:
        return []

    # Auto-filtro inteligente basado en calendario REE:
    # si no hay filtros explícitos, usar la fecha más antigua de los hitos
    # del mes en curso + mes anterior. Si no hay calendario cargado, fallback
    # a 20 días.
    if periodo is None and fecha_desde is None and fecha_hasta is None:
        fecha_desde_calendario = _calcular_fecha_desde_calendario_ree(db, tenant_id=tenant_id)
        if fecha_desde_calendario is not None:
            fecha_desde = fecha_desde_calendario
        else:
            fecha_desde = (date.today() - timedelta(days=_DIAS_AUTO_FILTRO)).isoformat()

    dt_desde = _parse_fecha_dia(fecha_desde, fin_de_dia=False)
    dt_hasta = _parse_fecha_dia(fecha_hasta, fin_de_dia=True)
    if dt_desde is not None or dt_hasta is not None:
        filtrados: List[_SftpHit] = []
        for h in hits:
            if h.fecha_sftp is None:
                continue
            if dt_desde is not None and h.fecha_sftp < dt_desde:
                continue
            if dt_hasta is not None and h.fecha_sftp > dt_hasta:
                continue
            filtrados.append(h)
        hits = filtrados
        if not hits:
            return []

    # Versión máxima en SFTP por (empresa, clave_base).
    version_max_sftp: Dict[Tuple[int, str], int] = {}
    for h in hits:
        key = (h.empresa_id, h.parsed.clave_base)
        prev = version_max_sftp.get(key)
        if prev is None or h.parsed.version > prev:
            version_max_sftp[key] = h.parsed.version

    empresas_con_hits = list({h.empresa_id for h in hits})
    versiones_bd = _versiones_en_bd(db, tenant_id=tenant_id, empresa_ids=empresas_con_hits)

    out: List[dict] = []
    for h in hits:
        key = (h.empresa_id, h.parsed.clave_base)
        ver_max_sftp = version_max_sftp[key]
        ver_bd       = versiones_bd.get(key)

        estado = _calcular_estado(
            version_sftp                = h.parsed.version,
            version_max_sftp_para_clave = ver_max_sftp,
            version_en_bd               = ver_bd,
        )

        out.append({
            "empresa_id":        h.empresa_id,
            "empresa_nombre":    h.empresa_nombre,
            "config_id":         h.config_id,
            "ruta_sftp":         h.ruta_sftp,
            "nombre":            h.parsed.nombre,
            "clave_base":        h.parsed.clave_base,
            "tipo":              h.parsed.tipo,
            "periodo":           h.parsed.aaaamm,
            "version":           h.parsed.version,
            "tamanio":           h.tamanio,
            "fecha_sftp":        h.fecha_sftp.isoformat() if h.fecha_sftp else None,
            "estado":            estado,
            "version_importada": ver_bd,
        })

    out.sort(key=_sort_key_resultado)
    return out


def _sort_key_resultado(r: dict) -> Tuple[int, float, str, int]:
    fecha_iso = r.get("fecha_sftp")
    if fecha_iso:
        try:
            ts = datetime.fromisoformat(fecha_iso).timestamp()
        except (ValueError, TypeError):
            ts = 0.0
        sin_fecha = 0
    else:
        ts = 0.0
        sin_fecha = 1
    return (
        sin_fecha,
        -ts,
        r.get("clave_base") or "",
        -int(r.get("version") or 0),
    )


# ══════════════════════════════════════════════════════════════════════════════
# EJECUCIÓN — descargar e importar
# ══════════════════════════════════════════════════════════════════════════════

def _periodo_yyyymm_a_anio_mes(yyyymm: str) -> Tuple[int, int]:
    return int(yyyymm[:4]), int(yyyymm[4:])


def _path_destino_local(*, tenant_id: int, empresa_id: int, anio: int, mes: int, nombre_sin_bz2: str) -> Path:
    """
    Misma estructura que la carga manual:
      data/ingestion/tenant_X/empresa_Y/BALD/YYYYMM/<filename>
    """
    return (
        _UPLOAD_BASE_PATH
        / f"tenant_{tenant_id}"
        / f"empresa_{empresa_id}"
        / "BALD"
        / f"{anio}{mes:02d}"
        / nombre_sin_bz2
    )


def _procesar_item(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    config_id: int,
    ruta_sftp: str,
    nombre: str,
    replace: bool,
    uploaded_by: int,
) -> dict:
    """
    Procesa UN item: descarga del SFTP + importa a BD.

    Reglas:
      ⚪ Nuevo                       → importar
      🟠 Actualizable + replace=True → reemplazar IngestionFile + reimportar
      🟠 Actualizable + replace=False→ ERROR
      Igual o inferior ya en BD      → ERROR
    """
    from app.comunicaciones.services import (
        _get_config_by_id_activa,
        _log,
        leer_fichero_ftp,
    )

    parsed = parse_publicacion_filename(nombre)
    if parsed is None:
        msg = "Nombre de fichero no reconocido como publicación REE válida."
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
             estado="error", mensaje_error=msg, modulo="publicaciones")
        return {"nombre": nombre, "resultado": "error", "mensaje": msg}

    if parsed.tipo not in _TIPOS_PUBLICACION:
        msg = f"Tipo '{parsed.tipo}' no soportado todavía."
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
             estado="error", mensaje_error=msg, modulo="publicaciones")
        return {"nombre": nombre, "resultado": "error", "mensaje": msg}

    anio, mes = _periodo_yyyymm_a_anio_mes(parsed.aaaamm)

    # 1) Validar estado en BD (versión existente para esta clave_base).
    existing = find_existing_ingestion_file(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo="BALD",
        anio=anio,
        mes=mes,
        filename=parsed.nombre_sin_bz2,
    )

    version_bd: Optional[int] = None
    if existing is not None:
        ex_filename = cast(str, getattr(existing, "filename", "") or "")
        parsed_ex = parse_publicacion_filename(ex_filename)
        if parsed_ex is not None and parsed_ex.clave_base == parsed.clave_base:
            version_bd = parsed_ex.version

    if version_bd is not None:
        if parsed.version < version_bd:
            msg = f"Existe versión .{version_bd} más nueva en BD — esta (.{parsed.version}) es obsoleta."
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
                 estado="error", mensaje_error=msg, modulo="publicaciones")
            return {"nombre": nombre, "resultado": "error", "mensaje": msg}
        if parsed.version == version_bd:
            msg = f"Versión .{parsed.version} ya está importada."
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
                 estado="error", mensaje_error=msg, modulo="publicaciones")
            return {"nombre": nombre, "resultado": "error", "mensaje": msg}
        if not replace:
            msg = f"Existe versión .{version_bd} importada. Confirma reemplazo para sustituirla."
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
                 estado="error", mensaje_error=msg, modulo="publicaciones")
            return {"nombre": nombre, "resultado": "error", "mensaje": msg}
        es_reemplazo = True
    else:
        es_reemplazo = False

    # 2) Validar config FTP.
    try:
        _get_config_by_id_activa(db, config_id=config_id, tenant_id=tenant_id)
    except ValueError as e:
        msg = str(e)
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
             estado="error", mensaje_error=msg, modulo="publicaciones")
        return {"nombre": nombre, "resultado": "error", "mensaje": msg}

    # 3) Descargar del SFTP.
    try:
        contenido_bruto = leer_fichero_ftp(
            db,
            config_id=config_id,
            tenant_id=tenant_id,
            path=ruta_sftp,
            fichero=parsed.nombre,
            registrar=False,
        )
    except Exception as e:
        msg = f"Error descargando del SFTP: {str(e)[:200]}"
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2, tamanio=None,
             estado="error", mensaje_error=msg, modulo="publicaciones")
        return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}

    tamanio_original = len(contenido_bruto)

    # 4) Descomprimir bz2 si procede.
    if parsed.es_bz2:
        try:
            contenido = bz2.decompress(contenido_bruto)
        except Exception as e:
            msg = f"Error descomprimiendo bz2: {str(e)[:200]}"
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
                 tamanio=tamanio_original,
                 estado="error", mensaje_error=msg, modulo="publicaciones")
            return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}
    else:
        contenido = contenido_bruto

    # 5) Guardar a fichero local en la misma estructura que la subida manual.
    dest_path = _path_destino_local(
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        anio=anio,
        mes=mes,
        nombre_sin_bz2=parsed.nombre_sin_bz2,
    )
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with dest_path.open("wb") as fh:
            fh.write(contenido)
    except Exception as e:
        msg = f"Error guardando fichero local: {str(e)[:200]}"
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
             tamanio=tamanio_original,
             estado="error", mensaje_error=msg, modulo="publicaciones")
        return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}

    storage_key = str(dest_path)

    # 6) Crear o reemplazar IngestionFile (mismo flujo que la subida manual).
    if existing is not None:
        ex = cast(Any, existing)
        old_storage_key = cast(str, getattr(existing, "storage_key", None) or "")
        ex.filename      = parsed.nombre_sin_bz2
        ex.storage_key   = storage_key
        ex.tipo          = "BALD"
        ex.anio          = anio
        ex.mes           = mes
        ex.status        = IngestionFile.STATUS_PENDING
        ex.rows_ok       = 0
        ex.rows_error    = 0
        ex.error_message = None
        ex.processed_at  = None
        ex.updated_at    = datetime.utcnow()
        ex.warnings_json = None
        db.commit()
        db.refresh(existing)
        if old_storage_key and old_storage_key != storage_key:
            safe_unlink(old_storage_key)
        ingestion = existing
    else:
        ingestion_data: Dict[str, Any] = {
            "tenant_id":     tenant_id,
            "empresa_id":    empresa_id,
            "tipo":          "BALD",
            "anio":          anio,
            "mes":           mes,
            "filename":      parsed.nombre_sin_bz2,
            "storage_key":   storage_key,
            "status":        IngestionFile.STATUS_PENDING,
            "uploaded_by":   uploaded_by,
            "warnings_json": None,
        }
        ingestion = IngestionFile(**ingestion_data)  # type: ignore[arg-type]
        db.add(ingestion)
        db.commit()
        db.refresh(ingestion)

    # 7) Procesar (mismo dispatcher que la subida manual).
    try:
        process_ingestion_file(db=db, ingestion=ingestion, tenant_id=tenant_id)
    except Exception as e:
        msg = f"Error procesando: {str(e)[:200]}"
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
             tamanio=tamanio_original,
             estado="error", mensaje_error=msg, modulo="publicaciones")
        return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}

    # Re-leer el ingestion para conocer su estado final.
    refreshed = (
        db.query(IngestionFile)
        .filter(IngestionFile.id == ingestion.id, IngestionFile.tenant_id == tenant_id)
        .first()
    )
    final_status = cast(str, getattr(refreshed, "status", "")) if refreshed else ""
    if final_status != IngestionFile.STATUS_OK:
        err_msg = cast(str, getattr(refreshed, "error_message", "") or "Error en procesado.")
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
             tamanio=tamanio_original,
             estado="error", mensaje_error=err_msg, modulo="publicaciones")
        return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": err_msg}

    # 8) Log OK + respuesta.
    if es_reemplazo:
        resultado = "reemplazado"
        mensaje = f"Reemplazada versión .{version_bd} por .{parsed.version}."
    else:
        resultado = "ok"
        mensaje = f"Importado correctamente (versión .{parsed.version})."

    _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
         rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
         tamanio=tamanio_original,
         estado="ok", modulo="publicaciones")

    return {"nombre": parsed.nombre_sin_bz2, "resultado": resultado, "mensaje": mensaje}


def descargar_e_importar(
    db: Session,
    *,
    tenant_id: int,
    current_user: Any,
    items: List[dict],
    replace: bool,
) -> dict:
    """
    Recibe una lista de items y los procesa uno a uno aplicando las reglas.
    """
    empresas_accesibles_ids = {
        int(e.id)
        for e in _empresas_accesibles(db, tenant_id=tenant_id, current_user=current_user)
    }

    uploaded_by = int(getattr(current_user, "id", 0) or 0)

    importados   = 0
    reemplazados = 0
    errores      = 0
    detalle: List[dict] = []

    for item in items:
        empresa_id = int(item.get("empresa_id") or 0)
        config_id  = int(item.get("config_id") or 0)
        ruta_sftp  = str(item.get("ruta_sftp") or "").strip()
        nombre     = str(item.get("nombre") or "").strip()

        if not (empresa_id and config_id and ruta_sftp and nombre):
            errores += 1
            detalle.append({
                "nombre": nombre or "(sin nombre)",
                "resultado": "error",
                "mensaje": "Item incompleto: faltan empresa_id, config_id, ruta_sftp o nombre.",
            })
            continue

        if empresa_id not in empresas_accesibles_ids:
            errores += 1
            detalle.append({
                "nombre": nombre,
                "resultado": "error",
                "mensaje": "Sin permiso sobre la empresa indicada.",
            })
            continue

        res = _procesar_item(
            db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            config_id=config_id,
            ruta_sftp=ruta_sftp,
            nombre=nombre,
            replace=replace,
            uploaded_by=uploaded_by,
        )
        detalle.append(res)

        if res["resultado"] == "ok":
            importados += 1
        elif res["resultado"] == "reemplazado":
            reemplazados += 1
        else:
            errores += 1

    return {
        "importados":   importados,
        "reemplazados": reemplazados,
        "errores":      errores,
        "detalle":      detalle,
    }