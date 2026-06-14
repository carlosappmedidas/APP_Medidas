# app/stg/wsprime/services.py
# pyright: reportArgumentType=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportCallIssue=false, reportAttributeAccessIssue=false, reportAssignmentType=false

"""
Servicios de negocio WS-PRIME.

Patron multi-tenant: cada operacion carga el concentrador, deduce su
empresa_id y valida con assert_empresa_access(db, user, empresa_id).
Sigue el mismo patron que el resto de endpoints STG con
{concentrador_id} en el path (lineas 77, 340 de app/stg/routes.py).
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.crypto import cifrar_password, descifrar_password
from app.core.permissions import assert_empresa_access
from app.stg.models import StgConcentrador
from app.stg.wsprime.factory import get_adapter
from app.stg.wsprime.models import StgWsPrimeConfig
from app.stg.wsprime.schemas import (
    WsPrimeConfigCreate,
    WsPrimeConfigUpdate,
)
from app.tenants.models import User


# ============================================================
# Helpers
# ============================================================
def _ahora_madrid_naive() -> datetime:
    """datetime Madrid sin tzinfo (consistente con el resto del codebase)."""
    return datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)


def _cargar_concentrador_con_acceso(
    db: Session, user: User, concentrador_id: int
) -> StgConcentrador:
    """
    Carga concentrador y valida acceso multi-tenant.

    Raises:
        ValueError: concentrador no encontrado.
        HTTPException 403: assert_empresa_access falla.
    """
    c = (
        db.query(StgConcentrador)
        .filter(StgConcentrador.id == concentrador_id)
        .first()
    )
    if c is None:
        raise ValueError(f"Concentrador {concentrador_id} no encontrado")
    assert_empresa_access(db, user, c.empresa_id)
    return c


# ============================================================
# CRUD
# ============================================================
def crear_config(
    db: Session, user: User, payload: WsPrimeConfigCreate
) -> StgWsPrimeConfig:
    """
    Crea config WS-PRIME para un concentrador.

    Raises:
        ValueError: concentrador no existe o ya tiene config.
    """
    concentrador = _cargar_concentrador_con_acceso(
        db, user, payload.concentrador_id
    )

    # Comprobar que no exista ya
    existente = (
        db.query(StgWsPrimeConfig)
        .filter(StgWsPrimeConfig.concentrador_id == concentrador.id)
        .first()
    )
    if existente is not None:
        raise ValueError(
            f"Concentrador {concentrador.id} ya tiene configuracion WS-PRIME"
        )

    now = _ahora_madrid_naive()

    cfg = StgWsPrimeConfig(
        tenant_id=user.tenant_id,
        empresa_id=concentrador.empresa_id,
        concentrador_id=concentrador.id,
        fabricante=payload.fabricante,
        url=str(payload.url),
        usuario=payload.usuario,
        password_cifrado=cifrar_password(payload.password),
        timeout_segundos=payload.timeout_segundos,
        verify_ssl=payload.verify_ssl,
        activo=payload.activo,
        created_at=now,
        updated_at=now,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def obtener_config(
    db: Session, user: User, concentrador_id: int
) -> StgWsPrimeConfig | None:
    """Lee config asociada al concentrador. None si no existe."""
    _cargar_concentrador_con_acceso(db, user, concentrador_id)
    return (
        db.query(StgWsPrimeConfig)
        .filter(StgWsPrimeConfig.concentrador_id == concentrador_id)
        .first()
    )


def actualizar_config(
    db: Session,
    user: User,
    concentrador_id: int,
    payload: WsPrimeConfigUpdate,
) -> StgWsPrimeConfig:
    """Actualiza campos != None. Cifra password si viene."""
    _cargar_concentrador_con_acceso(db, user, concentrador_id)

    cfg = (
        db.query(StgWsPrimeConfig)
        .filter(StgWsPrimeConfig.concentrador_id == concentrador_id)
        .first()
    )
    if cfg is None:
        raise ValueError(
            f"Concentrador {concentrador_id} no tiene configuracion WS-PRIME"
        )

    data = payload.model_dump(exclude_none=True)

    # Tratamiento especial: cifrar password antes de guardar
    if "password" in data:
        cfg.password_cifrado = cifrar_password(data.pop("password"))

    # HttpUrl -> str
    if "url" in data:
        cfg.url = str(data.pop("url"))

    # Aplicar el resto de campos
    for key, value in data.items():
        setattr(cfg, key, value)

    cfg.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(cfg)
    return cfg


def borrar_config(db: Session, user: User, concentrador_id: int) -> None:
    """Idempotente: no falla si no existe."""
    _cargar_concentrador_con_acceso(db, user, concentrador_id)
    cfg = (
        db.query(StgWsPrimeConfig)
        .filter(StgWsPrimeConfig.concentrador_id == concentrador_id)
        .first()
    )
    if cfg is None:
        return
    db.delete(cfg)
    db.commit()


# ============================================================
# Operaciones via adapter
# ============================================================
def _build_adapter_from_config(cfg: StgWsPrimeConfig):
    """Construye adapter descifrando la password."""
    return get_adapter(
        fabricante=cfg.fabricante,
        url=cfg.url,
        usuario=cfg.usuario,
        password=descifrar_password(cfg.password_cifrado),
        timeout=cfg.timeout_segundos,
        verify_ssl=cfg.verify_ssl,
    )


def test_conexion(db: Session, user: User, concentrador_id: int) -> dict:
    """
    Ejecuta test de conexion y persiste resultado en ultima_conexion_*.

    Raises:
        ValueError: no hay config para ese concentrador.
    """
    _cargar_concentrador_con_acceso(db, user, concentrador_id)

    cfg = (
        db.query(StgWsPrimeConfig)
        .filter(StgWsPrimeConfig.concentrador_id == concentrador_id)
        .first()
    )
    if cfg is None:
        raise ValueError(
            f"Concentrador {concentrador_id} no tiene configuracion WS-PRIME"
        )

    adapter = _build_adapter_from_config(cfg)
    resultado = adapter.test_conexion()

    # Persistir resultado del ultimo test
    cfg.ultima_conexion_at = _ahora_madrid_naive()
    cfg.ultima_conexion_ok = bool(resultado.get("ok"))
    cfg.ultima_conexion_error = (
        None if resultado.get("ok") else str(resultado.get("mensaje", ""))
    )
    cfg.updated_at = cfg.ultima_conexion_at
    db.commit()

    return resultado


def leer_info_general(
    db: Session,
    user: User,
    concentrador_id: int,
    meter_id: str | None = None,
) -> dict:
    """Lee info general via adapter. NO persiste nada."""
    _cargar_concentrador_con_acceso(db, user, concentrador_id)

    cfg = (
        db.query(StgWsPrimeConfig)
        .filter(StgWsPrimeConfig.concentrador_id == concentrador_id)
        .first()
    )
    if cfg is None:
        raise ValueError(
            f"Concentrador {concentrador_id} no tiene configuracion WS-PRIME"
        )

    adapter = _build_adapter_from_config(cfg)
    return adapter.leer_info_general(meter_id=meter_id)