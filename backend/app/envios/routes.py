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
    # ── Singulares (retrocompatibles) ──────────────────────────────────
    m_clasificacion: Optional[str] = Query(
        None,
        description="Filtrar por M (M1/M2/M7)",
        pattern="^(M1|M2|M7)$",
    ),
    empresa_id: Optional[int] = Query(None, description="Filtrar por empresa"),
    tipo: Optional[str] = Query(
        None,
        description="Filtrar por tipo de fichero",
        pattern="^(AGRECL|INMECL|MAGCL|F1|MCIL345QH|F1QH|MCIL345)$",
    ),
    periodo_anio: Optional[int] = Query(None, description="Año del periodo de datos"),
    periodo_mes: Optional[int] = Query(None, ge=1, le=12, description="Mes del periodo (1-12)"),
    estado: Optional[str] = Query(
        None,
        description="Estado de respuesta REE",
        pattern="^(pendiente|ok|bad)$",
    ),
    # ── Plurales (multi-select) ────────────────────────────────────────
    # Se pueden mandar como CSV ("AGRECL,F1") o repitiendo el param
    # (?tipos=AGRECL&tipos=F1). Ambas se aceptan.
    m_clasificaciones: Optional[str] = Query(None, description="Lista CSV de M (ej. 'M1,M2')"),
    empresa_ids:       Optional[str] = Query(None, description="Lista CSV de empresa_id (ej. '5,7')"),
    tipos:             Optional[str] = Query(None, description="Lista CSV de tipos"),
    estados:           Optional[str] = Query(None, description="Lista CSV de estados"),
    periodos:          Optional[str] = Query(None, description="Lista CSV de 'anio-mes' (ej. '2025-8,2025-9')"),
    # ───────────────────────────────────────────────────────────────────
    limit: int = Query(500, ge=1, le=5000, description="Máx. resultados a devolver"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el histórico de envíos al SFTP REE filtrado por los criterios
    indicados. Cada filtro admite forma singular (valor único) o plural
    (lista CSV). Si llegan ambos, el plural prevalece.
    Orden: más recientes primero.
    """
    _assert_not_viewer(current_user)

    # ── Parsear CSVs a listas Python ───────────────────────────────────
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

    def _csv_periodos(raw: Optional[str]) -> Optional[list[tuple[int, int]]]:
        items = _csv_strs(raw)
        if not items:
            return None
        out: list[tuple[int, int]] = []
        for s in items:
            parts = s.split("-")
            if len(parts) != 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Periodo inválido '{s}' (formato esperado: 'anio-mes')",
                )
            try:
                a, m = int(parts[0]), int(parts[1])
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Periodo no numérico '{s}'",
                )
            if not (1 <= m <= 12):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Mes fuera de rango en periodo '{s}'",
                )
            out.append((a, m))
        return out or None

    return services.list_envios(
        db,
        tenant_id=_tenant_id(current_user),
        m_clasificacion=m_clasificacion,
        m_clasificaciones=_csv_strs(m_clasificaciones),
        empresa_id=empresa_id,
        empresa_ids=_csv_ints(empresa_ids),
        tipo=tipo,
        tipos=_csv_strs(tipos),
        periodo_anio=periodo_anio,
        periodo_mes=periodo_mes,
        periodos=_csv_periodos(periodos),
        estado=estado,
        estados=_csv_strs(estados),
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
    m_clasificaciones: Optional[str] = Query(
        None,
        description="Lista CSV de M (ej. 'M1,M2'). Prevalece sobre m_clasificacion.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Devuelve contadores agregados (total / pendiente / ok / bad) para
    mostrar como badges en la cabecera del histórico.
    """
    _assert_not_viewer(current_user)
    lista = None
    if m_clasificaciones:
        lista = [s.strip() for s in m_clasificaciones.split(",") if s.strip()] or None
    return services.count_envios(
        db,
        tenant_id=_tenant_id(current_user),
        m_clasificacion=m_clasificacion,
        m_clasificaciones=lista,
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


# ── Periodos disponibles para el filtro del histórico ────────────────────────

@router.get("/historico/periodos")
def get_historico_periodos(
    m_clasificacion: Optional[str] = Query(
        None,
        description="Filtrar por M (M1/M2/M7)",
        pattern="^(M1|M2|M7)$",
    ),
    m_clasificaciones: Optional[str] = Query(
        None,
        description="Lista CSV de M (ej. 'M1,M2'). Prevalece sobre m_clasificacion.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Devuelve la lista de periodos (anio, mes) que tienen al menos un envío
    en BD para el tenant. Usado para poblar el selector "Periodo" en el
    histórico. Orden: más recientes primero.
    """
    _assert_not_viewer(current_user)
    lista = None
    if m_clasificaciones:
        lista = [s.strip() for s in m_clasificaciones.split(",") if s.strip()] or None
    return services.list_periodos_disponibles(
        db,
        tenant_id=_tenant_id(current_user),
        m_clasificacion=m_clasificacion,
        m_clasificaciones=lista,
    )


# ── Borrado de un envío del histórico ─────────────────────────────────────────

@router.delete("/{envio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_envio(
    envio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Borra un envío del histórico (solo de la BD `envios_m`).
    NO toca el SFTP — el fichero sigue allí.
    """
    _assert_not_viewer(current_user)
    try:
        services.delete_envio(
            db,
            tenant_id=_tenant_id(current_user),
            envio_id=envio_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


# ── Descarga de fichero enviado (original) o de su respuesta REE (.ok/.bad) ──

@router.get("/{envio_id}/descargar/{tipo}")
def descargar_fichero_envio(
    envio_id: int,
    tipo: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Descarga del SFTP el fichero asociado a un envío.

    `tipo`:
      - `original`    → busca en `carpeta_salida_general` el fichero subido
      - `respuesta`   → busca en `carpeta_entrada_general` el .ok/.bad recibido

    Devuelve el binario como attachment para que el navegador
    pueda preguntar "Guardar como...".
    """
    _assert_not_viewer(current_user)
    if tipo not in ("original", "respuesta"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo debe ser 'original' o 'respuesta'",
        )
    try:
        contenido, nombre_fichero = services.descargar_fichero_envio(
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