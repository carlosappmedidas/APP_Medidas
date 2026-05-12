# app/envios/routes_inventario.py
# pyright: reportMissingImports=false

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.envios import services_inventario
from app.envios.schemas_inventario import EnvioInventarioRead
from app.tenants.models import User

router = APIRouter(prefix="/envios-inventario", tags=["envios-inventario"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))


def _assert_not_viewer(user: User) -> None:
    if str(getattr(user, "rol", "")) == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


def _csv_strs(raw: Optional[str]) -> Optional[list[str]]:
    if not raw:
        return None
    out = [s.strip() for s in raw.split(",") if s.strip()]
    return out or None


def _csv_ints(raw: Optional[str]) -> Optional[list[int]]:
    items = _csv_strs(raw)
    if not items:
        return None
    try:
        return [int(s) for s in items]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Valor numérico inválido en '{raw}'",
        )


def _csv_meses(raw: Optional[str]) -> Optional[list[tuple[int, int]]]:
    """Parsea CSV de 'YYYY-MM' a lista de (anio, mes)."""
    items = _csv_strs(raw)
    if not items:
        return None
    out: list[tuple[int, int]] = []
    for s in items:
        parts = s.split("-")
        if len(parts) != 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mes inválido '{s}' (formato esperado: 'YYYY-MM')",
            )
        try:
            a, m = int(parts[0]), int(parts[1])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mes no numérico '{s}'",
            )
        if not (1 <= m <= 12):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mes fuera de rango '{s}'",
            )
        out.append((a, m))
    return out or None


# ── Histórico de inventario ──────────────────────────────────────────────────

@router.get("/historico", response_model=List[EnvioInventarioRead])
def get_historico_inventario(
    empresa_ids: Optional[str] = Query(None, description="Lista CSV de empresa_id"),
    tipos:       Optional[str] = Query(None, description="Lista CSV de tipos (AUTOCONSUMO/CUPSCAU/CUPS45/CUPSDAT)"),
    frecuencias: Optional[str] = Query(None, description="Lista CSV (mensual/diario)"),
    estados:     Optional[str] = Query(None, description="Lista CSV (pendiente/ok/bad)"),
    meses:       Optional[str] = Query(None, description="Lista CSV 'YYYY-MM' — filtra por fecha_generacion"),
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el histórico de envíos de inventario filtrado.
    Orden: subido_sftp_at descendente (más reciente primero).
    """
    _assert_not_viewer(current_user)

    return services_inventario.list_envios_inventario(
        db,
        tenant_id=_tenant_id(current_user),
        empresa_ids=_csv_ints(empresa_ids),
        tipos=_csv_strs(tipos),
        frecuencias=_csv_strs(frecuencias),
        estados=_csv_strs(estados),
        meses=_csv_meses(meses),
        limit=limit,
    )


# ── Contadores para badges ───────────────────────────────────────────────────

@router.get("/historico/count")
def get_historico_inventario_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Devuelve contadores agregados {total, pendiente, ok, bad}.
    """
    _assert_not_viewer(current_user)
    return services_inventario.count_envios_inventario(
        db,
        tenant_id=_tenant_id(current_user),
    )


# ── Meses disponibles para el filtro ─────────────────────────────────────────

@router.get("/historico/meses")
def get_historico_inventario_meses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Devuelve la lista de meses (anio, mes) que tienen al menos un envío
    de inventario, basado en fecha_generacion. Orden: más recientes primero.
    """
    _assert_not_viewer(current_user)
    return services_inventario.list_meses_disponibles_inventario(
        db,
        tenant_id=_tenant_id(current_user),
    )


# ── Búsqueda manual de respuestas REE ────────────────────────────────────────

@router.post("/buscar-respuestas")
def buscar_respuestas_inventario(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Escanea la carpeta_entrada_general de todas las conexiones FTP activas
    del tenant en busca de respuestas REE (.ok / .bad) para los envíos de
    inventario registrados en `envios_inventario`. Actualiza estados.

    Idempotente: se puede ejecutar tantas veces como se quiera.
    """
    _assert_not_viewer(current_user)
    from app.envios.services_respuestas_ree_inventario import (
        buscar_respuestas_envios_inventario_tenant,
    )
    return buscar_respuestas_envios_inventario_tenant(
        db, tenant_id=_tenant_id(current_user)
    )


# ── Borrado de un envío del histórico ─────────────────────────────────────────

@router.delete("/{envio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_envio_inventario(
    envio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Borra un envío de la tabla `envios_inventario` (solo BD).
    NO toca el SFTP — el fichero sigue allí.
    """
    _assert_not_viewer(current_user)
    try:
        services_inventario.delete_envio_inventario(
            db,
            tenant_id=_tenant_id(current_user),
            envio_id=envio_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


# ── Descarga de fichero (original o respuesta REE) ────────────────────────────

@router.get("/{envio_id}/descargar/{tipo}")
def descargar_fichero_envio_inventario(
    envio_id: int,
    tipo: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Descarga del SFTP el fichero asociado a un envío de inventario.

    `tipo`:
      - `original`   → carpeta_salida_general + envio.nombre_fichero
      - `respuesta`  → carpeta_entrada_general + envio.respuesta_nombre_fichero

    Devuelve el binario como attachment para "Guardar como...".
    """
    _assert_not_viewer(current_user)
    if tipo not in ("original", "respuesta"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo debe ser 'original' o 'respuesta'",
        )
    try:
        contenido, nombre_fichero = services_inventario.descargar_fichero_envio_inventario(
            db,
            tenant_id=_tenant_id(current_user),
            envio_id=envio_id,
            tipo=tipo,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error FTP: {str(e)[:200]}",
        ) from e

    import io
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        io.BytesIO(contenido),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{nombre_fichero}"'},
    )