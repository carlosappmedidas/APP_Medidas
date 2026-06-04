# app/stg/gisce/services.py
# pyright: reportMissingImports=false
"""CRUD config GISCE + test de conexion. Sin preview/import aun."""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.core.crypto import cifrar_password, descifrar_password
from app.stg.models import StgGisceConfig

from .client import (
    GisceAuthError,
    GisceClient,
    GisceConnectionError,
    GisceError,
)
from .schemas import GisceConfigIn, GisceTestResult

def _limpiar_host(host: str) -> str:
    """Quita esquema (http://, https://) y trailing slash del host."""
    h = (host or "").strip()
    if h.startswith("https://"):
        h = h[len("https://"):]
    elif h.startswith("http://"):
        h = h[len("http://"):]
    return h.rstrip("/")


def leer_config(db: Session, empresa_id: int) -> Optional[StgGisceConfig]:
    return (
        db.query(StgGisceConfig)
        .filter(StgGisceConfig.empresa_id == empresa_id)
        .one_or_none()
    )


def guardar_config(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    payload: GisceConfigIn,
) -> StgGisceConfig:
    cfg = leer_config(db, empresa_id)
    pwd_cifrado = cifrar_password(payload.password)

    if cfg is None:
        cfg = StgGisceConfig(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre=payload.nombre,
            host=_limpiar_host(payload.host),
            puerto=payload.puerto,
            database=payload.database,
            usuario=payload.usuario,
            password_cifrado=pwd_cifrado,
            activo=payload.activo,
            estado="no_probado",
        )
        db.add(cfg)
    else:
        cfg.nombre = payload.nombre
        cfg.host = _limpiar_host(payload.host)
        cfg.puerto = payload.puerto
        cfg.database = payload.database
        cfg.usuario = payload.usuario
        cfg.password_cifrado = pwd_cifrado
        cfg.activo = payload.activo
        # Al cambiar credenciales, invalidamos el estado anterior
        cfg.estado = "no_probado"
        cfg.ultimo_error = None

    db.commit()
    db.refresh(cfg)
    return cfg


def _build_client_from_config(cfg: StgGisceConfig) -> GisceClient:
    pwd_claro = descifrar_password(cfg.password_cifrado)
    return GisceClient(
        url=f"http://{_limpiar_host(cfg.host)}:{cfg.puerto}",
        database=cfg.database,
        usuario=cfg.usuario,
        password=pwd_claro,
    )


def probar_conexion(db: Session, empresa_id: int) -> GisceTestResult:
    cfg = leer_config(db, empresa_id)
    if cfg is None:
        return GisceTestResult(
            ok=False,
            estado="error",
            mensaje="No hay configuracion GISCE guardada para esta empresa.",
        )

    cli = _build_client_from_config(cfg)
    try:
        uid = cli.login()
    except GisceAuthError as exc:
        cfg.estado = "error"
        cfg.ultimo_error = str(exc)
        db.commit()
        return GisceTestResult(
            ok=False, estado="error",
            mensaje="Credenciales rechazadas por GISCE.",
            detalle=str(exc),
        )
    except GisceConnectionError as exc:
        cfg.estado = "error"
        cfg.ultimo_error = str(exc)
        db.commit()
        return GisceTestResult(
            ok=False, estado="error",
            mensaje="No se pudo contactar con el servidor GISCE.",
            detalle=str(exc),
        )
    except GisceError as exc:
        cfg.estado = "error"
        cfg.ultimo_error = str(exc)
        db.commit()
        return GisceTestResult(
            ok=False, estado="error",
            mensaje="Error desconocido al conectar con GISCE.",
            detalle=str(exc),
        )

    cfg.estado = "ok"
    cfg.ultimo_error = None
    db.commit()
    return GisceTestResult(
        ok=True, uid=uid, estado="ok",
        mensaje=f"Conexion correcta. uid={uid}",
    )
