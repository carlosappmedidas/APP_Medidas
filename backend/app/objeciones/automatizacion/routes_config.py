# app/objeciones/automatizacion/routes_config.py
# pyright: reportMissingImports=false

"""
Endpoints de configuración de la automatización de objeciones.

Tipos de automatización soportados:
  - fin_recepcion          (cron 23:00 — detecta AOBs nuevos en SFTP)
  - fin_resolucion         (cron 23:30 — avisa de objeciones sin responder)
  - buscar_respuestas_ree  (cron 07:00 — busca .ok/.bad de REE en SFTP)

Endpoints:
  GET   /objeciones/automatizacion/config                    → las 3 configs
  PATCH /objeciones/automatizacion/config/{tipo}             → toggle por tipo
  POST  /objeciones/automatizacion/revisar-ahora/{tipo}      → disparar por tipo
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.objeciones.automatizacion.models import (
    TIPO_FIN_RECEPCION,
    TIPO_FIN_RESOLUCION,
    TIPO_BUSCAR_RESPUESTAS_REE,
)
from app.objeciones.automatizacion.schemas import (
    AutomatizacionConfigAll,
    AutomatizacionConfigPatch,
    AutomatizacionConfigRead,
    RevisarAhoraResponse,
)
from app.objeciones.automatizacion.services_config import (
    get_all_configs,
    get_or_create_config,
    patch_config,
)
from app.objeciones.automatizacion.services_job import (
    ejecutar_chequeo_fin_recepcion_tenant,
)
from app.objeciones.automatizacion.services_job_resolucion import (
    ejecutar_chequeo_fin_resolucion_tenant,
)
from app.objeciones.services_respuestas_ree import buscar_respuestas_tenant


router = APIRouter(
    prefix="/objeciones/automatizacion",
    tags=["objeciones-automatizacion"],
)


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

# Tipos válidos de automatización aceptados en {tipo} de las URLs.
_TIPOS_VALIDOS = {
    TIPO_FIN_RECEPCION,
    TIPO_FIN_RESOLUCION,
    TIPO_BUSCAR_RESPUESTAS_REE,
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


def _serializar_config(cfg) -> AutomatizacionConfigRead:
    """Convierte el modelo a schema, aplicando la conversión 0/1 → bool."""
    return AutomatizacionConfigRead(
        tenant_id      = int(getattr(cfg, "tenant_id")),
        tipo           = str(getattr(cfg, "tipo")),
        activa         = bool(int(getattr(cfg, "activa", 0) or 0)),
        ultimo_run_at  = getattr(cfg, "ultimo_run_at", None),
        ultimo_run_ok  = bool(int(getattr(cfg, "ultimo_run_ok"))) if getattr(cfg, "ultimo_run_ok", None) is not None else None,
        ultimo_run_msg = getattr(cfg, "ultimo_run_msg", None),
    )


def _ejecutar_revisar_ahora_tenant(
    db: Session,
    *,
    tipo: str,
    tenant_id: int,
    current_user,
) -> dict:
    """
    Dispara el chequeo correspondiente al tipo. Cada tipo tiene su propia
    función de ejecución. Devuelve el dict que ya devuelven esas funciones,
    normalizado para que siempre tenga las claves que espera la UI.
    """
    if tipo == TIPO_FIN_RECEPCION:
        return ejecutar_chequeo_fin_recepcion_tenant(
            db,
            tenant_id    = tenant_id,
            current_user = current_user,
            forzar       = True,
        )
    if tipo == TIPO_FIN_RESOLUCION:
        return ejecutar_chequeo_fin_resolucion_tenant(
            db,
            tenant_id    = tenant_id,
            current_user = current_user,
            forzar       = True,
        )
    if tipo == TIPO_BUSCAR_RESPUESTAS_REE:
        # `buscar_respuestas_tenant` tiene una firma distinta (no usa "forzar"
        # ni devuelve el mismo dict). La adaptamos aquí al formato común para
        # que la respuesta REST sea uniforme con los otros dos tipos.
        # Además — a diferencia de los otros tipos que lo hacen internamente —
        # `buscar_respuestas_tenant` no llama a `marcar_ultimo_run`, así que lo
        # hacemos aquí explícitamente para que la tarjeta de Configuración vea
        # la fecha del último chequeo.
        from app.objeciones.automatizacion.services_config import marcar_ultimo_run

        res = buscar_respuestas_tenant(
            db,
            tenant_id    = tenant_id,
            current_user = current_user,
        )
        ok_n   = int(res.get("encontrados_ok", 0) or 0)
        bad_n  = int(res.get("encontrados_bad", 0) or 0)
        sin_n  = int(res.get("sin_respuesta", 0) or 0)
        err_n  = int(res.get("errores_empresa", 0) or 0)
        proc_n = int(res.get("procesados", 0) or 0)
        mensaje = f"{proc_n} REOB revisados · {ok_n} OK · {bad_n} BAD · {sin_n} sin respuesta · {err_n} errores empresa."
        marcar_ultimo_run(
            db,
            tenant_id = tenant_id,
            tipo      = TIPO_BUSCAR_RESPUESTAS_REE,
            ok        = (err_n == 0),
            mensaje   = mensaje,
        )
        return {
            "ok":               err_n == 0,
            "mensaje":          mensaje,
            "alertas_creadas":  ok_n + bad_n,  # reutilizamos el campo como "número de respuestas encontradas"
            "hitos_procesados": proc_n,
        }
    # Si llegamos aquí es un error interno — el validador debería haberlo capturado antes.
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Tipo '{tipo}' no soportado.",
    )


# ═════════════════════════════════════════════════════════════════════════════
# GET /config — devuelve las 3 configuraciones
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/config", response_model=AutomatizacionConfigAll)
def get_config(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Devuelve las 3 configuraciones de automatización del tenant:
      fin_recepcion, fin_resolucion, buscar_respuestas_ree.

    Si alguna no existía en BD, la crea on-the-fly con sus defaults:
      - buscar_respuestas_ree: activa=1 (ya funcionaba así en prod)
      - resto:                 activa=0 (opt-in del usuario)
    """
    tid = _tenant_id(current_user)
    configs = get_all_configs(db, tenant_id=tid)
    return AutomatizacionConfigAll(
        fin_recepcion         = _serializar_config(configs["fin_recepcion"]),
        fin_resolucion        = _serializar_config(configs["fin_resolucion"]),
        buscar_respuestas_ree = _serializar_config(configs["buscar_respuestas_ree"]),
    )


# ═════════════════════════════════════════════════════════════════════════════
# PATCH /config/{tipo} — activar/desactivar por tipo
# ═════════════════════════════════════════════════════════════════════════════

@router.patch("/config/{tipo}", response_model=AutomatizacionConfigRead)
def patch_config_endpoint(
    tipo: str,
    payload: AutomatizacionConfigPatch,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Actualiza la configuración de un tipo concreto. Por ahora solo se puede
    cambiar `activa`. Devuelve el objeto actualizado.
    """
    t = _validar_tipo(tipo)
    cfg = patch_config(
        db,
        tenant_id = _tenant_id(current_user),
        tipo      = t,
        activa    = payload.activa,
    )
    return _serializar_config(cfg)


# ═════════════════════════════════════════════════════════════════════════════
# POST /revisar-ahora/{tipo} — disparar ejecución por tipo
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/revisar-ahora/{tipo}", response_model=RevisarAhoraResponse)
def revisar_ahora_endpoint(
    tipo: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Ejecuta el chequeo/búsqueda correspondiente al tipo AHORA. Salta la
    comprobación de "activa" — el usuario lo está forzando explícitamente
    desde la UI de Configuración.
    """
    t = _validar_tipo(tipo)
    # Asegurar que existe la fila de config antes de ejecutar (para que el
    # job pueda marcar ultimo_run_at sin fallar).
    get_or_create_config(db, tenant_id=_tenant_id(current_user), tipo=t)

    resultado = _ejecutar_revisar_ahora_tenant(
        db,
        tipo         = t,
        tenant_id    = _tenant_id(current_user),
        current_user = current_user,
    )
    return RevisarAhoraResponse(
        ok               = bool(resultado.get("ok", False)),
        mensaje          = str(resultado.get("mensaje", "")),
        alertas_creadas  = int(resultado.get("alertas_creadas", 0)),
        hitos_procesados = int(resultado.get("hitos_procesados", 0)),
    )