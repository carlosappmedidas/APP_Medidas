# app/stg/services.py
# pyright: reportMissingImports=false
"""
Lógica de negocio del módulo STG.

Todos los métodos respetan multi-tenant + multi-empresa usando el módulo
`app.core.permissions` (igual que el resto de módulos de la app).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

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
# SFTP — listado de ficheros (Paquete 3)
# ---------------------------------------------------------------------------
def listar_ficheros_sftp(
    db: Session,
    user: User,
    empresa_id: int,
    filtro_patron: Optional[str] = None,
) -> dict:
    """
    Lista ficheros disponibles en la carpeta_recepcion del SFTP de la empresa.

    Solo aplica si la conexión configurada es de tipo "sftp". Para otros tipos
    devuelve un dict vacío con mensaje aclaratorio.
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
    if conf.tipo != "sftp":
        return {
            "empresa_id": empresa_id,
            "ruta_consultada": "",
            "total": 0,
            "items": [],
        }

    adapter = get_adapter_for_empresa(db, empresa_id)
    # adapter es un SftpStgAdapter porque conf.tipo == "sftp"
    resultado = adapter.listar_ficheros(filtro_patron=filtro_patron)
    return {
        "empresa_id": empresa_id,
        **resultado,
    }
