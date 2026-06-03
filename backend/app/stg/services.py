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

    cups_total = db.query(func.count(Cups.id)).filter(
        Cups.empresa_id == empresa_id, Cups.activo.is_(True)
    ).scalar() or 0

    cups_online = db.query(func.count(Cups.id)).filter(
        Cups.empresa_id == empresa_id,
        Cups.activo.is_(True),
        Cups.estado_comunicacion == "online",
    ).scalar() or 0

    cups_offline = db.query(func.count(Cups.id)).filter(
        Cups.empresa_id == empresa_id,
        Cups.activo.is_(True),
        Cups.estado_comunicacion == "offline",
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
# CIRR del fabricante Circutor:
#   CIRR208251006614_0_G97_0_20260306120530
#   CIRR<ID_CONTADOR>_<COD>_<TIPO_MENSAJE>_<NUM>_<YYYYMMDDHHMMSS>
_CIRR_RE = re.compile(
    r"^CIRR(?P<id_contador>\d+)_[^_]+_(?P<tipo>[A-Z0-9]+)_\d+_"
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
