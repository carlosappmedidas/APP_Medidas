# app/erp/migraciones/estado.py
"""
Estado de la migración de una empresa (E-12 fase corrección).

Una fila ErpMigracion por empresa. Mientras estado='en_curso', el importer
actualiza los registros existentes con los campos no vacíos del Excel
(corrección de carga, sin versionar). Al cerrar, vuelve a insert-only.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.core.permissions import assert_empresa_access
from app.erp.models import ErpMigracion
from app.tenants.models import User

EN_CURSO = "en_curso"
CERRADA = "cerrada"


def obtener(db: Session, empresa_id: int) -> ErpMigracion | None:
    """Devuelve la fila de migración de la empresa (o None si nunca se inició)."""
    return db.query(ErpMigracion).filter(ErpMigracion.empresa_id == empresa_id).first()


def en_correccion(db: Session, empresa_id: int) -> bool:
    """True si la empresa tiene una migración 'en_curso' (modo corrección activo)."""
    m = obtener(db, empresa_id)
    return bool(m and m.estado == EN_CURSO)


def iniciar(db: Session, user: User, empresa_id: int) -> ErpMigracion:
    """
    Inicia (o reabre) la ventana de corrección de la empresa.
    Idempotente: si ya existe, la pone en 'en_curso' y limpia la fecha de cierre.
    """
    assert_empresa_access(db, user, empresa_id)
    m = obtener(db, empresa_id)
    if m is None:
        m = ErpMigracion(
            tenant_id=user.tenant_id,
            empresa_id=empresa_id,
            estado=EN_CURSO,
            fecha_inicio=date.today(),
            usuario_inicio_id=user.id,
        )
        db.add(m)
    else:
        m.estado = EN_CURSO
        m.fecha_inicio = m.fecha_inicio or date.today()
        m.fecha_cierre = None
        m.usuario_inicio_id = user.id
    db.commit()
    db.refresh(m)
    return m


def cerrar(db: Session, user: User, empresa_id: int) -> ErpMigracion:
    """Cierra la ventana de corrección: el importer vuelve a insert-only."""
    assert_empresa_access(db, user, empresa_id)
    m = obtener(db, empresa_id)
    if m is None:
        m = ErpMigracion(
            tenant_id=user.tenant_id,
            empresa_id=empresa_id,
            estado=CERRADA,
            fecha_cierre=date.today(),
            usuario_cierre_id=user.id,
        )
        db.add(m)
    else:
        m.estado = CERRADA
        m.fecha_cierre = date.today()
        m.usuario_cierre_id = user.id
    db.commit()
    db.refresh(m)
    return m


def as_dict(m: ErpMigracion | None) -> dict:
    """Serialización ligera para el endpoint de estado."""
    if m is None:
        return {"estado": "sin_iniciar", "fecha_inicio": None, "fecha_cierre": None}
    return {
        "estado": m.estado,
        "fecha_inicio": m.fecha_inicio.isoformat() if m.fecha_inicio else None,
        "fecha_cierre": m.fecha_cierre.isoformat() if m.fecha_cierre else None,
    }
