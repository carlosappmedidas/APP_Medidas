# app/stg/services.py
# pyright: reportMissingImports=false
"""
Lógica de negocio del módulo STG.

Todos los métodos respetan multi-tenant + multi-empresa usando el módulo
`app.core.permissions` (igual que el resto de módulos de la app).
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.permissions import (
    assert_empresa_access,
    get_allowed_empresa_ids,
)
from app.stg.adapters.base import StgAdapter
from app.stg.adapters.mock_adapter import MockStgAdapter
from app.stg.adapters.gisce_adapter import GisceAdapter
from app.stg.adapters.sftp_adapter import SftpStgAdapter
from app.stg.adapters.ftp_adapter import FtpStgAdapter
from app.stg.models import (
    ConexionStgEmpresa,
    StgConcentrador,
    Cups,
    FicheroRecibido,
    SolicitudFichero,
    Contador,
    Medida,
)
from app.tenants.models import User


# ---------------------------------------------------------------------------
# Adapter factory
# ---------------------------------------------------------------------------
def get_adapter_for_empresa(
    db: Session,
    empresa_id: int,
) -> StgAdapter:
    """
    Devuelve la instancia de adapter apropiada para una empresa según su
    configuración en stg_conexion_empresa. Si no hay configuración o no
    está activa, devuelve un MockStgAdapter (útil en desarrollo).
    """
    conf = (
        db.query(ConexionStgEmpresa)
        .filter(
            ConexionStgEmpresa.empresa_id == empresa_id,
            ConexionStgEmpresa.activo.is_(True),
        )
        .first()
    )
    if conf is None:
        return MockStgAdapter(empresa_id=empresa_id)

    if conf.tipo == "gisce":
        return GisceAdapter(
            host=conf.host or "",
            puerto=conf.puerto or 8069,
            usuario=conf.usuario or "",
            password=_descifrar_password(conf.password_cifrado),
            database=(conf.config_extra or {}).get("database", ""),
        )
    if conf.tipo == "sftp":
        return SftpStgAdapter(
            host=conf.host or "",
            puerto=conf.puerto or 22,
            usuario=conf.usuario or "",
            password=_descifrar_password(conf.password_cifrado),
            ruta_base=conf.ruta_base or "/",
            carpeta_recepcion=conf.carpeta_recepcion or "",
            carpeta_envio=conf.carpeta_envio or "",
            usar_tls=bool(conf.usar_tls) if conf.usar_tls is not None else True,
        )
    if conf.tipo == "ftp":
        return FtpStgAdapter(
            host=conf.host or "",
            puerto=conf.puerto or 21,
            usuario=conf.usuario or "",
            password=_descifrar_password(conf.password_cifrado),
            ruta_base=conf.ruta_base or "/",
            carpeta_recepcion=conf.carpeta_recepcion or "",
            carpeta_envio=conf.carpeta_envio or "",
            usar_tls=bool(conf.usar_tls) if conf.usar_tls is not None else False,
        )
    # api_rest y db_directa pendientes en futuros paquetes
    return MockStgAdapter(empresa_id=empresa_id)


def _descifrar_password(password_cifrado: Optional[str]) -> str:
    """
    Placeholder: en producción usaríamos Fernet con clave en .env.
    Por ahora devuelve tal cual lo que llega (sin cifrar) para no bloquear
    el desarrollo. Se reemplazará por cifrado real en Paquete 2 o 3.
    """
    return password_cifrado or ""


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
def get_dashboard_summary(
    db: Session,
    user: User,
    empresa_id: int,
) -> dict:
    """KPIs principales para el dashboard del STG."""
    assert_empresa_access(db, user, empresa_id)

    # Paquete 8a-fix2: el dashboard cuenta CONTADORES DETECTADOS
    # (stg_contador, creada en Paquete 6 con UPSERTs desde S24) en vez
    # de los CUPS administrativos (stg_cups, Paquete 1, que sigue vacía
    # hasta que se cargue manualmente la lista oficial del cliente).
    #
    # NO filtramos por Contador.activo: ese flag refleja el "Active=Y/N"
    # del S24, que indica si el concentrador considera al contador activo
    # en su tabla actual (algunos dados de baja pero aún físicamente
    # instalados). Para una vista de salud honesta, queremos mostrar
    # TODOS los detectados, incluyendo los offline/dados de baja, para
    # que aparezcan en `cups_offline` y el usuario pueda investigarlos.
    #
    # Mapeo de estados (semántica Cups → Contador):
    #   "online"      → "ok"      (ComStatus=2 en S24)
    #   "offline"     → "error"   (ComStatus=0 en S24)
    #   "alerta"      → "warning" (ComStatus=1 en S24, no se muestra)
    #
    # Las claves de respuesta siguen siendo cups_* por compatibilidad
    # con el frontend actual; semánticamente representan "contadores".
    cups_total = db.query(func.count(Contador.id)).filter(
        Contador.empresa_id == empresa_id,
    ).scalar() or 0

    cups_online = db.query(func.count(Contador.id)).filter(
        Contador.empresa_id == empresa_id,
        Contador.estado_comunicacion == "ok",
    ).scalar() or 0

    cups_offline = db.query(func.count(Contador.id)).filter(
        Contador.empresa_id == empresa_id,
        Contador.estado_comunicacion == "error",
    ).scalar() or 0

    porcentaje_online = round(
        (cups_online / cups_total * 100) if cups_total else 0.0, 1
    )

    conc_total = db.query(func.count(StgConcentrador.id)).filter(
        StgConcentrador.empresa_id == empresa_id, StgConcentrador.activo.is_(True)
    ).scalar() or 0

    conc_alerta = db.query(func.count(StgConcentrador.id)).filter(
        StgConcentrador.empresa_id == empresa_id,
        StgConcentrador.activo.is_(True),
        StgConcentrador.estado_comunicacion == "alerta",
    ).scalar() or 0

    conc_offline = db.query(func.count(StgConcentrador.id)).filter(
        StgConcentrador.empresa_id == empresa_id,
        StgConcentrador.activo.is_(True),
        StgConcentrador.estado_comunicacion == "offline",
    ).scalar() or 0

    sol_pendientes = db.query(func.count(SolicitudFichero.id)).filter(
        SolicitudFichero.empresa_id == empresa_id,
        SolicitudFichero.estado == "pendiente",
    ).scalar() or 0

    sol_en_proceso = db.query(func.count(SolicitudFichero.id)).filter(
        SolicitudFichero.empresa_id == empresa_id,
        SolicitudFichero.estado.in_(["enviada", "en_proceso"]),
    ).scalar() or 0

    return {
        "empresa_id": empresa_id,
        "cups_total": cups_total,
        "cups_online": cups_online,
        "cups_offline": cups_offline,
        "porcentaje_online": porcentaje_online,
        "concentradores_total": conc_total,
        "concentradores_alerta": conc_alerta,
        "concentradores_offline": conc_offline,
        "solicitudes_pendientes": sol_pendientes,
        "solicitudes_en_proceso": sol_en_proceso,
    }


# ---------------------------------------------------------------------------
# Listados con paginación
# ---------------------------------------------------------------------------
def listar_cups(
    db: Session,
    user: User,
    empresa_id: Optional[int] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Lista paginada de CUPS, respetando permisos de empresa."""
    allowed = get_allowed_empresa_ids(db, user)

    q = db.query(Cups).filter(Cups.activo.is_(True))
    if empresa_id is not None:
        assert_empresa_access(db, user, empresa_id)
        q = q.filter(Cups.empresa_id == empresa_id)
    else:
        q = q.filter(Cups.empresa_id.in_(allowed))

    if estado:
        q = q.filter(Cups.estado_comunicacion == estado)
    if search:
        s = f"%{search}%"
        q = q.filter(
            (Cups.cups.ilike(s))
            | (Cups.numero_contador.ilike(s))
            | (Cups.direccion.ilike(s))
        )

    total = q.count()
    items = (
        q.order_by(Cups.cups)
        .limit(page_size)
        .offset((page - 1) * page_size)
        .all()
    )

    def serialize(c: Cups) -> dict:
        return {
            "id": c.id,
            "empresa_id": c.empresa_id,
            "cups": c.cups,
            "concentrador_id": c.concentrador_id,
            "concentrador_codigo_ct": (
                c.concentrador.codigo_ct if c.concentrador else None
            ),
            "numero_contador": c.numero_contador,
            "fabricante_contador": c.fabricante_contador,
            "modelo_contador": c.modelo_contador,
            "tarifa": c.tarifa,
            "tension_suministro": c.tension_suministro,
            "tipo_punto_medida": c.tipo_punto_medida,
            "direccion": c.direccion,
            "municipio": c.municipio,
            "provincia": c.provincia,
            "cp": c.cp,
            "latitud": c.latitud,
            "longitud": c.longitud,
            "autoconsumo": c.autoconsumo,
            "fecha_alta": c.fecha_alta,
            "fecha_baja": c.fecha_baja,
            "comercializadora_actual": c.comercializadora_actual,
            "ultimo_contacto": c.ultimo_contacto,
            "estado_comunicacion": c.estado_comunicacion,
            "activo": c.activo,
        }

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [serialize(c) for c in items],
    }


def listar_concentradores(
    db: Session,
    user: User,
    empresa_id: Optional[int] = None,
    estado: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Lista paginada de concentradores."""
    allowed = get_allowed_empresa_ids(db, user)

    q = db.query(StgConcentrador).filter(StgConcentrador.activo.is_(True))
    if empresa_id is not None:
        assert_empresa_access(db, user, empresa_id)
        q = q.filter(StgConcentrador.empresa_id == empresa_id)
    else:
        q = q.filter(StgConcentrador.empresa_id.in_(allowed))

    if estado:
        q = q.filter(StgConcentrador.estado_comunicacion == estado)

    total = q.count()
    items = (
        q.order_by(StgConcentrador.codigo_ct)
        .limit(page_size)
        .offset((page - 1) * page_size)
        .all()
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# ---------------------------------------------------------------------------
# Solicitudes
# ---------------------------------------------------------------------------
def crear_solicitud(
    db: Session,
    user: User,
    payload: dict,
) -> SolicitudFichero:
    """
    Crea una nueva solicitud de fichero S0X.
    NO la envía al STG todavía — eso lo hace `enviar_solicitud()` o el worker.
    """
    empresa_id = int(payload["empresa_id"])
    assert_empresa_access(db, user, empresa_id)

    sol = SolicitudFichero(
        tenant_id=user.tenant_id,
        empresa_id=empresa_id,
        cups_id=payload.get("cups_id"),
        concentrador_id=payload.get("concentrador_id"),
        tipo_fichero=payload["tipo_fichero"],
        fecha_desde=payload["fecha_desde"],
        fecha_hasta=payload["fecha_hasta"],
        prioridad=payload.get("prioridad", "normal"),
        estado="pendiente",
        solicitado_por=user.id,
    )
    db.add(sol)
    db.commit()
    db.refresh(sol)
    return sol


def listar_solicitudes(
    db: Session,
    user: User,
    empresa_id: Optional[int] = None,
    estado: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict:
    allowed = get_allowed_empresa_ids(db, user)

    q = db.query(SolicitudFichero)
    if empresa_id is not None:
        assert_empresa_access(db, user, empresa_id)
        q = q.filter(SolicitudFichero.empresa_id == empresa_id)
    else:
        q = q.filter(SolicitudFichero.empresa_id.in_(allowed))

    if estado:
        q = q.filter(SolicitudFichero.estado == estado)

    total = q.count()
    items = (
        q.order_by(SolicitudFichero.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
        .all()
    )

    def serialize(s: SolicitudFichero) -> dict:
        return {
            "id": s.id,
            "empresa_id": s.empresa_id,
            "cups_id": s.cups_id,
            "cups_codigo": s.cups.cups if s.cups else None,
            "concentrador_id": s.concentrador_id,
            "concentrador_codigo_ct": (
                s.concentrador.codigo_ct if s.concentrador else None
            ),
            "tipo_fichero": s.tipo_fichero,
            "fecha_desde": s.fecha_desde,
            "fecha_hasta": s.fecha_hasta,
            "prioridad": s.prioridad,
            "estado": s.estado,
            "solicitado_por": s.solicitado_por,
            "mensaje_error": s.mensaje_error,
            "fecha_envio": s.fecha_envio,
            "fecha_recepcion": s.fecha_recepcion,
            "created_at": s.created_at,
        }

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [serialize(s) for s in items],
    }


# ---------------------------------------------------------------------------
# Conexión
# ---------------------------------------------------------------------------
def get_conexion_empresa(
    db: Session,
    user: User,
    empresa_id: int,
) -> Optional[ConexionStgEmpresa]:
    assert_empresa_access(db, user, empresa_id)
    return (
        db.query(ConexionStgEmpresa)
        .filter(ConexionStgEmpresa.empresa_id == empresa_id)
        .first()
    )


def upsert_conexion_empresa(
    db: Session,
    user: User,
    payload: dict,
) -> ConexionStgEmpresa:
    empresa_id = int(payload["empresa_id"])
    assert_empresa_access(db, user, empresa_id)

    existing = (
        db.query(ConexionStgEmpresa)
        .filter(ConexionStgEmpresa.empresa_id == empresa_id)
        .first()
    )

    campos_simples = ["tipo", "nombre", "host", "puerto", "usuario",
                       "ruta_base", "config_extra", "activo",
                       "carpeta_recepcion", "carpeta_envio", "usar_tls"]

    if existing is None:
        existing = ConexionStgEmpresa(
            tenant_id=user.tenant_id,
            empresa_id=empresa_id,
            tipo=payload.get("tipo", "mock"),
            estado="no_probado",
        )
        db.add(existing)

    for k in campos_simples:
        if k in payload and payload[k] is not None:
            setattr(existing, k, payload[k])

    if payload.get("password"):
        existing.password_cifrado = payload["password"]  # TODO cifrar en Paquete 2

    db.commit()
    db.refresh(existing)
    return existing


def probar_conexion(
    db: Session,
    user: User,
    empresa_id: int,
) -> dict:
    """Hace un ping al STG de la empresa y actualiza estado en BD."""
    assert_empresa_access(db, user, empresa_id)
    adapter = get_adapter_for_empresa(db, empresa_id)
    result = adapter.ping()

    conf = (
        db.query(ConexionStgEmpresa)
        .filter(ConexionStgEmpresa.empresa_id == empresa_id)
        .first()
    )
    if conf:
        conf.ultimo_ping = datetime.utcnow()
        conf.estado = "ok" if result.ok else "error"
        conf.ultimo_error = None if result.ok else result.mensaje
        db.commit()

    return {
        "ok": result.ok,
        "mensaje": result.mensaje,
        "tiempo_ms": result.tiempo_ms,
    }


# ---------------------------------------------------------------------------
# Listado de ficheros remotos (Paquete 3 SFTP + Paquete 4 FTP)
# ---------------------------------------------------------------------------
def listar_ficheros_sftp(
    db: Session,
    user: User,
    empresa_id: int,
    filtro_patron: Optional[str] = None,
) -> dict:
    """
    Lista ficheros disponibles en la carpeta_recepcion remota de la empresa.

    Aplica para conexiones de tipo "sftp" (Paquete 3) o "ftp" (Paquete 4).
    Para otros tipos devuelve un dict vacío.

    Nota: la URL del endpoint sigue siendo /stg/sftp/listar por compatibilidad
    con el Paquete 3, pero internamente sirve a ambos protocolos.
    """
    assert_empresa_access(db, user, empresa_id)

    conf = (
        db.query(ConexionStgEmpresa)
        .filter(ConexionStgEmpresa.empresa_id == empresa_id)
        .first()
    )
    if conf is None:
        return {
            "empresa_id": empresa_id,
            "ruta_consultada": "",
            "total": 0,
            "items": [],
        }
    if conf.tipo not in ("sftp", "ftp"):
        return {
            "empresa_id": empresa_id,
            "ruta_consultada": "",
            "total": 0,
            "items": [],
        }

    adapter = get_adapter_for_empresa(db, empresa_id)
    # adapter es SftpStgAdapter o FtpStgAdapter según conf.tipo
    resultado = adapter.listar_ficheros(filtro_patron=filtro_patron)
    return {
        "empresa_id": empresa_id,
        **resultado,
    }


# ---------------------------------------------------------------------------
# Descarga de ficheros (Paquete 5)
# ---------------------------------------------------------------------------

# Regex para parsear nombres conocidos.
#
# Formato del fabricante Circutor (con sufijo de tipo de mensaje):
#   CIR4621531018_0_S24_0_20251209220004      (CIR + ID + sin R extra)
#   CIRR208251006614_0_G97_0_20260306120530   (CIRR + ID + con R extra, otra variante)
#   CIR<ID_CONTADOR>(R?)_<COD>_<TIPO_MENSAJE>_<NUM>_<YYYYMMDDHHMMSS>
#
# La R después de "CIR" es opcional (algunos formatos tienen CIRR, otros CIR).
_CIRR_RE = re.compile(
    r"^CIRR?(?P<id_contador>\d+)_[^_]+_(?P<tipo>[A-Z0-9]+)_\d+_"
    r"(?P<ts>\d{14})(\..*)?$"
)

# S0X estándar del sector eléctrico español. Hay muchas variantes pero la mayoría
# empiezan por el código tipo ("S02_", "S04_", "S05_", "S09_") y contienen
# fechas YYYYMMDD intercaladas.
_S0X_PREFIX_RE = re.compile(r"^(?P<tipo>S\d{2})[_.]")
_FECHA_8_RE = re.compile(r"(?<!\d)(?P<fecha>20\d{6})(?!\d)")


def _extraer_metadata_nombre(nombre: str) -> dict:
    """
    Extrae metadata del nombre del fichero.

    Devuelve dict con claves (todas opcionales/None):
      tipo_fichero, tipo_mensaje, id_contador, timestamp_nombre
    """
    nombre_corto = nombre.split("/")[-1]

    # Intento 1: formato CIRR
    m = _CIRR_RE.match(nombre_corto)
    if m:
        ts_raw = m.group("ts")
        try:
            ts = datetime.strptime(ts_raw, "%Y%m%d%H%M%S")
        except Exception:
            ts = None
        return {
            "tipo_fichero": m.group("tipo"),       # G97, S52, S56...
            "tipo_mensaje": m.group("tipo"),
            "id_contador":  m.group("id_contador"),
            "timestamp_nombre": ts,
        }

    # Intento 2: S0X estándar (S02_..., S04_..., S05_..., S09_...)
    m_prefix = _S0X_PREFIX_RE.match(nombre_corto)
    if m_prefix:
        tipo = m_prefix.group("tipo")
        # Buscar la primera fecha YYYYMMDD del nombre
        m_fecha = _FECHA_8_RE.search(nombre_corto)
        ts = None
        if m_fecha:
            try:
                ts = datetime.strptime(m_fecha.group("fecha"), "%Y%m%d")
            except Exception:
                ts = None
        return {
            "tipo_fichero": tipo,
            "tipo_mensaje": tipo,
            "id_contador":  None,
            "timestamp_nombre": ts,
        }

    # Sin patrón reconocido
    return {
        "tipo_fichero": "OTRO",
        "tipo_mensaje": None,
        "id_contador":  None,
        "timestamp_nombre": None,
    }


def _get_storage_path() -> Path:
    """
    Directorio raíz donde guardamos los ficheros descargados.
    Configurable vía env var STG_STORAGE_PATH; default: backend/storage/stg/
    """
    custom = os.environ.get("STG_STORAGE_PATH")
    if custom:
        return Path(custom)
    # Fallback: relativo al working directory del backend
    return Path("storage") / "stg"


def _path_local_para_fichero(empresa_id: int, nombre: str, ts: Optional[datetime]) -> Path:
    """
    Calcula el path local destino:
        <STG_STORAGE_PATH>/empresa_<id>/<YYYY-MM>/<nombre>

    Si no hay timestamp, va a una subcarpeta "sin_fecha".
    """
    base = _get_storage_path() / f"empresa_{empresa_id}"
    if ts:
        subcarpeta = ts.strftime("%Y-%m")
    else:
        subcarpeta = "sin_fecha"
    return base / subcarpeta / nombre


def descargar_ficheros_nuevos(
    db: Session,
    user,
    empresa_id: int,
    limite: int = 5,
) -> dict:
    """
    Descarga ficheros NUEVOS (que no estén ya en BD) del STG remoto.

    Flujo:
      1. Listar ficheros en carpeta_recepcion vía adapter.listar_ficheros()
      2. Filtrar los que ya están en BD (por empresa_id + nombre_original)
      3. Coger los primeros `limite`
      4. Para cada uno:
         - Descargar a disco
         - Extraer metadata del nombre
         - Crear FicheroRecibido en BD
      5. Devolver resumen

    Solo aplica si la conexión es de tipo "sftp" o "ftp".
    """
    # Importar aquí para evitar circular
    from app.tenants.models import User

    assert_empresa_access(db, user, empresa_id)

    conf = (
        db.query(ConexionStgEmpresa)
        .filter(ConexionStgEmpresa.empresa_id == empresa_id)
        .first()
    )
    if conf is None:
        raise ValueError("La empresa no tiene conexión STG configurada.")
    if conf.tipo not in ("sftp", "ftp"):
        raise ValueError(
            f"La descarga solo soporta tipos 'sftp' y 'ftp', no '{conf.tipo}'."
        )

    adapter = get_adapter_for_empresa(db, empresa_id)

    # 1) Listar
    listado = adapter.listar_ficheros()
    items = listado.get("items", [])
    ruta_remota = listado.get("ruta_consultada", "")

    # 2) Filtrar los ya descargados (por nombre_original + empresa_id)
    nombres_ya_descargados = set()
    if items:
        nombres_existentes = (
            db.query(FicheroRecibido.nombre_original)
            .filter(
                FicheroRecibido.empresa_id == empresa_id,
                FicheroRecibido.nombre_original.in_(
                    [it["nombre"] for it in items]
                ),
            )
            .all()
        )
        nombres_ya_descargados = {r[0] for r in nombres_existentes}

    # 3) Particionar y aplicar límite
    pendientes = [it for it in items if it["nombre"] not in nombres_ya_descargados]
    a_descargar = pendientes[:limite]

    descargados = 0
    saltados_duplicados = len(items) - len(pendientes)
    errores = 0
    detalle: list[dict] = []

    # 4) Descargar uno a uno
    for item in a_descargar:
        nombre = item["nombre"]
        try:
            metadata = _extraer_metadata_nombre(nombre)
            ts = metadata["timestamp_nombre"]
            path_local = _path_local_para_fichero(empresa_id, nombre, ts)

            bytes_descargados = adapter.descargar_fichero(nombre, str(path_local))

            # Crear FicheroRecibido
            fichero = FicheroRecibido(
                tenant_id=conf.tenant_id,
                empresa_id=empresa_id,
                solicitud_id=None,
                cups_id=None,
                tipo_fichero=metadata["tipo_fichero"] or "OTRO",
                path=str(path_local),
                nombre_original=nombre,
                tamano_bytes=bytes_descargados,
                periodo_dato_desde=None,
                periodo_dato_hasta=None,
                id_contador=metadata["id_contador"],
                tipo_mensaje=metadata["tipo_mensaje"],
                timestamp_nombre=ts,
                ruta_remota=ruta_remota,
                parsed=False,
                parsed_at=None,
            )
            db.add(fichero)
            db.commit()

            descargados += 1
            detalle.append({
                "nombre": nombre,
                "estado": "descargado",
                "tamano_bytes": bytes_descargados,
                "path_local": str(path_local),
                "error": None,
            })
        except Exception as e:
            errores += 1
            db.rollback()
            detalle.append({
                "nombre": nombre,
                "estado": "error",
                "tamano_bytes": None,
                "path_local": None,
                "error": f"{type(e).__name__}: {e}",
            })

    # 5) Resumen
    return {
        "empresa_id": empresa_id,
        "ruta_remota": ruta_remota,
        "total_remotos": len(items),
        "limite_usado": limite,
        "descargados": descargados,
        "saltados_duplicados": saltados_duplicados,
        "errores": errores,
        "detalle": detalle,
    }


# ===========================================================================
# Parseo de ficheros descargados (Paquete 6)
# ===========================================================================

# Mapeo de ComStatus → estado_comunicacion legible
_STATUS_MAP = {
    2: "ok",
    1: "warning",
    0: "error",
}


def _mapear_status(status_int) -> str:
    """Mapea el ComStatus numérico de S24 a string legible."""
    try:
        return _STATUS_MAP.get(int(status_int), "desconocido")
    except (ValueError, TypeError):
        return "desconocido"


# Tabla de fabricantes conocidos por prefijo del meter_id (primeros 3 chars)
_FABRICANTES = {
    "CIR": "Circutor",
    "LGZ": "Landis+Gyr",
    "SAG": "Sagemcom",
    "ZIV": "ZIV",
    "ITE": "ITE/Itron",
    "ITR": "Itron",
}


def _extraer_fabricante(meter_id: str) -> Optional[str]:
    """
    Devuelve el código de fabricante (3 letras) si el meter_id tiene un
    prefijo conocido, o las 3 primeras letras como fallback.
    """
    if not meter_id or len(meter_id) < 3:
        return None
    prefix = meter_id[:3].upper()
    # Devolvemos siempre el prefijo (la tabla _FABRICANTES es solo documental)
    return prefix


def _upsert_concentrador(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    codigo_ct: str,
    ultimo_contacto: Optional[datetime] = None,
) -> StgConcentrador:
    """
    UPSERT en stg_concentrador por (empresa_id, codigo_ct).

    Si existe, actualiza `ultimo_contacto` y `estado_comunicacion`="online".
    Si no, lo crea con valores por defecto.
    """
    cnc = (
        db.query(StgConcentrador)
        .filter(
            StgConcentrador.empresa_id == empresa_id,
            StgConcentrador.codigo_ct == codigo_ct,
        )
        .first()
    )
    if cnc is None:
        cnc = StgConcentrador(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            codigo_ct=codigo_ct,
            ultimo_contacto=ultimo_contacto,
            estado_comunicacion="online",
            activo=True,
        )
        db.add(cnc)
        db.flush()    # para obtener cnc.id sin commit todavía
    else:
        # Solo actualizamos si la fecha nueva es más reciente (evita regresiones
        # cuando reprocesamos un fichero antiguo después de uno nuevo).
        if ultimo_contacto and (
            cnc.ultimo_contacto is None or ultimo_contacto > cnc.ultimo_contacto
        ):
            cnc.ultimo_contacto = ultimo_contacto
            cnc.estado_comunicacion = "online"
    return cnc


def _upsert_contador(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    meter_id: str,
    concentrador_id: Optional[int],
    fabricante: Optional[str],
    ultimo_contacto: Optional[datetime],
    estado_comunicacion: str,
    activo: bool,
) -> Contador:
    """
    UPSERT en stg_contador por (empresa_id, meter_id).

    Actualiza estado_comunicacion y ultimo_contacto solo si el timestamp nuevo
    es más reciente que el almacenado.
    """
    ct = (
        db.query(Contador)
        .filter(
            Contador.empresa_id == empresa_id,
            Contador.meter_id == meter_id,
        )
        .first()
    )
    if ct is None:
        ct = Contador(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            concentrador_id=concentrador_id,
            meter_id=meter_id,
            fabricante=fabricante,
            ultimo_contacto=ultimo_contacto,
            estado_comunicacion=estado_comunicacion,
            activo=activo,
        )
        db.add(ct)
        db.flush()
    else:
        # Actualizar concentrador_id si nos llega uno y no lo tenemos
        if concentrador_id and ct.concentrador_id != concentrador_id:
            ct.concentrador_id = concentrador_id
        if fabricante and not ct.fabricante:
            ct.fabricante = fabricante
        # Solo actualizar estado si el timestamp es más reciente
        if ultimo_contacto and (
            ct.ultimo_contacto is None or ultimo_contacto > ct.ultimo_contacto
        ):
            ct.ultimo_contacto = ultimo_contacto
            ct.estado_comunicacion = estado_comunicacion
            ct.activo = activo
    return ct


def _upsert_contador_basico(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    meter_id: str,
    concentrador_id: Optional[int],
    fabricante: Optional[str],
) -> Contador:
    """
    UPSERT 'ligero' en stg_contador (Paquete 7).

    Solo identifica al contador (meter_id, fabricante, concentrador_id).
    NO actualiza estado_comunicacion / activo / ultimo_contacto: esos
    campos solo los rellena S24 (que sí trae ComStatus + Active).

    Para los tipos que solo traen medidas energéticas (S02 curvas,
    S05 cierres, S06 parámetros, S09 eventos, G02 calidad comunicación),
    usamos esta variante para evitar pisar la info de salud.

    Si el contador no existe, se crea con estado="desconocido", activo=True.
    Si existe, solo se enlaza al concentrador si no lo tenía y se rellena
    el fabricante si no estaba.
    """
    ct = (
        db.query(Contador)
        .filter(
            Contador.empresa_id == empresa_id,
            Contador.meter_id == meter_id,
        )
        .first()
    )
    if ct is None:
        ct = Contador(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            concentrador_id=concentrador_id,
            meter_id=meter_id,
            fabricante=fabricante,
            ultimo_contacto=None,
            estado_comunicacion="desconocido",
            activo=True,
        )
        db.add(ct)
        db.flush()
    else:
        if concentrador_id and ct.concentrador_id != concentrador_id:
            ct.concentrador_id = concentrador_id
        if fabricante and not ct.fabricante:
            ct.fabricante = fabricante
    return ct


def _parsear_iso(raw_ts) -> Optional[datetime]:
    """Convierte un string 'YYYY-MM-DD HH:MM:SS' (o datetime) a datetime."""
    if raw_ts is None:
        return None
    if isinstance(raw_ts, datetime):
        return raw_ts
    if isinstance(raw_ts, str):
        try:
            return datetime.strptime(raw_ts, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
    return None


def _parsear_s24(
    db: Session,
    fichero: FicheroRecibido,
) -> dict:
    """
    Parsea un fichero S24 con primestg.

    Estructura del XML S24:
      <Report IdRpt="S24" ...>
        <Cnc Id="...">
          <S24 Fh="...">
            <Meter MeterId="..." ComStatus="..." Date="..." Active="Y|N"/>
            ...
          </S24>
        </Cnc>
      </Report>

    Para cada Meter:
      - UPSERT en stg_concentrador
      - UPSERT en stg_contador
      - INSERT en stg_medida con datos en JSONB
    """
    # Lazy import para no romper si primestg no está instalado
    from primestg.report import Report  # type: ignore

    medidas_insertadas = 0
    concentradores_set = set()    # cnc_names que hemos hecho upsert
    contadores_set = set()         # meter_ids únicos que hemos hecho upsert

    with open(fichero.path, "rb") as f:
        report = Report(f)

    for cnc in report.concentrators:
        for value in cnc.values:
            cnc_name = value.get("cnc_name")
            cnc_ts = _parsear_iso(value.get("timestamp"))

            # UPSERT concentrador
            concentrador_obj = _upsert_concentrador(
                db, fichero.tenant_id, fichero.empresa_id, cnc_name, cnc_ts,
            )
            concentradores_set.add(cnc_name)

            for meter in value.get("meters", []):
                meter_id = meter.get("name")
                if not meter_id:
                    continue
                meter_ts = _parsear_iso(meter.get("timestamp"))
                status = meter.get("status")
                active = bool(meter.get("active"))
                estado_com = _mapear_status(status)
                fabricante = _extraer_fabricante(meter_id)

                # UPSERT contador
                contador_obj = _upsert_contador(
                    db,
                    tenant_id=fichero.tenant_id,
                    empresa_id=fichero.empresa_id,
                    meter_id=meter_id,
                    concentrador_id=concentrador_obj.id,
                    fabricante=fabricante,
                    ultimo_contacto=meter_ts,
                    estado_comunicacion=estado_com,
                    activo=active,
                )
                contadores_set.add(meter_id)

                # INSERT medida
                medida = Medida(
                    tenant_id=fichero.tenant_id,
                    empresa_id=fichero.empresa_id,
                    fichero_id=fichero.id,
                    concentrador_id=concentrador_obj.id,
                    contador_id=contador_obj.id,
                    tipo_fichero="S24",
                    timestamp_dato=cnc_ts,
                    concentrador_externo_id=cnc_name,
                    meter_id=meter_id,
                    datos={
                        "cnc_timestamp": value.get("timestamp"),
                        "cnc_season": value.get("season"),
                        "meter_timestamp": meter.get("timestamp"),
                        "meter_season": meter.get("season"),
                        "status": meter.get("status"),
                        "active": meter.get("active"),
                    },
                )
                db.add(medida)
                medidas_insertadas += 1

    return {
        "medidas_insertadas": medidas_insertadas,
        "concentradores_upsert": len(concentradores_set),
        "contadores_upsert": len(contadores_set),
    }


def _parsear_via_meter_values(
    db: Session,
    fichero: FicheroRecibido,
    tipo: str,
) -> dict:
    """
    Parser genérico para tipos que primestg expone vía `meter.values`
    (S02 curvas, S05 cierres, S06 parámetros, S09 eventos, G02 calidad
    de comunicación, etc.).

    Estructura común del XML:
      <Report IdRpt="SXX">
        <Cnc Id="...">
          <Cnt Id="..." [Magn|ErrCat|ErrCode|...]>
            <SXX Fh="..." [atributos específicos]/>
            ...
          </Cnt>
        </Cnc>
      </Report>

    Estructura común del dict que devuelve primestg para cada value:
      - Siempre: 'name' (meter_id), 'cnc_name', 'timestamp', 'season'
      - Específico del tipo:
          S02: ai, ae, r1, r2, r3, r4, bc, magn        (kWh por hora)
          S05: ai, ae, r1-r4, contract, period, date_begin, date_end, type
          S06: firmware_version, mac, manufacturer, model_type, voltages...
          S09: event_code, event_group
          G02: atime, aconc, atimeperc, nchanges, ahourly

    El dict completo se guarda en `stg_medida.datos` (JSONB) sin transformar.
    Esto da máxima flexibilidad: en el futuro se pueden crear vistas
    materializadas con `datos->>'ai'`, etc.

    Los UPSERTs en stg_contador son "básicos" (no tocan estado_comunicacion):
    el estado solo lo establece S24, que sí trae ComStatus + Active.
    """
    from primestg.report import Report  # type: ignore

    medidas_insertadas = 0
    concentradores_set = set()
    contadores_set = set()

    with open(fichero.path, "rb") as f:
        report = Report(f)

    for cnc in report.concentrators:
        # cnc_name puede venir como atributo del objeto Cnc, o dentro del value.
        cnc_name = getattr(cnc, "name", None)
        cnc_obj = None
        if cnc_name:
            cnc_obj = _upsert_concentrador(
                db, fichero.tenant_id, fichero.empresa_id, cnc_name,
            )
            concentradores_set.add(cnc_name)

        meters = getattr(cnc, "meters", None) or []
        if not meters:
            continue

        for meter in meters:
            # meter.values puede dar [] si el contador tiene ErrCat/ErrCode.
            try:
                values = meter.values
            except Exception:
                values = []

            if not values:
                continue

            for value in values:
                meter_name = value.get("name")
                if not meter_name:
                    continue

                # cnc_name puede venir también dentro del value (fallback)
                cnc_name_value = value.get("cnc_name") or cnc_name
                if cnc_name_value and cnc_obj is None:
                    cnc_obj = _upsert_concentrador(
                        db, fichero.tenant_id, fichero.empresa_id, cnc_name_value,
                    )
                    concentradores_set.add(cnc_name_value)

                fabricante = _extraer_fabricante(meter_name)
                contador_obj = _upsert_contador_basico(
                    db,
                    tenant_id=fichero.tenant_id,
                    empresa_id=fichero.empresa_id,
                    meter_id=meter_name,
                    concentrador_id=cnc_obj.id if cnc_obj else None,
                    fabricante=fabricante,
                )
                contadores_set.add(meter_name)

                # Timestamp del dato: la mayoría de tipos usa 'timestamp',
                # S05 usa 'date_begin' (inicio del cierre).
                ts = _parsear_iso(value.get("timestamp") or value.get("date_begin"))

                # Sanitizar datos para JSONB (convertir tipos no JSON-serializables)
                datos_serializables = _sanitizar_para_json(value)

                medida = Medida(
                    tenant_id=fichero.tenant_id,
                    empresa_id=fichero.empresa_id,
                    fichero_id=fichero.id,
                    concentrador_id=cnc_obj.id if cnc_obj else None,
                    contador_id=contador_obj.id,
                    tipo_fichero=tipo,
                    timestamp_dato=ts,
                    concentrador_externo_id=cnc_name_value,
                    meter_id=meter_name,
                    datos=datos_serializables,
                )
                db.add(medida)
                medidas_insertadas += 1

    return {
        "medidas_insertadas": medidas_insertadas,
        "concentradores_upsert": len(concentradores_set),
        "contadores_upsert": len(contadores_set),
    }


def _sanitizar_para_json(value: dict) -> dict:
    """
    Limpia un dict de primestg para que sea JSON-serializable.

    primestg a veces devuelve valores con caracteres no UTF-8 (vimos en S06
    cosas como 'ÿÿÿÿÿÿÿÿÿÿ' que vienen de bytes 0xFF en el XML), y JSONB
    de PostgreSQL no acepta el codepoint U+0000 ni bytes inválidos.

    Estrategia:
      - dicts: recursivo
      - listas: recursivo
      - str: reemplazar caracteres problemáticos
      - resto (int, float, bool, None): tal cual
    """
    if isinstance(value, dict):
        return {k: _sanitizar_para_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitizar_para_json(v) for v in value]
    if isinstance(value, str):
        # PostgreSQL JSONB no soporta \u0000 ni codepoints inválidos
        return value.replace("\x00", "").encode("utf-8", "replace").decode("utf-8", "replace")
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace").replace("\x00", "")
    # int, float, bool, None se quedan como están
    return value


def parsear_fichero(
    db: Session,
    user: User,
    fichero_id: int,
) -> dict:
    """
    Parsea un fichero descargado y guarda las medidas en BD.

    Idempotente: si el fichero ya estaba parsed=True, primero borra sus medidas
    previas y luego re-parsea. Esto permite re-procesar tras un fix sin duplicar.

    Tipos soportados: S24 (vía primestg). Otros tipos S0X conocidos por primestg
    se pueden añadir en el dispatcher de abajo de forma análoga.
    G97 y otros propietarios: skipped por ahora (parser propio en futuro paquete).
    """
    fichero = db.query(FicheroRecibido).filter(FicheroRecibido.id == fichero_id).first()
    if fichero is None:
        raise ValueError(f"Fichero {fichero_id} no encontrado.")
    assert_empresa_access(db, user, fichero.empresa_id)

    # Determinar el tipo. Preferimos tipo_mensaje (extraído del nombre) sobre tipo_fichero.
    tipo = (fichero.tipo_mensaje or fichero.tipo_fichero or "").upper()

    estado_previo = "ya_parseado_reprocesado" if fichero.parsed else "parseado"

    # Tipos despachables
    TIPOS_PRIMESTG_CNC_VALUES   = {"S24"}    # primestg expone via cnc.values
    TIPOS_PRIMESTG_METER_VALUES = {           # primestg expone via meter.values
        "S02",   # curvas horarias (kWh por hora) — facturación
        "S05",   # cierres diarios por periodo tarifario
        "S06",   # parámetros técnicos del contador
        "S09",   # eventos del contador
        "G02",   # calidad de comunicación diaria
    }
    TIPOS_SOPORTADOS    = TIPOS_PRIMESTG_CNC_VALUES | TIPOS_PRIMESTG_METER_VALUES
    TIPOS_SKIP_CONOCIDOS = {"G97"}    # propietario Circutor, parser propio pendiente

    if tipo not in TIPOS_SOPORTADOS and tipo not in TIPOS_SKIP_CONOCIDOS:
        # Tipo no soportado en absoluto
        fichero.parsed = False
        fichero.parse_error = f"tipo no soportado: '{tipo}'"
        db.commit()
        return {
            "fichero_id": fichero.id,
            "estado": "skipped_tipo_no_soportado",
            "tipo_fichero": tipo,
            "medidas_insertadas": 0,
            "concentradores_upsert": 0,
            "contadores_upsert": 0,
            "error": f"tipo no soportado: '{tipo}'",
        }

    if tipo in TIPOS_SKIP_CONOCIDOS:
        # Conocido pero sin parser todavía
        fichero.parsed = False
        fichero.parse_error = f"tipo {tipo} pendiente de parser propio"
        db.commit()
        return {
            "fichero_id": fichero.id,
            "estado": "skipped_tipo_no_soportado",
            "tipo_fichero": tipo,
            "medidas_insertadas": 0,
            "concentradores_upsert": 0,
            "contadores_upsert": 0,
            "error": f"tipo {tipo} pendiente",
        }

    # Si ya estaba parsed, borrar medidas previas (idempotencia)
    if fichero.parsed:
        db.query(Medida).filter(Medida.fichero_id == fichero.id).delete()
        db.flush()

    try:
        if tipo in TIPOS_PRIMESTG_CNC_VALUES:
            resultado = _parsear_s24(db, fichero)
        elif tipo in TIPOS_PRIMESTG_METER_VALUES:
            resultado = _parsear_via_meter_values(db, fichero, tipo)
        else:
            # Defensivo, no debería llegar
            raise RuntimeError(f"dispatcher inválido para tipo '{tipo}'")

        fichero.parsed = True
        fichero.parsed_at = datetime.utcnow()
        fichero.parse_error = None
        db.commit()

        return {
            "fichero_id": fichero.id,
            "estado": estado_previo,
            "tipo_fichero": tipo,
            **resultado,
            "error": None,
        }
    except Exception as e:
        db.rollback()
        # Marcar el fichero con el error
        fichero.parsed = False
        fichero.parse_error = f"{type(e).__name__}: {e}"
        db.commit()
        return {
            "fichero_id": fichero.id,
            "estado": "error",
            "tipo_fichero": tipo,
            "medidas_insertadas": 0,
            "concentradores_upsert": 0,
            "contadores_upsert": 0,
            "error": f"{type(e).__name__}: {e}",
        }


def parsear_pendientes(
    db: Session,
    user: User,
    empresa_id: int,
    limite: int = 10,
) -> dict:
    """
    Parsea en bulk hasta `limite` ficheros pendientes (parsed=False) de una empresa.
    """
    assert_empresa_access(db, user, empresa_id)

    pendientes_antes = (
        db.query(FicheroRecibido)
        .filter(
            FicheroRecibido.empresa_id == empresa_id,
            FicheroRecibido.parsed == False,    # noqa: E712
        )
        .count()
    )

    pendientes = (
        db.query(FicheroRecibido)
        .filter(
            FicheroRecibido.empresa_id == empresa_id,
            FicheroRecibido.parsed == False,    # noqa: E712
        )
        .order_by(FicheroRecibido.id.asc())
        .limit(limite)
        .all()
    )

    parseados = 0
    skipped = 0
    errores = 0
    detalle = []

    for f in pendientes:
        nombre = f.nombre_original
        res = parsear_fichero(db, user, f.id)
        detalle.append({
            "fichero_id": f.id,
            "nombre": nombre,
            "tipo_fichero": res.get("tipo_fichero"),
            "estado": res.get("estado"),
            "medidas_insertadas": res.get("medidas_insertadas", 0),
            "concentradores_upsert": res.get("concentradores_upsert", 0),
            "contadores_upsert": res.get("contadores_upsert", 0),
            "error": res.get("error"),
        })
        if res.get("estado") == "parseado" or res.get("estado") == "ya_parseado_reprocesado":
            parseados += 1
        elif res.get("estado") == "skipped_tipo_no_soportado":
            skipped += 1
        else:
            errores += 1

    return {
        "empresa_id": empresa_id,
        "pendientes_antes": pendientes_antes,
        "procesados": len(pendientes),
        "limite_usado": limite,
        "parseados": parseados,
        "skipped": skipped,
        "errores": errores,
        "detalle": detalle,
    }


def listar_contadores_detectados(
    db: Session,
    user: User,
    empresa_id: int,
) -> dict:
    """
    Lista los contadores detectados en BD para una empresa, con info del concentrador.
    """
    assert_empresa_access(db, user, empresa_id)

    contadores = (
        db.query(Contador)
        .filter(Contador.empresa_id == empresa_id)
        .order_by(Contador.meter_id.asc())
        .all()
    )

    items = []
    for ct in contadores:
        items.append({
            "id": ct.id,
            "empresa_id": ct.empresa_id,
            "concentrador_id": ct.concentrador_id,
            "cups_id": ct.cups_id,
            "meter_id": ct.meter_id,
            "fabricante": ct.fabricante,
            "ultimo_contacto": ct.ultimo_contacto,
            "estado_comunicacion": ct.estado_comunicacion,
            "activo": ct.activo,
            "concentrador_codigo_ct": ct.concentrador.codigo_ct if ct.concentrador else None,
            "created_at": ct.created_at,
            "updated_at": ct.updated_at,
        })

    return {
        "total": len(items),
        "items": items,
    }


def listar_eventos_humanizados(
    db: Session,
    user: User,
    empresa_id: int,
    meter_id: Optional[str] = None,
    fecha_desde: Optional[datetime] = None,
    fecha_hasta: Optional[datetime] = None,
    limite: int = 100,
    offset: int = 0,
) -> dict:
    """
    Devuelve eventos S09 enriquecidos con descripciones humanas en español.

    Cada evento (Medida con tipo_fichero='S09') guarda en `datos` JSONB:
      { 'event_group': int, 'event_code': int, ... }

    Usamos `event_descriptions.describir_evento_meter` para traducir
    esos códigos a texto humano usando los diccionarios oficiales de
    primestg. La traducción se hace al renderizar (NO se persiste en BD).

    Soporta:
      - Filtro por meter_id (contador concreto)
      - Filtro por rango de fechas
      - Paginación (limite + offset, capped a 1000)

    Devuelve además un `resumen_top` con los 10 tipos de evento más
    frecuentes en el filtro aplicado (sin paginar).
    """
    from app.stg.event_descriptions import describir_evento_meter

    assert_empresa_access(db, user, empresa_id)

    # Limites defensivos
    limite = max(1, min(int(limite), 1000))
    offset = max(0, int(offset))

    # Base query: solo S09 de esta empresa
    base = db.query(Medida).filter(
        Medida.empresa_id == empresa_id,
        Medida.tipo_fichero == "S09",
    )
    if meter_id:
        base = base.filter(Medida.meter_id == meter_id)
    if fecha_desde:
        base = base.filter(Medida.timestamp_dato >= fecha_desde)
    if fecha_hasta:
        base = base.filter(Medida.timestamp_dato <= fecha_hasta)

    # Total sin paginación (para que el frontend pueda mostrar conteo)
    total = base.count()

    # Items paginados
    rows = (
        base.order_by(Medida.timestamp_dato.desc().nullslast(), Medida.id.desc())
        .offset(offset)
        .limit(limite)
        .all()
    )

    items = []
    for m in rows:
        datos = m.datos or {}
        info = describir_evento_meter(
            datos.get("event_group"),
            datos.get("event_code"),
        )
        items.append({
            "id": m.id,
            "meter_id": m.meter_id,
            "concentrador_externo_id": m.concentrador_externo_id,
            "timestamp_dato": m.timestamp_dato,
            "grupo": info["grupo"],
            "codigo": info["codigo"],
            "descripcion_grupo": info["descripcion_grupo"],
            "descripcion_evento": info["descripcion_evento"],
            "season": datos.get("season"),
        })

    # Resumen: top 10 tipos (grupo+codigo) más frecuentes en el filtro
    # (no en la página, sino en TODO el conjunto filtrado).
    from sqlalchemy import func as sa_func, cast, Integer

    resumen_q = (
        db.query(
            cast(Medida.datos["event_group"].astext, Integer).label("g"),
            cast(Medida.datos["event_code"].astext, Integer).label("c"),
            sa_func.count(Medida.id).label("n"),
        )
        .filter(
            Medida.empresa_id == empresa_id,
            Medida.tipo_fichero == "S09",
        )
    )
    if meter_id:
        resumen_q = resumen_q.filter(Medida.meter_id == meter_id)
    if fecha_desde:
        resumen_q = resumen_q.filter(Medida.timestamp_dato >= fecha_desde)
    if fecha_hasta:
        resumen_q = resumen_q.filter(Medida.timestamp_dato <= fecha_hasta)

    resumen_q = (
        resumen_q
        .group_by("g", "c")
        .order_by(sa_func.count(Medida.id).desc())
        .limit(10)
    )

    resumen_top = []
    for g, c, n in resumen_q.all():
        info = describir_evento_meter(g, c)
        resumen_top.append({
            "grupo": info["grupo"],
            "codigo": info["codigo"],
            "descripcion_grupo": info["descripcion_grupo"],
            "descripcion_evento": info["descripcion_evento"],
            "ocurrencias": n,
        })

    return {
        "empresa_id": empresa_id,
        "total": total,
        "offset": offset,
        "limite": limite,
        "items": items,
        "resumen_top": resumen_top,
    }
