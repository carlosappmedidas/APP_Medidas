# app/envios/automatizacion/routes_config.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

"""
Endpoints REST del submódulo Automatización de Envíos REE.

Endpoints:
  GET   /envios/automatizacion/config                       → todas las configs
  PATCH /envios/automatizacion/config/{tipo}                → toggle ON/OFF
  POST  /envios/automatizacion/revisar-ahora/{tipo}         → ejecución manual
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.envios.automatizacion.models import (
    EnviosAutomatizacion,
    TIPO_BUSCAR_RESPUESTAS_ENVIOS,
    TIPO_REVISAR_ALERTAS_ENVIOS,
)
from app.envios.automatizacion.schemas import (
    AutomatizacionConfigAll,
    AutomatizacionConfigPatch,
    AutomatizacionConfigRead,
    RevisarAhoraResponse,
)
from app.envios.automatizacion.services_config import (
    get_all_configs,
    get_or_create_config,
    marcar_ultimo_run,
    patch_config,
)


router = APIRouter(
    prefix="/envios/automatizacion",
    tags=["envios-automatizacion"],
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

_TIPOS_VALIDOS = {
    TIPO_BUSCAR_RESPUESTAS_ENVIOS,
    TIPO_REVISAR_ALERTAS_ENVIOS,
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


def _serializar_config(cfg: EnviosAutomatizacion) -> AutomatizacionConfigRead:
    """Convierte una EnviosAutomatizacion en su schema de lectura."""
    activa_raw = getattr(cfg, "activa", 0)
    ultimo_ok_raw = getattr(cfg, "ultimo_run_ok", None)
    return AutomatizacionConfigRead(
        activa         = bool(int(activa_raw or 0)),
        ultimo_run_at  = getattr(cfg, "ultimo_run_at", None),
        ultimo_run_ok  = (bool(int(ultimo_ok_raw)) if ultimo_ok_raw is not None else None),
        ultimo_run_msg = getattr(cfg, "ultimo_run_msg", None),
    )


# ─── Endpoints de configuración ──────────────────────────────────────────────

@router.get("/config", response_model=AutomatizacionConfigAll)
def get_config(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Devuelve TODAS las configs de automatización del tenant.
    Por ahora solo hay 1 tipo: buscar_respuestas_envios.
    """
    tid = _tenant_id(current_user)
    configs = get_all_configs(db, tenant_id=tid)
    return AutomatizacionConfigAll(
        buscar_respuestas_envios = _serializar_config(configs[TIPO_BUSCAR_RESPUESTAS_ENVIOS]),
        revisar_alertas_envios   = _serializar_config(configs[TIPO_REVISAR_ALERTAS_ENVIOS]),
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


# ─── Endpoint "Revisar ahora" (ejecución manual) ─────────────────────────────

@router.post("/revisar-ahora/{tipo}", response_model=RevisarAhoraResponse)
def revisar_ahora(
    tipo: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    Ejecuta la automatización inmediatamente, sin esperar al cron.
    Marca también el último_run en la config del tenant.
    """
    t = _validar_tipo(tipo)
    tid = _tenant_id(current_user)

    # Asegurar que la config existe (la crea si no)
    get_or_create_config(db, tenant_id=tid, tipo=t)

    try:
        # Despachar según el tipo
        if t == TIPO_BUSCAR_RESPUESTAS_ENVIOS:
            from app.envios.services_respuestas_ree import buscar_respuestas_envios_tenant
            resultado = buscar_respuestas_envios_tenant(db, tenant_id=tid)
            ok = len(resultado.get("errores", [])) == 0
            partes = []
            if resultado["ok_marcados"] > 0:
                partes.append(f"{resultado['ok_marcados']} OK")
            if resultado["bad_marcados"] > 0:
                partes.append(f"{resultado['bad_marcados']} BAD")
            if resultado["bad_borrados"] > 0:
                partes.append(f"{resultado['bad_borrados']} BAD borrados")
            mensaje = ", ".join(partes) if partes else "Sin cambios"
            if not ok:
                mensaje += f" — {len(resultado['errores'])} avisos"
            marcar_ultimo_run(db, tenant_id=tid, tipo=t, ok=ok, mensaje=mensaje)
            return RevisarAhoraResponse(**resultado)

        elif t == TIPO_REVISAR_ALERTAS_ENVIOS:
            from app.envios.automatizacion.services_alertas import (
                recalcular_alertas_envios_tenant,
            )
            resultado_alertas = recalcular_alertas_envios_tenant(db, tenant_id=tid)
            mensaje = (
                f"{resultado_alertas['creadas']} creadas, "
                f"{resultado_alertas['actualizadas']} actualizadas, "
                f"{resultado_alertas['auto_resueltas']} auto-resueltas"
            )
            marcar_ultimo_run(db, tenant_id=tid, tipo=t, ok=True, mensaje=mensaje)
            # Adaptar el formato a RevisarAhoraResponse (campos esperados)
            return RevisarAhoraResponse(
                respuestas_revisadas=0,
                ok_marcados=resultado_alertas["creadas"],
                bad_marcados=0,
                bad_borrados=resultado_alertas["auto_resueltas"],
                errores=[],
            )

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tipo '{t}' no implementado.",
            )
    except HTTPException:
        raise
    except Exception as e:
        marcar_ultimo_run(db, tenant_id=tid, tipo=t, ok=False, mensaje=str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error ejecutando: {str(e)[:200]}",
        ) from e