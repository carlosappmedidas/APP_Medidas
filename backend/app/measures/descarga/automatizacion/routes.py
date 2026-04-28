# app/measures/descarga/automatizacion/services_alertas.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportOperatorIssue=false

"""
Endpoints REST del submódulo Automatización de Publicaciones REE.

Patrón clonado de app/objeciones/automatizacion/routes_config.py + routes_alertas.py
unificados en un solo router (por ahora hay 1 solo tipo, no compensa separar).

Endpoints:
  Config:
    GET   /measures/descarga/automatizacion/config
    PATCH /measures/descarga/automatizacion/config/{tipo}
    POST  /measures/descarga/automatizacion/revisar-ahora/{tipo}

  Alertas:
    GET    /measures/descarga/automatizacion/alertas
    POST   /measures/descarga/automatizacion/alertas/{id}/resolver
    POST   /measures/descarga/automatizacion/alertas/{id}/descartar
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.measures.descarga.automatizacion.models import (
    PublicacionesAlerta,
    TIPO_BUSCAR_PUBLICACIONES_REE,
)
from app.measures.descarga.automatizacion.schemas import (
    AlertaRead,
    AlertasListResponse,
    AutomatizacionConfigAll,
    AutomatizacionConfigPatch,
    AutomatizacionConfigRead,
    RevisarAhoraResponse,
)
from app.measures.descarga.automatizacion.services_alertas import (
    descartar_alerta,
    listar_alertas,
    resolver_alerta,
)
from app.measures.descarga.automatizacion.services_config import (
    get_all_configs,
    get_or_create_config,
    patch_config,
)
from app.measures.descarga.automatizacion.services_job import (
    ejecutar_chequeo_publicaciones_tenant,
)


router = APIRouter(
    prefix="/measures/descarga/automatizacion",
    tags=["measures-descarga-automatizacion"],
)


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

_TIPOS_VALIDOS = {
    TIPO_BUSCAR_PUBLICACIONES_REE,
}


def _tenant_id(user) -> int:
    tid = getattr(user, "tenant_id", None)
    if tid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario sin tenant.",
        )
    return int(tid)


def _validar_tipo(tipo: str) -> str:
    """Normaliza y valida un valor de {tipo} de URL."""
    t = (tipo or "").strip().lower()
    if t not in _TIPOS_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo '{tipo}' no válido. Debe ser uno de: {', '.join(sorted(_TIPOS_VALIDOS))}.",
        )
    return t


def _allowed_empresa_ids(db: Session, *, tenant_id: int, user) -> List[int]:
    """Empresas accesibles para el usuario en su tenant."""
    is_super = bool(getattr(user, "is_superuser", False))
    permitidas = list(getattr(user, "empresa_ids_permitidas", []) or [])

    q = db.query(Empresa.id).filter(Empresa.tenant_id == tenant_id)
    if not is_super and permitidas:
        q = q.filter(Empresa.id.in_(permitidas))
    return [int(row[0]) for row in q.all()]


def _serializar_config(cfg) -> AutomatizacionConfigRead:
    """Convierte el modelo a schema con conversión 0/1 → bool."""
    return AutomatizacionConfigRead(
        tenant_id      = int(getattr(cfg, "tenant_id")),
        tipo           = str(getattr(cfg, "tipo")),
        activa         = bool(int(getattr(cfg, "activa", 0) or 0)),
        ultimo_run_at  = getattr(cfg, "ultimo_run_at", None),
        ultimo_run_ok  = bool(int(getattr(cfg, "ultimo_run_ok"))) if getattr(cfg, "ultimo_run_ok", None) is not None else None,
        ultimo_run_msg = getattr(cfg, "ultimo_run_msg", None),
    )


def _serializar_alerta(a: PublicacionesAlerta, *, empresas_dict: dict) -> AlertaRead:
    """Convierte el modelo a schema con detalle deserializado."""
    detalle_list = None
    if a.detalle_json:
        try:
            parsed = json.loads(str(a.detalle_json))
            if isinstance(parsed, list):
                detalle_list = parsed
        except Exception:
            detalle_list = None

    empresa_nombre = empresas_dict.get(int(a.empresa_id))

    return AlertaRead(
        id              = int(a.id),
        tenant_id       = int(a.tenant_id),
        empresa_id      = int(a.empresa_id),
        empresa_nombre  = empresa_nombre,
        tipo            = str(a.tipo),
        periodo         = str(a.periodo),
        fecha_hito      = a.fecha_hito,
        num_pendientes  = int(a.num_pendientes or 0),
        detalle         = detalle_list,
        severidad       = str(a.severidad),
        estado          = str(a.estado),
        created_at      = a.created_at,
        updated_at      = a.updated_at,
        resuelta_at     = a.resuelta_at,
    )


def _empresas_dict_for(db: Session, *, tenant_id: int) -> dict:
    """{empresa_id: nombre} de todas las empresas del tenant."""
    rows = (
        db.query(Empresa.id, Empresa.nombre)
        .filter(Empresa.tenant_id == tenant_id)
        .all()
    )
    return {int(r[0]): str(r[1]) for r in rows}


# ═════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/config", response_model=AutomatizacionConfigAll)
def get_config(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Devuelve TODAS las configs de automatización del tenant.
    Por ahora solo hay 1 tipo: buscar_publicaciones_ree.
    """
    tid = _tenant_id(current_user)
    configs = get_all_configs(db, tenant_id=tid)
    return AutomatizacionConfigAll(
        buscar_publicaciones_ree = _serializar_config(configs["buscar_publicaciones_ree"]),
    )


@router.patch("/config/{tipo}", response_model=AutomatizacionConfigRead)
def patch_config_endpoint(
    tipo: str,
    payload: AutomatizacionConfigPatch,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Actualiza la config de un tipo (por ahora solo `activa`)."""
    t = _validar_tipo(tipo)
    cfg = patch_config(
        db,
        tenant_id = _tenant_id(current_user),
        tipo      = t,
        activa    = payload.activa,
    )
    return _serializar_config(cfg)


@router.post("/revisar-ahora/{tipo}", response_model=RevisarAhoraResponse)
def revisar_ahora_endpoint(
    tipo: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Ejecuta el chequeo correspondiente al tipo AHORA.
    Salta la comprobación de `activa` (forzar=True).
    """
    t = _validar_tipo(tipo)
    tid = _tenant_id(current_user)
    # Asegurar que existe la fila de config antes de ejecutar.
    get_or_create_config(db, tenant_id=tid, tipo=t)

    if t == TIPO_BUSCAR_PUBLICACIONES_REE:
        resultado = ejecutar_chequeo_publicaciones_tenant(
            db,
            tenant_id    = tid,
            current_user = current_user,
            forzar       = True,
        )
    else:
        # No debería llegar aquí — _validar_tipo ya filtró.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo '{tipo}' no soportado.",
        )

    return RevisarAhoraResponse(
        ok               = bool(resultado.get("ok", False)),
        mensaje          = str(resultado.get("mensaje", "")),
        alertas_creadas  = int(resultado.get("alertas_creadas", 0)),
        hitos_procesados = int(resultado.get("hitos_procesados", 0)),
    )


# ═════════════════════════════════════════════════════════════════════════════
# ALERTAS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/alertas", response_model=AlertasListResponse)
def listar_alertas_endpoint(
    estado:     Optional[str] = Query(default="activa", description="Filtra por estado: activa | resuelta | descartada | (vacío = todas)"),
    empresa_id: Optional[int] = Query(default=None),
    periodo:    Optional[str] = Query(default=None,    description="Periodo YYYYMM"),
    tipo:       Optional[str] = Query(default=None,    description="Tipo de hito: publicacion_m2 | m7 | m11 | art15"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Lista alertas de publicaciones del tenant.
    Por defecto solo devuelve las activas (la campanita las quiere así).
    """
    tid = _tenant_id(current_user)
    allowed = _allowed_empresa_ids(db, tenant_id=tid, user=current_user)

    estado_filtro = (estado or "").strip()
    if estado_filtro == "":
        estado_filtro = None  # "todas"

    items = listar_alertas(
        db,
        tenant_id           = tid,
        allowed_empresa_ids = allowed,
        estado              = estado_filtro,
        empresa_id          = empresa_id,
        periodo             = periodo,
        tipo                = tipo,
    )

    empresas_dict = _empresas_dict_for(db, tenant_id=tid)

    serialized = [_serializar_alerta(a, empresas_dict=empresas_dict) for a in items]
    activas = sum(1 for a in items if str(a.estado) == "activa")

    return AlertasListResponse(
        total   = len(serialized),
        activas = activas,
        items   = serialized,
    )


@router.post("/alertas/{alert_id}/resolver", response_model=AlertaRead)
def resolver_alerta_endpoint(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Marca una alerta como resuelta."""
    tid = _tenant_id(current_user)
    user_id = int(getattr(current_user, "id", 0) or 0) or None
    try:
        alerta = resolver_alerta(db, alert_id=alert_id, tenant_id=tid, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    empresas_dict = _empresas_dict_for(db, tenant_id=tid)
    return _serializar_alerta(alerta, empresas_dict=empresas_dict)


@router.post("/alertas/{alert_id}/descartar", response_model=AlertaRead)
def descartar_alerta_endpoint(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """Marca una alerta como descartada."""
    tid = _tenant_id(current_user)
    user_id = int(getattr(current_user, "id", 0) or 0) or None
    try:
        alerta = descartar_alerta(db, alert_id=alert_id, tenant_id=tid, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    empresas_dict = _empresas_dict_for(db, tenant_id=tid)
    return _serializar_alerta(alerta, empresas_dict=empresas_dict)