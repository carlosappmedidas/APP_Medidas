# app/measures/descarga/automatizacion/services_alertas.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false

"""
Servicio de CRUD + upsert de alertas de publicaciones REE.

Funciones públicas:
  - upsert_alerta:        crea o actualiza una alerta por (empresa × tipo × periodo).
  - listar_alertas:       devuelve alertas filtradas (estado, empresa, periodo, tipo).
  - descartar_alerta:     marca una alerta como "descartada".
  - resolver_alerta:      marca una alerta como "resuelta".
  - contar_activas:       resumen compacto para la campanita.

Patrón clonado de app/objeciones/automatizacion/services_alertas.py.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from app.measures.descarga.automatizacion.models import PublicacionesAlerta


# ═════════════════════════════════════════════════════════════════════════════
# UPSERT
# ═════════════════════════════════════════════════════════════════════════════

def upsert_alerta(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    tipo: str,
    periodo: str,
    fecha_hito: Optional[datetime],
    num_pendientes: int,
    detalle: Optional[List[Any]] = None,
    severidad: str = "info",
) -> PublicacionesAlerta:
    """
    Crea o actualiza una alerta de publicaciones REE.

    Clave de unicidad: (tenant_id, empresa_id, tipo, periodo).
    Si ya existía y estaba "resuelta"/"descartada", se reactiva → "activa".
    """
    alerta = (
        db.query(PublicacionesAlerta)
        .filter(
            PublicacionesAlerta.tenant_id  == tenant_id,
            PublicacionesAlerta.empresa_id == empresa_id,
            PublicacionesAlerta.tipo       == tipo,
            PublicacionesAlerta.periodo    == periodo,
        )
        .first()
    )

    detalle_serializado = json.dumps(detalle, ensure_ascii=False) if detalle else None

    if alerta is None:
        alerta = PublicacionesAlerta(
            tenant_id      = tenant_id,
            empresa_id     = empresa_id,
            tipo           = tipo,
            periodo        = periodo,
            fecha_hito     = fecha_hito,
            num_pendientes = num_pendientes,
            detalle_json   = detalle_serializado,
            severidad      = severidad,
            estado         = "activa",
        )
        db.add(alerta)
    else:
        alerta.fecha_hito     = fecha_hito           # type: ignore[assignment]
        alerta.num_pendientes = num_pendientes       # type: ignore[assignment]
        alerta.detalle_json   = detalle_serializado  # type: ignore[assignment]
        alerta.severidad      = severidad            # type: ignore[assignment]
        if str(alerta.estado) in ("resuelta", "descartada"):
            alerta.estado      = "activa"  # type: ignore[assignment]
            alerta.resuelta_at = None      # type: ignore[assignment]
            alerta.resuelta_by = None      # type: ignore[assignment]

    db.commit()
    db.refresh(alerta)
    return alerta


# ═════════════════════════════════════════════════════════════════════════════
# LISTAR
# ═════════════════════════════════════════════════════════════════════════════

def listar_alertas(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: List[int],
    estado: Optional[str] = None,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
    tipo: Optional[str] = None,
) -> List[PublicacionesAlerta]:
    """Lista alertas filtrando opcionalmente. Más recientes primero."""
    if not allowed_empresa_ids:
        return []
    q = db.query(PublicacionesAlerta).filter(
        PublicacionesAlerta.tenant_id == tenant_id,
        PublicacionesAlerta.empresa_id.in_(allowed_empresa_ids),
    )
    if estado:
        q = q.filter(PublicacionesAlerta.estado == estado)
    if empresa_id:
        q = q.filter(PublicacionesAlerta.empresa_id == empresa_id)
    if periodo:
        q = q.filter(PublicacionesAlerta.periodo == periodo)
    if tipo:
        q = q.filter(PublicacionesAlerta.tipo == tipo)
    return q.order_by(PublicacionesAlerta.created_at.desc()).all()


# ═════════════════════════════════════════════════════════════════════════════
# DESCARTAR / RESOLVER
# ═════════════════════════════════════════════════════════════════════════════

def _cambiar_estado(
    db: Session,
    *,
    alert_id: int,
    tenant_id: int,
    nuevo_estado: str,
    user_id: Optional[int],
) -> PublicacionesAlerta:
    alerta = (
        db.query(PublicacionesAlerta)
        .filter(
            PublicacionesAlerta.id        == alert_id,
            PublicacionesAlerta.tenant_id == tenant_id,
        )
        .first()
    )
    if alerta is None:
        raise ValueError(f"Alerta {alert_id} no encontrada.")

    alerta.estado      = nuevo_estado        # type: ignore[assignment]
    alerta.resuelta_at = datetime.utcnow()   # type: ignore[assignment]
    alerta.resuelta_by = user_id             # type: ignore[assignment]

    db.commit()
    db.refresh(alerta)
    return alerta


def descartar_alerta(
    db: Session,
    *,
    alert_id: int,
    tenant_id: int,
    user_id: Optional[int],
) -> PublicacionesAlerta:
    """Marca una alerta como 'descartada'."""
    return _cambiar_estado(db, alert_id=alert_id, tenant_id=tenant_id,
                            nuevo_estado="descartada", user_id=user_id)


def resolver_alerta(
    db: Session,
    *,
    alert_id: int,
    tenant_id: int,
    user_id: Optional[int],
) -> PublicacionesAlerta:
    """Marca una alerta como 'resuelta'."""
    return _cambiar_estado(db, alert_id=alert_id, tenant_id=tenant_id,
                            nuevo_estado="resuelta", user_id=user_id)


# ═════════════════════════════════════════════════════════════════════════════
# RESUMEN COMPACTO (para la campanita)
# ═════════════════════════════════════════════════════════════════════════════

def contar_activas(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: List[int],
) -> int:
    """Devuelve cuántas alertas activas hay (para el badge de la campanita)."""
    if not allowed_empresa_ids:
        return 0
    return (
        db.query(PublicacionesAlerta)
        .filter(
            PublicacionesAlerta.tenant_id  == tenant_id,
            PublicacionesAlerta.empresa_id.in_(allowed_empresa_ids),
            PublicacionesAlerta.estado     == "activa",
        )
        .count()
    )