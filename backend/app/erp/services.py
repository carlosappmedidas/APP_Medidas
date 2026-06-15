# app/erp/services.py
# pyright: reportArgumentType=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportCallIssue=false, reportAttributeAccessIssue=false, reportAssignmentType=false
"""
Servicios de negocio del módulo ERP.

Paq E-2: CRUD del titular (erp_titular).

Patrón multi-tenant idéntico al resto de la app: cada operación valida el
acceso con assert_empresa_access(db, user, empresa_id) antes de tocar datos.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.permissions import assert_empresa_access
from app.erp.models import ErpTitular
from app.erp.schemas import ErpTitularCreate, ErpTitularUpdate
from app.tenants.models import User


# ============================================================
# Helpers
# ============================================================
def _ahora_madrid_naive() -> datetime:
    """datetime Madrid sin tzinfo (consistente con el resto del codebase)."""
    return datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)


def _cargar_titular_con_acceso(
    db: Session, user: User, titular_id: int
) -> ErpTitular:
    """
    Carga un titular y valida el acceso multi-tenant por su empresa.

    Raises:
        ValueError: titular no encontrado.
        HTTPException 403: assert_empresa_access falla.
    """
    t = (
        db.query(ErpTitular)
        .filter(ErpTitular.id == titular_id)
        .first()
    )
    if t is None:
        raise ValueError(f"Titular {titular_id} no encontrado")
    assert_empresa_access(db, user, t.empresa_id)
    return t


# ============================================================
# CRUD
# ============================================================
def listar_titulares(
    db: Session,
    user: User,
    empresa_id: int,
    search: Optional[str] = None,
    solo_activos: bool = False,
) -> list[ErpTitular]:
    """Lista titulares de una empresa. Filtro opcional por texto y por activos."""
    assert_empresa_access(db, user, empresa_id)

    q = db.query(ErpTitular).filter(ErpTitular.empresa_id == empresa_id)

    if solo_activos:
        q = q.filter(ErpTitular.activo.is_(True))

    if search:
        patron = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpTitular.nombre.ilike(patron),
                ErpTitular.nif_cif.ilike(patron),
                ErpTitular.codigo_interno.ilike(patron),
            )
        )

    return q.order_by(ErpTitular.nombre.asc()).all()


def obtener_titular(db: Session, user: User, titular_id: int) -> ErpTitular:
    """Devuelve un titular validando acceso. Lanza ValueError si no existe."""
    return _cargar_titular_con_acceso(db, user, titular_id)


def crear_titular(
    db: Session, user: User, empresa_id: int, payload: ErpTitularCreate
) -> ErpTitular:
    """Crea un titular en la empresa indicada."""
    assert_empresa_access(db, user, empresa_id)

    now = _ahora_madrid_naive()
    data = payload.model_dump()

    titular = ErpTitular(
        tenant_id=user.tenant_id,
        empresa_id=empresa_id,
        created_at=now,
        updated_at=now,
        **data,
    )
    db.add(titular)
    db.commit()
    db.refresh(titular)
    return titular


def actualizar_titular(
    db: Session, user: User, titular_id: int, payload: ErpTitularUpdate
) -> ErpTitular:
    """Actualiza solo los campos enviados (los no enviados se dejan igual)."""
    titular = _cargar_titular_con_acceso(db, user, titular_id)

    data = payload.model_dump(exclude_unset=True)
    for campo, valor in data.items():
        setattr(titular, campo, valor)

    titular.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(titular)
    return titular


def desactivar_titular(db: Session, user: User, titular_id: int) -> ErpTitular:
    """Baja lógica: marca activo=False (no borra el registro)."""
    titular = _cargar_titular_con_acceso(db, user, titular_id)
    titular.activo = False
    titular.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(titular)
    return titular

# ===========================================================================
# Suministro (CUPS)  — Paq E-2 (vertical suministro)
# ===========================================================================
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.erp.models import ErpSuministro
from app.erp.schemas import ErpSuministroCreate, ErpSuministroUpdate


class DuplicateCupsError(ValueError):
    """CUPS ya existente para esa empresa (UniqueConstraint empresa_id+cups)."""
    pass


def _cargar_suministro_con_acceso(
    db: Session, user: User, suministro_id: int
) -> ErpSuministro:
    """Carga suministro y valida acceso multi-tenant. ValueError si no existe."""
    s = (
        db.query(ErpSuministro)
        .filter(ErpSuministro.id == suministro_id)
        .first()
    )
    if s is None:
        raise ValueError(f"Suministro {suministro_id} no encontrado")
    assert_empresa_access(db, user, s.empresa_id)
    return s


def listar_suministros(
    db: Session,
    user: User,
    empresa_id: int,
    search: str | None = None,
    solo_activos: bool = False,
):
    assert_empresa_access(db, user, empresa_id)
    q = db.query(ErpSuministro).filter(ErpSuministro.empresa_id == empresa_id)
    if solo_activos:
        q = q.filter(ErpSuministro.activo.is_(True))
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpSuministro.cups.ilike(like),
                ErpSuministro.dir_municipio.ilike(like),
                ErpSuministro.distribuidora.ilike(like),
            )
        )
    return q.order_by(ErpSuministro.cups).all()


def obtener_suministro(db: Session, user: User, suministro_id: int) -> ErpSuministro:
    return _cargar_suministro_con_acceso(db, user, suministro_id)


def crear_suministro(
    db: Session, user: User, empresa_id: int, payload: ErpSuministroCreate
) -> ErpSuministro:
    assert_empresa_access(db, user, empresa_id)

    # CUPS único por empresa (pre-check + constraint como red de seguridad)
    existe = (
        db.query(ErpSuministro)
        .filter(
            ErpSuministro.empresa_id == empresa_id,
            ErpSuministro.cups == payload.cups,
        )
        .first()
    )
    if existe is not None:
        raise DuplicateCupsError(
            f"Ya existe un suministro con CUPS {payload.cups} en esta empresa"
        )

    ahora = _ahora_madrid_naive()
    s = ErpSuministro(
        tenant_id=user.tenant_id,
        empresa_id=empresa_id,
        created_at=ahora,
        updated_at=ahora,
        **payload.model_dump(),
    )
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateCupsError(
            f"Ya existe un suministro con CUPS {payload.cups} en esta empresa"
        )
    db.refresh(s)
    return s


def actualizar_suministro(
    db: Session, user: User, suministro_id: int, payload: ErpSuministroUpdate
) -> ErpSuministro:
    s = _cargar_suministro_con_acceso(db, user, suministro_id)
    datos = payload.model_dump(exclude_unset=True)

    nuevo_cups = datos.get("cups")
    if nuevo_cups is not None and nuevo_cups != s.cups:
        existe = (
            db.query(ErpSuministro)
            .filter(
                ErpSuministro.empresa_id == s.empresa_id,
                ErpSuministro.cups == nuevo_cups,
                ErpSuministro.id != s.id,
            )
            .first()
        )
        if existe is not None:
            raise DuplicateCupsError(
                f"Ya existe un suministro con CUPS {nuevo_cups} en esta empresa"
            )

    for campo, valor in datos.items():
        setattr(s, campo, valor)
    s.updated_at = _ahora_madrid_naive()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateCupsError(
            f"Ya existe un suministro con CUPS {nuevo_cups} en esta empresa"
        )
    db.refresh(s)
    return s


def desactivar_suministro(
    db: Session, user: User, suministro_id: int
) -> ErpSuministro:
    """Baja lógica (activo=False)."""
    s = _cargar_suministro_con_acceso(db, user, suministro_id)
    s.activo = False
    s.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(s)
    return s
