# app/objeciones/descarga/services.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false

"""
Servicio de búsqueda de ficheros AOB en el SFTP.

Función pública principal:
    buscar_ftp(db, *, tenant_id, current_user, empresa_ids, periodo, nombre_filtro)

Devuelve una lista de dicts (una fila por versión de cada fichero AOB) con
el estado calculado:
    - "nuevo"        → ⚪ versión más alta del SFTP, nada importado en BD
    - "importado"    → 🟢 versión más alta YA en BD
    - "actualizable" → 🟠 versión más alta del SFTP > versión importada
    - "obsoleta"     → ⚫ no es la versión más alta del SFTP

NO descarga ficheros, NO escribe en BD, NO escribe en FtpSyncLog (eso es FASE 4).
"""

from __future__ import annotations

import bz2
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.comunicaciones.models import FtpConfig
from app.empresas.models import Empresa
from app.objeciones.descarga.parser import AobFilename, parse_aob_filename
from app.objeciones.models import (
    ObjecionAGRECL,
    ObjecionCIL,
    ObjecionCUPS,
    ObjecionINCL,
)
from app.objeciones.services import (
    delete_agrecl_fichero,
    delete_cil_fichero,
    delete_cups_fichero,
    delete_incl_fichero,
    import_agrecl,
    import_cil,
    import_cups,
    import_incl,
)


# ── Constantes ────────────────────────────────────────────────────────────────

# Tipos AOB aceptados en la búsqueda.
_TIPOS_AOB = ("OBJEINCL", "AOBAGRECL", "AOBCUPS", "AOBCIL")

# Modelo SQLAlchemy por cada tipo — para saber dónde mirar versiones en BD.
_TIPO_MODELO = {
    "OBJEINCL":  ObjecionINCL,
    "AOBAGRECL": ObjecionAGRECL,
    "AOBCUPS":   ObjecionCUPS,
    "AOBCIL":    ObjecionCIL,
}

# Número máximo de empresas que se exploran en paralelo (spec V8 · punto 12).
_MAX_WORKERS = 4

# Número de meses hacia atrás cuando no se indica periodo (spec V8 · punto 9).
_MESES_DEFAULT = 6


# ── Scope de empresas del usuario (patrón canónico del proyecto) ──────────────
#
# Replica el patrón de app/empresas/routes.py → _aplicar_scope_empresas(),
# pero devolviendo la lista de IDs directamente para poder paralelizar después.

def _empresas_accesibles(db: Session, *, tenant_id: int, current_user) -> List[Empresa]:
    """
    Devuelve las empresas que el usuario puede ver.
      - Superuser → todas las empresas del tenant.
      - Usuario normal con empresa_ids_permitidas no vacío → solo esas.
      - Usuario normal con empresa_ids_permitidas vacío → todas las del tenant.

    El filtro por tenant se aplica siempre (salvo para superuser, que tampoco
    tiene por qué cruzar tenants — aquí mantenemos el tenant_id recibido).
    """
    q = db.query(Empresa).filter(Empresa.tenant_id == tenant_id)

    if not bool(getattr(current_user, "is_superuser", False)):
        permitidas = getattr(current_user, "empresa_ids_permitidas", []) or []
        if permitidas:
            q = q.filter(Empresa.id.in_(permitidas))

    # Orden estable para que los resultados sean determinísticos.
    return q.order_by(Empresa.id.asc()).all()


# ── Periodos (spec V8 · puntos 6, 9, 11) ──────────────────────────────────────

def _resolver_meses(periodo: Optional[str]) -> List[str]:
    """
    Devuelve la lista de meses 'YYYYMM' a considerar.
      - Si `periodo` (formato "YYYY-MM") viene → solo ese mes.
      - Si no viene → últimos _MESES_DEFAULT meses hasta hoy.
    """
    if periodo:
        # "YYYY-MM" → "YYYYMM"
        return [periodo.replace("-", "")]

    hoy = date.today()
    year, month = hoy.year, hoy.month
    meses: List[str] = []
    for _ in range(_MESES_DEFAULT):
        meses.append(f"{year:04d}{month:02d}")
        # retroceder un mes
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    # Orden cronológico ascendente (cosmético).
    return list(reversed(meses))


def _mes_actual_yyyymm() -> str:
    """Formato YYYYMM del mes de hoy."""
    hoy = date.today()
    return f"{hoy.year:04d}{hoy.month:02d}"


def _mes_anterior_yyyymm() -> str:
    """Formato YYYYMM del mes inmediatamente anterior al de hoy."""
    hoy = date.today()
    year, month = hoy.year, hoy.month
    month -= 1
    if month == 0:
        month = 12
        year -= 1
    return f"{year:04d}{month:02d}"


def _resolver_carpeta_aob(carpeta: str, mes_yyyymm: str) -> str:
    """
    Resuelve los placeholders {mes_actual} y {mes_anterior} en la ruta.
    Si la carpeta es fija (sin placeholders), devuelve la ruta tal cual.

    Nota: `mes_yyyymm` se usa solo si la carpeta contiene el placeholder
    `{mes_actual}`. Para `{mes_anterior}` siempre se usa el mes anterior REAL
    a hoy, NO al `mes_yyyymm` del parámetro — esto es así por el spec V8,
    donde el placeholder se refiere siempre al presente.
    """
    if "{mes_actual}" in carpeta:
        carpeta = carpeta.replace("{mes_actual}", mes_yyyymm)
    if "{mes_anterior}" in carpeta:
        carpeta = carpeta.replace("{mes_anterior}", _mes_anterior_yyyymm())
    return carpeta


def _carpeta_es_dinamica(carpeta: str) -> bool:
    """True si la carpeta contiene {mes_actual} — se resuelve por cada mes."""
    return "{mes_actual}" in carpeta


# ── Listado de una carpeta SFTP ───────────────────────────────────────────────

@dataclass(frozen=True)
class _FtpEntry:
    """Entrada de una carpeta SFTP — resultado de _listar_path."""
    nombre: str
    size:   int
    fecha:  Optional[datetime]  # fecha de modificación, None si no disponible


def _parse_fecha_sort(fecha_sort: Optional[str]) -> Optional[datetime]:
    """
    Convierte un string fecha_sort de _parse_list_line ("YYYYMMDDHHMM", 12 dígitos)
    a datetime. Devuelve None si el formato no es válido.
    """
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
    """
    Convierte un string "YYYY-MM-DD" en datetime al principio o final del día.
      - fin_de_dia=False → datetime(Y, M, D, 0, 0, 0, 0)
      - fin_de_dia=True  → datetime(Y, M, D, 23, 59, 59, 999999)
    Devuelve None si el formato no es válido o la cadena está vacía.
    """
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
    """
    Lista una carpeta SFTP reutilizando los helpers de comunicaciones/services.
    Devuelve una lista de _FtpEntry (solo ficheros, no subdirectorios).

    Si la carpeta no existe o hay error de conexión → devuelve [] y registra
    mediante excepción propagada (el caller decide qué hacer).
    """
    # Import local para evitar ciclo entre submódulos.
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
            # _parse_list_line devuelve un dict: {"tipo", "nombre", "tamanio",
            # "fecha" (string formateada), "fecha_sort" (YYYYMMDDHHMM), ...}
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


# ── Exploración SFTP por empresa (se ejecuta en paralelo) ─────────────────────

@dataclass
class _SftpHit:
    """Un fichero AOB encontrado en el SFTP, ya parseado + con metadatos."""
    empresa_id:     int
    empresa_nombre: str
    config_id:      int
    ruta_sftp:      str
    parsed:         AobFilename
    tamanio:        int
    fecha_sftp:     Optional[datetime]


def _explorar_empresa(
    empresa: Empresa,
    config: FtpConfig,
    meses: List[str],
    nombre_filtro: Optional[str],
) -> List[_SftpHit]:
    """
    Lista la carpeta AOB de una empresa y devuelve los hits parseados.
    Filtra por tipo AOB (los 4 reconocidos), por DDDD = codigo_ree (si hay
    codigo_ree en la empresa), y por nombre_filtro (substring case-insens).

    Esta función se ejecuta en un hilo del ThreadPoolExecutor.
    """
    # Si la empresa no tiene carpeta_aob configurada → nada que hacer.
    carpeta = getattr(config, "carpeta_aob", None)
    if not carpeta or not str(carpeta).strip():
        return []

    # Opción B: si la empresa no tiene codigo_ree, no puede recibir AOBs
    # (no es una distribuidora identificable) → excluir de la búsqueda.
    codigo_ree = (getattr(empresa, "codigo_ree", None) or "").strip() or None
    if codigo_ree is None:
        return []

    # Preparar las rutas a explorar (una por cada mes si es dinámica, o
    # una sola si es fija).
    if _carpeta_es_dinamica(carpeta):
        rutas_a_explorar = [(mes, _resolver_carpeta_aob(carpeta, mes)) for mes in meses]
    else:
        # Fija: lista entera una sola vez; filtraremos luego por YYYYMM del nombre.
        rutas_a_explorar = [(None, _resolver_carpeta_aob(carpeta, _mes_actual_yyyymm()))]

    meses_set = set(meses)
    nombre_filtro_lower = (nombre_filtro or "").lower().strip() or None
    nombre_empresa = getattr(empresa, "nombre", None) or f"Empresa {empresa.id}"

    hits: List[_SftpHit] = []

    for mes_contexto, ruta in rutas_a_explorar:
        try:
            entries = _listar_path(config, ruta)
        except Exception:
            # Carpeta no existe o falla de conexión → se ignora silenciosamente
            # para no romper la búsqueda de las otras empresas/meses.
            continue

        for entry in entries:
            parsed = parse_aob_filename(entry.nombre)
            if parsed is None:
                continue
            if parsed.tipo not in _TIPOS_AOB:
                continue

            # Filtro DDDD: la empresa SIEMPRE tiene codigo_ree aquí (Opción B).
            if parsed.dddd != codigo_ree:
                continue



            # Filtro de mes:
            #   - Dinámica: ya estamos listando SOLO la carpeta de ese mes,
            #     no hace falta comprobar. (mes_contexto no se usa aquí, pero
            #     se deja por documentación.)
            #   - Fija: aceptar solo ficheros cuyo YYYYMM esté en el set pedido.
            if mes_contexto is None:
                if parsed.aaaamm not in meses_set:
                    continue

            # Filtro nombre (contains case-insensitive).
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
    """
    Devuelve la primera FtpConfig activa del tenant asociada a la empresa.
    Si la tabla no tiene relación directa con empresa, se interpreta "activa del
    tenant" como fuente de FTPs del tenant — el spec V8 dice 1 conexión por
    empresa (mismo concentrador, distinta carpeta), por lo que aquí filtramos
    por `tenant_id` y `activo=True`, y dejamos el cruce a nivel de carpeta_aob.

    Ajustar si el modelo tiene columna empresa_id en FtpConfig (futuro).
    """
    q = db.query(FtpConfig).filter(
        FtpConfig.tenant_id == tenant_id,
        FtpConfig.activo == True,  # noqa: E712
    )
    # Si FtpConfig tiene campo empresa_id, filtrar por él.
    if hasattr(FtpConfig, "empresa_id"):
        q = q.filter(FtpConfig.empresa_id == empresa_id)
    return q.order_by(FtpConfig.id.asc()).first()


# ── Versiones importadas en BD ────────────────────────────────────────────────

def _versiones_en_bd(
    db: Session,
    *,
    tenant_id: int,
    empresa_ids: List[int],
) -> Dict[Tuple[int, str], int]:
    """
    Devuelve un diccionario {(empresa_id, clave_base): version_max_importada}.

    Itera las 4 tablas de objeciones (una por tipo), recoge todos los
    nombre_fichero distintos, los parsea, y se queda con la versión más alta
    por (empresa_id, clave_base).

    Si un nombre_fichero en BD no matchea el parser (casos edge antiguos),
    se ignora silenciosamente.
    """
    if not empresa_ids:
        return {}

    resultado: Dict[Tuple[int, str], int] = {}

    for modelo in (ObjecionAGRECL, ObjecionINCL, ObjecionCUPS, ObjecionCIL):
        rows = db.query(
            modelo.empresa_id,
            modelo.nombre_fichero,
        ).filter(
            modelo.tenant_id == tenant_id,
            modelo.empresa_id.in_(empresa_ids),
            modelo.nombre_fichero.isnot(None),
        ).distinct().all()

        for empresa_id, nombre in rows:
            parsed = parse_aob_filename(nombre or "")
            if parsed is None:
                continue
            key = (int(empresa_id), parsed.clave_base)
            prev = resultado.get(key)
            if prev is None or parsed.version > prev:
                resultado[key] = parsed.version

    return resultado


# ── Cálculo de estado (spec V8 · punto 21) ────────────────────────────────────

def _calcular_estado(
    version_sftp: int,
    version_max_sftp_para_clave: int,
    version_en_bd: Optional[int],
) -> str:
    """
    Calcula el estado de una fila según el spec V8:
        - "obsoleta"     → no es la versión más alta del SFTP (independiente de BD)
        - "nuevo"        → es la más alta del SFTP, no hay nada en BD
        - "importado"    → es la más alta del SFTP y coincide con BD
        - "actualizable" → es la más alta del SFTP y es > versión en BD
    """
    if version_sftp != version_max_sftp_para_clave:
        return "obsoleta"
    if version_en_bd is None:
        return "nuevo"
    if version_sftp > version_en_bd:
        return "actualizable"
    return "importado"


# ── API PÚBLICA ───────────────────────────────────────────────────────────────

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
    Busca ficheros AOB en el SFTP de las empresas del tenant.

    Parámetros:
        tenant_id:      tenant activo.
        current_user:   usuario que hace la búsqueda (para scope).
        empresa_ids:    lista opcional de empresas a buscar. Si es None o []
                        → se usan TODAS las accesibles al usuario.
        periodo:        "YYYY-MM" para filtrar un mes concreto. Si es None
                        → últimos 6 meses.
        nombre_filtro:  substring case-insensitive sobre el nombre del fichero.
        fecha_desde:    "YYYY-MM-DD" — fecha SFTP mínima (inclusive, 00:00).
        fecha_hasta:    "YYYY-MM-DD" — fecha SFTP máxima (inclusive, 23:59).

    Devuelve una lista de dicts, una fila por versión de fichero AOB, con las
    columnas del spec V8 · punto 23.
    """
    # ── 1) Resolver empresas según permisos + filtro ──────────────────────
    empresas_accesibles = _empresas_accesibles(db, tenant_id=tenant_id, current_user=current_user)

    if empresa_ids:
        ids_set = set(int(x) for x in empresa_ids)
        empresas_a_buscar = [e for e in empresas_accesibles if int(e.id) in ids_set]
    else:
        empresas_a_buscar = empresas_accesibles

    if not empresas_a_buscar:
        return []

    # ── 2) Resolver meses a considerar ────────────────────────────────────
    meses = _resolver_meses(periodo)

    # ── 3) Obtener (empresa, config) para cada empresa ────────────────────
    #      — si una empresa no tiene FtpConfig activa o carpeta_aob, se
    #        excluye silenciosamente de la búsqueda.
    tareas: List[Tuple[Empresa, FtpConfig]] = []
    for emp in empresas_a_buscar:
        config = _primera_config_activa(db, tenant_id=tenant_id, empresa_id=int(emp.id))
        if config is None:
            continue
        if not (getattr(config, "carpeta_aob", None) or "").strip():
            continue
        tareas.append((emp, config))

    if not tareas:
        return []

    # ── 4) Explorar en paralelo (spec V8 · punto 12) ──────────────────────
    hits: List[_SftpHit] = []
    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = [pool.submit(_explorar_empresa, emp, cfg, meses, nombre_filtro) for emp, cfg in tareas]
        for f in futures:
            try:
                hits.extend(f.result())
            except Exception:
                # Un fallo puntual de una empresa no debe tumbar el resultado global.
                continue

    if not hits:
        return []

    # ── 4b) Filtro por fecha SFTP (fecha_desde / fecha_hasta) ─────────────
    #      - fecha_desde: desde 00:00 de ese día (inclusive).
    #      - fecha_hasta: hasta 23:59:59.999999 de ese día (inclusive).
    #      - Si un hit no tiene fecha_sftp (ninguno de los dos parseó),
    #        se incluye cuando NO hay filtro, y se EXCLUYE cuando sí lo hay.
    dt_desde = _parse_fecha_dia(fecha_desde, fin_de_dia=False)
    dt_hasta = _parse_fecha_dia(fecha_hasta, fin_de_dia=True)
    if dt_desde is not None or dt_hasta is not None:
        filtrados: List[_SftpHit] = []
        for h in hits:
            if h.fecha_sftp is None:
                continue  # sin fecha → fuera cuando hay filtro
            if dt_desde is not None and h.fecha_sftp < dt_desde:
                continue
            if dt_hasta is not None and h.fecha_sftp > dt_hasta:
                continue
            filtrados.append(h)
        hits = filtrados
        if not hits:
            return []

    # ── 5) Agrupar por (empresa_id, clave_base) para saber la versión máx SFTP
    version_max_sftp: Dict[Tuple[int, str], int] = {}
    for h in hits:
        key = (h.empresa_id, h.parsed.clave_base)
        prev = version_max_sftp.get(key)
        if prev is None or h.parsed.version > prev:
            version_max_sftp[key] = h.parsed.version

    # ── 6) Consultar versiones importadas en BD ───────────────────────────
    empresas_con_hits = list({h.empresa_id for h in hits})
    versiones_bd = _versiones_en_bd(db, tenant_id=tenant_id, empresa_ids=empresas_con_hits)

    # ── 7) Calcular estado por fila y montar respuesta ────────────────────
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
            "periodo":           h.parsed.aaaamm,   # YYYYMM
            "version":           h.parsed.version,
            "tamanio":           h.tamanio,
            "fecha_sftp":        h.fecha_sftp.isoformat() if h.fecha_sftp else None,
            "estado":            estado,
            "version_importada": ver_bd,
        })

    # ── 8) Orden: fecha SFTP desc (más reciente primero),
    #    con clave_base asc + versión desc como desempate.
    #    Ficheros sin fecha_sftp van al final de la lista.
    out.sort(key=_sort_key_resultado)
    return out


def _sort_key_resultado(r: dict) -> Tuple[int, float, str, int]:
    """
    Clave de orden para resultados de buscar_ftp:
      1) Los que tienen fecha_sftp primero (con fecha = 0, sin fecha = 1).
      2) Fecha SFTP descendente (más reciente arriba) → usamos -timestamp.
      3) clave_base ascendente (alfabética).
      4) version descendente (mayor arriba) → usamos -version.
    """
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
# FASE 4 — Ejecución: descargar-e-importar
# ══════════════════════════════════════════════════════════════════════════════

# Mapeo tipo AOB → funciones de import + delete_fichero de objeciones/services.py.
# Se construye aquí para localizar las funciones de cada tipo en un solo sitio.
_TIPO_OPS = {
    "AOBAGRECL": {"import": import_agrecl, "delete": delete_agrecl_fichero},
    "OBJEINCL":  {"import": import_incl,   "delete": delete_incl_fichero},
    "AOBCUPS":   {"import": import_cups,   "delete": delete_cups_fichero},
    "AOBCIL":    {"import": import_cil,    "delete": delete_cil_fichero},
}


def _version_y_nombre_importado(
    db: Session,
    *,
    modelo,
    tenant_id: int,
    empresa_id: int,
    clave_base: str,
) -> Optional[Tuple[int, str]]:
    """
    Busca en la tabla del modelo el nombre_fichero importado para una clave_base.
    Devuelve (version, nombre_completo) de la versión más alta encontrada, o None
    si no hay ninguna importación previa para esa clave.

    Ej: clave_base="AOBAGRECL_0277_202604_20260415" →
        puede devolver (2, "AOBAGRECL_0277_202604_20260415.2")
    """
    rows = db.query(modelo.nombre_fichero).filter(
        modelo.tenant_id == tenant_id,
        modelo.empresa_id == empresa_id,
        modelo.nombre_fichero.like(f"{clave_base}.%"),
    ).distinct().all()

    mejor: Optional[Tuple[int, str]] = None
    for (nombre,) in rows:
        parsed = parse_aob_filename(nombre or "")
        if parsed is None or parsed.clave_base != clave_base:
            continue
        if mejor is None or parsed.version > mejor[0]:
            mejor = (parsed.version, nombre)
    return mejor


def _procesar_item(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    config_id: int,
    ruta_sftp: str,
    nombre: str,
    replace: bool,
) -> dict:
    """
    Procesa UN item: descarga del SFTP + importa a BD según reglas FASE 4.

    Reglas del spec V8 · puntos 26-30:
      ⚪ Nuevo                       → importar
      🟠 Actualizable + replace=True → DELETE antigua + INSERT nueva
      🟠 Actualizable + replace=False→ ERROR
      Igual o inferior ya en BD      → ERROR

    Devuelve un dict con el detalle del item para la respuesta:
      {"nombre": ..., "resultado": "ok" | "reemplazado" | "error",
       "mensaje": "..."}
    """
    # Import local para evitar ciclos y reusar helpers del proyecto.
    from app.comunicaciones.services import (
        _get_config_by_id_activa,
        _log,
        leer_fichero_ftp,
    )

    # 1) Validar nombre y tipo
    parsed = parse_aob_filename(nombre)
    if parsed is None:
        msg = "Nombre de fichero no reconocido como AOB válido."
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
             estado="error", mensaje_error=msg, modulo="objeciones")
        return {"nombre": nombre, "resultado": "error", "mensaje": msg}

    ops = _TIPO_OPS.get(parsed.tipo)
    if ops is None:
        msg = f"Tipo '{parsed.tipo}' no soportado."
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
             estado="error", mensaje_error=msg, modulo="objeciones")
        return {"nombre": nombre, "resultado": "error", "mensaje": msg}

    # 2) Calcular estado REAL en BD (no confiamos en el cliente)
    modelo = _TIPO_MODELO[parsed.tipo]
    importado = _version_y_nombre_importado(
        db, modelo=modelo, tenant_id=tenant_id, empresa_id=empresa_id,
        clave_base=parsed.clave_base,
    )

    if importado is not None:
        version_bd, nombre_bd = importado
        if parsed.version < version_bd:
            msg = f"Existe versión .{version_bd} más nueva en BD — esta (.{parsed.version}) es obsoleta."
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
                 estado="error", mensaje_error=msg, modulo="objeciones")
            return {"nombre": nombre, "resultado": "error", "mensaje": msg}
        if parsed.version == version_bd:
            msg = f"Versión .{parsed.version} ya está importada."
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
                 estado="error", mensaje_error=msg, modulo="objeciones")
            return {"nombre": nombre, "resultado": "error", "mensaje": msg}
        # parsed.version > version_bd → es "actualizable"
        if not replace:
            msg = f"Existe versión .{version_bd} importada. Confirma reemplazo para sustituirla."
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
                 estado="error", mensaje_error=msg, modulo="objeciones")
            return {"nombre": nombre, "resultado": "error", "mensaje": msg}
        es_reemplazo = True
        nombre_antiguo = nombre_bd
    else:
        es_reemplazo = False
        nombre_antiguo = None

    # 3) Validar que la config FTP sigue activa y es del tenant
    try:
        _get_config_by_id_activa(db, config_id=config_id, tenant_id=tenant_id)
    except ValueError as e:
        msg = str(e)
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=nombre, tamanio=None,
             estado="error", mensaje_error=msg, modulo="objeciones")
        return {"nombre": nombre, "resultado": "error", "mensaje": msg}

    # 4) Descargar del SFTP a memoria (registrar=False para no duplicar el log).
    #    Usamos parsed.nombre porque es el nombre real del fichero en SFTP
    #    (puede incluir sufijo .bz2 que no está en parsed.nombre_sin_bz2).
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
             estado="error", mensaje_error=msg, modulo="objeciones")
        return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}

    # 4b) Si el fichero viene comprimido con bz2, descomprimir.
    #     El contenido se pasa al importador como CSV plano (igual que el flujo
    #     de subida manual, donde el usuario sube el fichero ya descomprimido).
    tamanio_original = len(contenido_bruto)
    if parsed.es_bz2:
        try:
            contenido = bz2.decompress(contenido_bruto)
        except Exception as e:
            msg = f"Error descomprimiendo bz2: {str(e)[:200]}"
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
                 tamanio=tamanio_original,
                 estado="error", mensaje_error=msg, modulo="objeciones")
            return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}
    else:
        contenido = contenido_bruto

    # 5) Si es reemplazo: borrar la versión antigua (con sus respuestas).
    filas_borradas = 0
    if es_reemplazo and nombre_antiguo:
        try:
            filas_borradas = ops["delete"](
                db, nombre_fichero=nombre_antiguo,
                tenant_id=tenant_id, empresa_id=empresa_id,
            )
        except Exception as e:
            msg = f"Error borrando versión antigua: {str(e)[:200]}"
            _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
                 rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
                 tamanio=tamanio_original,
                 estado="error", mensaje_error=msg, modulo="objeciones")
            return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}

    # 6) Importar el fichero nuevo. Usamos parsed.nombre_sin_bz2 para que en BD
    #    los nombres queden consistentes con los de la subida manual.
    try:
        filas_importadas = ops["import"](
            db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=parsed.nombre_sin_bz2,
            content=contenido,
        )
    except Exception as e:
        msg = f"Error importando contenido: {str(e)[:200]}"
        _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
             rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
             tamanio=tamanio_original,
             estado="error", mensaje_error=msg, modulo="objeciones")
        return {"nombre": parsed.nombre_sin_bz2, "resultado": "error", "mensaje": msg}

    # 7) Log OK + respuesta.
    if es_reemplazo:
        resultado = "reemplazado"
        mensaje = f"Reemplazada versión .{importado[0] if importado else '?'} " \
                  f"({filas_borradas} filas borradas) + {filas_importadas} filas nuevas importadas."
    else:
        resultado = "ok"
        mensaje = f"Importadas {filas_importadas} filas."

    _log(db, tenant_id=tenant_id, empresa_id=empresa_id, config_id=config_id,
         rule_id=None, origen="manual", nombre_fichero=parsed.nombre_sin_bz2,
         tamanio=tamanio_original,
         estado="ok", modulo="objeciones")

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
    API pública de FASE 4.

    Recibe una lista de items seleccionados del resultado de buscar_ftp (FASE 3)
    y los procesa de uno en uno, aplicando las reglas de estado.

    items: cada uno debe llevar empresa_id, config_id, ruta_sftp, nombre.
    replace: True = autorizar reemplazo de versiones antigas (🟠).

    Devuelve:
        {
          "importados":   N,
          "reemplazados": M,
          "errores":      K,
          "detalle":      [{"nombre", "resultado", "mensaje"}, ...]
        }
    """
    # Validar scope: lista de empresas que el usuario puede usar.
    empresas_accesibles_ids = {
        int(e.id)
        for e in _empresas_accesibles(db, tenant_id=tenant_id, current_user=current_user)
    }

    importados = 0
    reemplazados = 0
    errores = 0
    detalle: List[dict] = []

    for item in items:
        empresa_id = int(item.get("empresa_id") or 0)
        config_id  = int(item.get("config_id") or 0)
        ruta_sftp  = str(item.get("ruta_sftp") or "").strip()
        nombre     = str(item.get("nombre") or "").strip()

        # Validación mínima del item
        if not (empresa_id and config_id and ruta_sftp and nombre):
            errores += 1
            detalle.append({
                "nombre": nombre or "(sin nombre)",
                "resultado": "error",
                "mensaje": "Item incompleto: faltan empresa_id, config_id, ruta_sftp o nombre.",
            })
            continue

        # Validar acceso a la empresa
        if empresa_id not in empresas_accesibles_ids:
            errores += 1
            detalle.append({
                "nombre": nombre,
                "resultado": "error",
                "mensaje": "Sin permiso sobre la empresa indicada.",
            })
            continue

        # Procesar el item
        res = _procesar_item(
            db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            config_id=config_id,
            ruta_sftp=ruta_sftp,
            nombre=nombre,
            replace=replace,
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