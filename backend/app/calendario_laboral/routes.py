# app/calendario_laboral/routes.py
# pyright: reportMissingImports=false
"""
Endpoints del módulo `calendario_laboral` (festivos Madrid).

Rutas:

  GET    /calendario_laboral/festivos?anio=YYYY
         Lista festivos del año. Si no existen, los calcula y guarda.

  POST   /calendario_laboral/festivos
         Crea un festivo manual (origen=MANUAL).

  PUT    /calendario_laboral/festivos/{festivo_id}
         Edita un festivo (nombre/ambito/activo). Marca origen=MANUAL.

  POST   /calendario_laboral/festivos/{festivo_id}/toggle
         Atajo para activar/desactivar (toggle de `activo`). Marca origen=MANUAL.

  DELETE /calendario_laboral/festivos/{festivo_id}
         Borra un festivo (cualquier origen).

  POST   /calendario_laboral/festivos/{anio}/recalcular
         Borra los AUTO del año, recalcula y guarda. Mantiene los MANUAL.

Todos los endpoints están aislados por tenant_id (multi-tenant).
"""
from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.calendario_laboral.models import DiaFestivoMadrid
from app.calendario_laboral.schemas import (
    DiaFestivoMadridCreate,
    DiaFestivoMadridListResp,
    DiaFestivoMadridRead,
    DiaFestivoMadridUpdate,
    RecalcularResp,
)
from app.calendario_laboral.services_db import (
    cargar_festivos_anio,
    recalcular_anio,
)
from app.core.auth import get_current_user
from app.core.db import get_db
from app.tenants.models import User


router: APIRouter = APIRouter(
    prefix="/calendario_laboral",
    tags=["calendario_laboral"],
)


# ── Helpers ──────────────────────────────────────────────────────────────

def _get_festivo_or_404(
    db: Session,
    *,
    tenant_id: int,
    festivo_id: int,
) -> DiaFestivoMadrid:
    festivo = (
        db.query(DiaFestivoMadrid)
        .filter(
            DiaFestivoMadrid.id == festivo_id,
            DiaFestivoMadrid.tenant_id == tenant_id,
        )
        .first()
    )
    if festivo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Festivo no encontrado.",
        )
    return festivo


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/festivos", response_model=DiaFestivoMadridListResp)
def listar_festivos(
    anio: int = Query(..., ge=2020, le=2099, description="Año a consultar"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista los festivos del año. Si no hay datos para ese año en BD, los
    calcula automáticamente con el algoritmo de Gauss y los guarda.
    """
    tenant_id = int(cast(int, current_user.tenant_id))

    festivos, calculados_ahora = cargar_festivos_anio(
        db,
        tenant_id=tenant_id,
        anio=anio,
    )

    return DiaFestivoMadridListResp(
        anio=anio,
        total=len(festivos),
        calculados_ahora=calculados_ahora,
        festivos=[DiaFestivoMadridRead.model_validate(f) for f in festivos],
    )


@router.post(
    "/festivos",
    response_model=DiaFestivoMadridRead,
    status_code=status.HTTP_201_CREATED,
)
def crear_festivo_manual(
    payload: DiaFestivoMadridCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea un festivo manual (origen=MANUAL). El año se deduce de la fecha."""
    tenant_id = int(cast(int, current_user.tenant_id))
    anio = payload.fecha.year

    # Comprobar que no haya ya un festivo en esa fecha
    existente = (
        db.query(DiaFestivoMadrid)
        .filter(
            DiaFestivoMadrid.tenant_id == tenant_id,
            DiaFestivoMadrid.anio == anio,
            DiaFestivoMadrid.fecha == payload.fecha,
        )
        .first()
    )
    if existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un festivo en la fecha {payload.fecha}.",
        )

    festivo = DiaFestivoMadrid()
    festivo.tenant_id = tenant_id  # type: ignore[assignment]
    festivo.anio = anio  # type: ignore[assignment]
    festivo.fecha = payload.fecha  # type: ignore[assignment]
    festivo.nombre = payload.nombre  # type: ignore[assignment]
    festivo.ambito = payload.ambito  # type: ignore[assignment]
    festivo.origen = DiaFestivoMadrid.ORIGEN_MANUAL  # type: ignore[assignment]
    festivo.activo = payload.activo  # type: ignore[assignment]

    db.add(festivo)
    db.commit()
    db.refresh(festivo)

    return DiaFestivoMadridRead.model_validate(festivo)


@router.put("/festivos/{festivo_id}", response_model=DiaFestivoMadridRead)
def editar_festivo(
    festivo_id: int,
    payload: DiaFestivoMadridUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Edita un festivo. Cualquier edición lo marca como origen=MANUAL para que
    el "Recalcular automático" no lo sobrescriba luego.
    """
    tenant_id = int(cast(int, current_user.tenant_id))
    festivo = _get_festivo_or_404(db, tenant_id=tenant_id, festivo_id=festivo_id)

    if payload.nombre is not None:
        festivo.nombre = payload.nombre  # type: ignore[assignment]
    if payload.ambito is not None:
        festivo.ambito = payload.ambito  # type: ignore[assignment]
    if payload.activo is not None:
        festivo.activo = payload.activo  # type: ignore[assignment]

    festivo.origen = DiaFestivoMadrid.ORIGEN_MANUAL  # type: ignore[assignment]

    db.commit()
    db.refresh(festivo)
    return DiaFestivoMadridRead.model_validate(festivo)


@router.post("/festivos/{festivo_id}/toggle", response_model=DiaFestivoMadridRead)
def toggle_festivo(
    festivo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Atajo: alterna el campo `activo` (true ↔ false). Marca origen=MANUAL."""
    tenant_id = int(cast(int, current_user.tenant_id))
    festivo = _get_festivo_or_404(db, tenant_id=tenant_id, festivo_id=festivo_id)

    nuevo_activo = not bool(cast(bool, festivo.activo))
    festivo.activo = nuevo_activo  # type: ignore[assignment]
    festivo.origen = DiaFestivoMadrid.ORIGEN_MANUAL  # type: ignore[assignment]

    db.commit()
    db.refresh(festivo)
    return DiaFestivoMadridRead.model_validate(festivo)


@router.delete("/festivos/{festivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def borrar_festivo(
    festivo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Borra un festivo (cualquier origen)."""
    tenant_id = int(cast(int, current_user.tenant_id))
    festivo = _get_festivo_or_404(db, tenant_id=tenant_id, festivo_id=festivo_id)
    db.delete(festivo)
    db.commit()


@router.post(
    "/festivos/{anio}/recalcular",
    response_model=RecalcularResp,
)
def recalcular_festivos_anio(
    anio: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Borra los festivos AUTO del año, recalcula y guarda. Mantiene los MANUAL
    sin tocar.
    """
    if anio < 2020 or anio > 2099:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Año fuera de rango (2020-2099).",
        )

    tenant_id = int(cast(int, current_user.tenant_id))
    resumen = recalcular_anio(db, tenant_id=tenant_id, anio=anio)
    return RecalcularResp(**resumen)
