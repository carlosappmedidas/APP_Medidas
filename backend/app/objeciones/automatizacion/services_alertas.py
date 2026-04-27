# app/objeciones/automatizacion/services_alertas.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false

"""
Servicio de CRUD + upsert de alertas de objeciones.

Funciones públicas:
  - upsert_alerta:        crea o actualiza una alerta por (empresa × tipo × periodo).
                          Usada por el job de automatización.
  - listar_alertas:       devuelve alertas filtradas (por estado, empresa, periodo).
                          Usada por el endpoint GET /objeciones/alertas.
  - descartar_alerta:     marca una alerta como "descartada".
  - resolver_alerta:      marca una alerta como "resuelta".
  - contar_alertas_activas: resumen compacto para el banner del Dashboard.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from app.objeciones.automatizacion.models import ObjecionesAlerta


# ═════════════════════════════════════════════════════════════════════════════
# UPSERT (usado por el job)
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
    severidad: str = "warning",
) -> ObjecionesAlerta:
    """
    Crea o actualiza una alerta de objeciones.

    La clave de unicidad es (tenant_id, empresa_id, tipo, periodo) — así
    evitamos duplicados si el job se ejecuta varias veces para el mismo
    hito dentro de la ventana de seguridad.

    Si la alerta ya existe:
      - Actualiza los datos (num_pendientes, detalle, fecha_hito).
      - Si estaba "resuelta" o "descartada", la reactiva → "activa".
    Si no existe:
      - La crea nueva con estado "activa".
    """
    alerta = (
        db.query(ObjecionesAlerta)
        .filter(
            ObjecionesAlerta.tenant_id  == tenant_id,
            ObjecionesAlerta.empresa_id == empresa_id,
            ObjecionesAlerta.tipo       == tipo,
            ObjecionesAlerta.periodo    == periodo,
        )
        .first()
    )

    detalle_serializado = json.dumps(detalle, ensure_ascii=False) if detalle else None

    if alerta is None:
        alerta = ObjecionesAlerta(
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
        alerta.fecha_hito     = fecha_hito          # type: ignore[assignment]
        alerta.num_pendientes = num_pendientes      # type: ignore[assignment]
        alerta.detalle_json   = detalle_serializado # type: ignore[assignment]
        alerta.severidad      = severidad           # type: ignore[assignment]
        # Reactivar si había sido cerrada manualmente.
        if str(alerta.estado) in ("resuelta", "descartada"):
            alerta.estado      = "activa"           # type: ignore[assignment]
            alerta.resuelta_at = None               # type: ignore[assignment]
            alerta.resuelta_by = None               # type: ignore[assignment]

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
) -> List[ObjecionesAlerta]:
    """
    Lista alertas del tenant filtrando opcionalmente por estado, empresa,
    periodo y tipo. Orden: más recientes primero.
    """
    if not allowed_empresa_ids:
        return []
    q = db.query(ObjecionesAlerta).filter(
        ObjecionesAlerta.tenant_id == tenant_id,
        ObjecionesAlerta.empresa_id.in_(allowed_empresa_ids),
    )
    if estado:
        q = q.filter(ObjecionesAlerta.estado == estado)
    if empresa_id:
        q = q.filter(ObjecionesAlerta.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionesAlerta.periodo == periodo)
    if tipo:
        q = q.filter(ObjecionesAlerta.tipo == tipo)
    return q.order_by(ObjecionesAlerta.created_at.desc()).all()


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
) -> ObjecionesAlerta:
    """Helper interno: aplica el cambio de estado validando tenant y existencia."""
    alerta = (
        db.query(ObjecionesAlerta)
        .filter(
            ObjecionesAlerta.id        == alert_id,
            ObjecionesAlerta.tenant_id == tenant_id,
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
) -> ObjecionesAlerta:
    """Marca una alerta como 'descartada'."""
    return _cambiar_estado(
        db,
        alert_id=alert_id,
        tenant_id=tenant_id,
        nuevo_estado="descartada",
        user_id=user_id,
    )


def resolver_alerta(
    db: Session,
    *,
    alert_id: int,
    tenant_id: int,
    user_id: Optional[int],
) -> ObjecionesAlerta:
    """Marca una alerta como 'resuelta'."""
    return _cambiar_estado(
        db,
        alert_id=alert_id,
        tenant_id=tenant_id,
        nuevo_estado="resuelta",
        user_id=user_id,
    )


# ═════════════════════════════════════════════════════════════════════════════
# RESUMEN PARA EL BANNER DEL DASHBOARD
# ═════════════════════════════════════════════════════════════════════════════

def contar_alertas_activas(
    db: Session,
    *,
    tenant_id: int,
    allowed_empresa_ids: List[int],
) -> dict:
    """
    Devuelve un resumen compacto de las alertas activas del tenant,
    pensado para alimentar el banner del Dashboard de Objeciones.

    Formato:
      {
        "total_alertas":    3,
        "empresas_afectadas": 2,
        "periodos_afectados": 3,
        "total_aobs_pendientes": 12,
      }
    """
    if not allowed_empresa_ids:
        return {
            "total_alertas":         0,
            "empresas_afectadas":    0,
            "periodos_afectados":    0,
            "total_aobs_pendientes": 0,
        }
    alertas = (
        db.query(ObjecionesAlerta)
        .filter(
            ObjecionesAlerta.tenant_id  == tenant_id,
            ObjecionesAlerta.empresa_id.in_(allowed_empresa_ids),
            ObjecionesAlerta.estado     == "activa",
        )
        .all()
    )
    total_alertas         = len(alertas)
    empresas_afectadas    = len({int(a.empresa_id) for a in alertas})
    periodos_afectados    = len({str(a.periodo) for a in alertas})
    total_aobs_pendientes = sum(int(a.num_pendientes or 0) for a in alertas)
    return {
        "total_alertas":         total_alertas,
        "empresas_afectadas":    empresas_afectadas,
        "periodos_afectados":    periodos_afectados,
        "total_aobs_pendientes": total_aobs_pendientes,
    }