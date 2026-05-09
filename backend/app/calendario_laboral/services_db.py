# app/calendario_laboral/services_db.py
# pyright: reportMissingImports=false
"""
Servicio BD del módulo `calendario_laboral`.

Capa intermedia entre los endpoints (routes.py) y la BD que se encarga de:

  • cargar_festivos_anio(...): obtener festivos de un (tenant, anio); si no
    existen, los calcula automáticamente con el algoritmo de Gauss y los
    guarda. Idempotente.

  • recalcular_anio(...): borra los festivos AUTO de un año, vuelve a
    calcularlos y los inserta. Mantiene los MANUAL.

  • cargar_festivos_set_activos(...): util para el cálculo de plazos REE.
    Devuelve un `set[date]` con los festivos activos del año.
"""
from __future__ import annotations

from datetime import date
from typing import Any, cast

from sqlalchemy.orm import Session

from app.calendario_laboral.models import DiaFestivoMadrid
from app.calendario_laboral.services_festivos import (
    FestivoCalculado,
    calcular_festivos_madrid,
)


# ── Conversión interna ───────────────────────────────────────────────────

def _crear_registros_desde_calculados(
    *,
    tenant_id: int,
    anio: int,
    calculados: list[FestivoCalculado],
) -> list[DiaFestivoMadrid]:
    """Convierte una lista de FestivoCalculado en filas ORM listas para guardar."""
    nuevos: list[DiaFestivoMadrid] = []
    for fc in calculados:
        festivo = DiaFestivoMadrid()
        festivo.tenant_id = tenant_id  # type: ignore[assignment]
        festivo.anio = anio  # type: ignore[assignment]
        festivo.fecha = fc.fecha  # type: ignore[assignment]
        festivo.nombre = fc.nombre  # type: ignore[assignment]
        festivo.ambito = fc.ambito  # type: ignore[assignment]
        festivo.origen = DiaFestivoMadrid.ORIGEN_AUTO  # type: ignore[assignment]
        festivo.activo = True  # type: ignore[assignment]
        nuevos.append(festivo)
    return nuevos


# ── API pública ──────────────────────────────────────────────────────────

def cargar_festivos_anio(
    db: Session,
    *,
    tenant_id: int,
    anio: int,
) -> tuple[list[DiaFestivoMadrid], bool]:
    """
    Devuelve los festivos del (tenant, anio).

    Si no existen registros para ese año, los calcula con el algoritmo de
    Gauss, los guarda en BD y los devuelve. Si ya existen, devuelve los
    de BD tal cual están (pueden estar editados o desactivados).

    Returns
    -------
    tuple[list[DiaFestivoMadrid], bool]
        (festivos_ordenados_por_fecha, calculados_ahora)
    """
    existentes = (
        db.query(DiaFestivoMadrid)
        .filter(
            DiaFestivoMadrid.tenant_id == tenant_id,
            DiaFestivoMadrid.anio == anio,
        )
        .order_by(DiaFestivoMadrid.fecha.asc())
        .all()
    )

    if existentes:
        return existentes, False

    # No hay nada → calcular y guardar
    calculados = calcular_festivos_madrid(anio)
    nuevos = _crear_registros_desde_calculados(
        tenant_id=tenant_id,
        anio=anio,
        calculados=calculados,
    )
    db.add_all(nuevos)
    db.commit()
    for n in nuevos:
        db.refresh(n)

    return nuevos, True


def cargar_festivos_set_activos(
    db: Session,
    *,
    tenant_id: int,
    anio: int,
) -> set[date]:
    """
    Devuelve un `set[date]` con las fechas de los festivos ACTIVOS del año.

    Optimizado para el cálculo de plazos REE (nth_dia_habil_madrid). Si no
    hay festivos para ese año, los calcula y guarda automáticamente.
    """
    festivos, _ = cargar_festivos_anio(db, tenant_id=tenant_id, anio=anio)
    return {
        cast(date, f.fecha)
        for f in festivos
        if cast(bool, getattr(f, "activo", True))
    }


def recalcular_anio(
    db: Session,
    *,
    tenant_id: int,
    anio: int,
) -> dict[str, Any]:
    """
    Borra los festivos AUTO del año y los vuelve a calcular. Los MANUAL
    se mantienen intactos.

    Returns
    -------
    dict
        {"anio", "eliminados_auto", "creados", "mantenidos_manual"}
    """
    # 1) Contar/borrar AUTO
    auto_query = db.query(DiaFestivoMadrid).filter(
        DiaFestivoMadrid.tenant_id == tenant_id,
        DiaFestivoMadrid.anio == anio,
        DiaFestivoMadrid.origen == DiaFestivoMadrid.ORIGEN_AUTO,
    )
    eliminados_auto = auto_query.count()
    auto_query.delete(synchronize_session=False)

    # 2) Contar MANUAL (se mantienen sin tocar)
    mantenidos_manual = (
        db.query(DiaFestivoMadrid)
        .filter(
            DiaFestivoMadrid.tenant_id == tenant_id,
            DiaFestivoMadrid.anio == anio,
            DiaFestivoMadrid.origen == DiaFestivoMadrid.ORIGEN_MANUAL,
        )
        .count()
    )

    # 3) Recalcular y crear nuevos AUTO. Si una fecha calculada coincide con
    #    una MANUAL existente, la dejamos pasar (el constraint UNIQUE de
    #    (tenant, anio, fecha) la rechazaría) — filtramos antes de insertar.
    fechas_manual_existentes: set[date] = {
        cast(date, f.fecha)
        for f in db.query(DiaFestivoMadrid.fecha)
        .filter(
            DiaFestivoMadrid.tenant_id == tenant_id,
            DiaFestivoMadrid.anio == anio,
            DiaFestivoMadrid.origen == DiaFestivoMadrid.ORIGEN_MANUAL,
        )
        .all()
    }

    calculados = [
        fc
        for fc in calcular_festivos_madrid(anio)
        if fc.fecha not in fechas_manual_existentes
    ]
    nuevos = _crear_registros_desde_calculados(
        tenant_id=tenant_id,
        anio=anio,
        calculados=calculados,
    )
    db.add_all(nuevos)
    db.commit()

    return {
        "anio": anio,
        "eliminados_auto": eliminados_auto,
        "creados": len(nuevos),
        "mantenidos_manual": mantenidos_manual,
    }
