# app/envios/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.envios import services
from app.envios.schemas import EnvioMRead
from app.tenants.models import User

router = APIRouter(prefix="/envios", tags=["envios"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))


def _assert_not_viewer(user: User) -> None:
    if str(getattr(user, "rol", "")) == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


# ── Histórico de envíos ──────────────────────────────────────────────────────

@router.get("/historico", response_model=List[EnvioMRead])
def get_historico(
    m_clasificacion: Optional[str] = Query(
        None,
        description="Filtrar por M (M1/M2/M7)",
        pattern="^(M1|M2|M7)$",
    ),
    empresa_id: Optional[int] = Query(None, description="Filtrar por empresa"),
    tipo: Optional[str] = Query(
        None,
        description="Filtrar por tipo de fichero",
        pattern="^(AGRECL|INMECL|MAGCL)$",
    ),
    periodo_anio: Optional[int] = Query(None, description="Año del periodo de datos"),
    periodo_mes: Optional[int] = Query(None, ge=1, le=12, description="Mes del periodo (1-12)"),
    estado: Optional[str] = Query(
        None,
        description="Estado de respuesta REE",
        pattern="^(pendiente|ok|bad)$",
    ),
    limit: int = Query(500, ge=1, le=5000, description="Máx. resultados a devolver"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el histórico de envíos AGRECL/INMECL/MAGCL al SFTP REE,
    filtrado por los criterios indicados. Orden: más recientes primero.
    """
    _assert_not_viewer(current_user)
    return services.list_envios(
        db,
        tenant_id=_tenant_id(current_user),
        m_clasificacion=m_clasificacion,
        empresa_id=empresa_id,
        tipo=tipo,
        periodo_anio=periodo_anio,
        periodo_mes=periodo_mes,
        estado=estado,
        limit=limit,
    )


# ── Contadores para badges de la tarjeta del histórico ────────────────────────

@router.get("/historico/count")
def get_historico_count(
    m_clasificacion: Optional[str] = Query(
        None,
        description="Filtrar por M (M1/M2/M7)",
        pattern="^(M1|M2|M7)$",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Devuelve contadores agregados (total / pendiente / ok / bad) para
    mostrar como badges en la cabecera del histórico.
    """
    _assert_not_viewer(current_user)
    return services.count_envios(
        db,
        tenant_id=_tenant_id(current_user),
        m_clasificacion=m_clasificacion,
    )


# ── Búsqueda manual de respuestas REE ────────────────────────────────────────

@router.post("/buscar-respuestas")
def buscar_respuestas_ree(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Escanea la carpeta_entrada_general de todas las conexiones FTP activas
    del tenant en busca de respuestas REE (.ok / .bad) para los envíos
    registrados en `envios_m`. Actualiza estados:

      - .ok → marca el envío como ok y borra los .bad previos del
        mismo (tipo+empresa+comerc+periodo)
      - .bad → marca el envío como bad e incrementa reintentos

    Idempotente: se puede ejecutar tantas veces como se quiera sin
    duplicar efectos.
    """
    _assert_not_viewer(current_user)
    # Import perezoso para no acoplar el router al servicio si el módulo cambia
    from app.envios.services_respuestas_ree import buscar_respuestas_envios_tenant
    return buscar_respuestas_envios_tenant(db, tenant_id=_tenant_id(current_user))