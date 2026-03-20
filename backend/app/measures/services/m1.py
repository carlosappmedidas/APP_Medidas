# app/measures/services/m1.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from typing import Iterable, Dict, Any
from datetime import date
import re

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.measures.models import MedidaGeneral
from app.measures.m1_models import M1PeriodContribution
from app.ingestion.models import IngestionFile

from app.measures.services.common import (
    _to_date,
    _to_float,
    _safe_refresh,
    _recalcular_energia_neta_y_perdidas,
    _extraer_periodo_principal_de_fichero,
    _periodo_objetivo_m1_desde_periodo_principal,
    _file_id,
)


# ---------- helpers M1 ----------


def _sum_contribuciones_m1(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    anio: int,
    mes: int,
) -> float:
    total = (
        db.query(func.coalesce(func.sum(M1PeriodContribution.energia_kwh), 0.0))
        .filter(
            M1PeriodContribution.tenant_id == tenant_id,
            M1PeriodContribution.empresa_id == empresa_id,
            M1PeriodContribution.anio == anio,
            M1PeriodContribution.mes == mes,
        )
        .scalar()
    )
    return float(total or 0.0)


def _get_existing_m1_file_periods(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    ingestion_file_id: int,
) -> set[tuple[int, int]]:
    periods: set[tuple[int, int]] = set()

    rows = (
        db.query(M1PeriodContribution.anio, M1PeriodContribution.mes)
        .filter(
            M1PeriodContribution.tenant_id == tenant_id,
            M1PeriodContribution.empresa_id == empresa_id,
            M1PeriodContribution.ingestion_file_id == ingestion_file_id,
        )
        .distinct()
        .all()
    )

    for anio, mes in rows:
        if anio is not None and mes is not None:
            periods.add((int(anio), int(mes)))

    return periods


# ---------- procesadores M1 ----------


def procesar_m1(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)
    if not filas:
        raise ValueError("El fichero M1 no contiene filas de datos")

    anio_principal, mes_principal = _extraer_periodo_principal_de_fichero(fichero)

    warnings: list[dict[str, Any]] = []
    energia_por_periodo: dict[tuple[int, int], float] = {}
    periodos_nuevos: set[tuple[int, int]] = set()

    periodos_previos = _get_existing_m1_file_periods(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        ingestion_file_id=_file_id(fichero),
    )

    (
        db.query(M1PeriodContribution)
        .filter(
            M1PeriodContribution.tenant_id == tenant_id,
            M1PeriodContribution.empresa_id == empresa_id,
            M1PeriodContribution.ingestion_file_id == _file_id(fichero),
        )
        .delete(synchronize_session=False)
    )
    db.flush()

    for f in filas:
        try:
            fecha_final = _to_date(f.get("Fecha_final"))
        except Exception:
            continue

        fecha_inicio: date | None = None
        try:
            if "Fecha_inicio" in f:
                fecha_inicio = _to_date(f.get("Fecha_inicio"))
        except Exception:
            fecha_inicio = None

        anio_obj, mes_obj, motivo = _periodo_objetivo_m1_desde_periodo_principal(
            fecha_final,
            anio_principal=anio_principal,
            mes_principal=mes_principal,
        )

        if motivo == "future_out_of_window":
            warnings.append(
                {
                    "type": "future_out_of_window",
                    "fecha_final": fecha_final.isoformat(),
                    "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                    "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                }
            )

        if fecha_inicio is not None:
            if (fecha_inicio.year, fecha_inicio.month) != (fecha_final.year, fecha_final.month):
                warnings.append(
                    {
                        "type": "fecha_inicio_fecha_final_distinto_mes",
                        "fecha_inicio": fecha_inicio.isoformat(),
                        "fecha_final": fecha_final.isoformat(),
                        "periodo_asignado": f"{anio_obj:04d}{mes_obj:02d}",
                        "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                    }
                )

        energia = _to_float(f.get("Energia_Kwh", 0.0))
        energia_por_periodo[(anio_obj, mes_obj)] = (
            energia_por_periodo.get((anio_obj, mes_obj), 0.0) + energia
        )
        periodos_nuevos.add((anio_obj, mes_obj))

    if not energia_por_periodo:
        raise ValueError(
            "No hay filas con Fecha_final válida para calcular energia_bruta_facturada "
            "(todas NaT/NaN/None/vacías)"
        )

    for (anio, mes), energia_total in sorted(energia_por_periodo.items()):
        es_principal = (anio, mes) == (anio_principal, mes_principal)

        contrib = M1PeriodContribution(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            ingestion_file_id=_file_id(fichero),
            anio=anio,
            mes=mes,
            energia_kwh=float(energia_total),
            is_principal=bool(es_principal),
        )
        db.add(contrib)

        if not es_principal:
            warnings.append(
                {
                    "type": "refactura_detectada",
                    "periodo": f"{anio:04d}{mes:02d}",
                    "energia_kwh": float(energia_total),
                    "periodo_principal": f"{anio_principal:04d}{mes_principal:02d}",
                }
            )

    db.flush()

    periodos_afectados = set(periodos_previos) | set(periodos_nuevos)
    mg_principal: MedidaGeneral | None = None

    for (anio, mes) in sorted(periodos_afectados):
        mg = (
            db.query(MedidaGeneral)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio,
                mes=mes,
            )
            .first()
        )

        creado = False
        if mg is None:
            mg = MedidaGeneral(  # type: ignore[call-arg]
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                punto_id="M1",
                anio=anio,
                mes=mes,
            )
            db.add(mg)
            creado = True

        es_principal = (anio, mes) == (anio_principal, mes_principal)

        energia_periodo = _sum_contribuciones_m1(
            db,
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )

        if creado and not es_principal and energia_periodo != 0.0:
            warnings.append(
                {
                    "type": "missing_period_created",
                    "periodo": f"{anio:04d}{mes:02d}",
                    "energia_kwh": float(energia_periodo),
                }
            )

        mg.energia_bruta_facturada = float(energia_periodo)  # type: ignore[assignment]
        mg.file_id = _file_id(fichero)  # type: ignore[assignment]

        if es_principal:
            mg_principal = mg

        _recalcular_energia_neta_y_perdidas(mg)

    db.flush()

    if mg_principal is None:
        (anio_ret, mes_ret), _ = max(energia_por_periodo.items(), key=lambda kv: kv[1])
        mg_principal = (
            db.query(MedidaGeneral)
            .filter_by(
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                anio=anio_ret,
                mes=mes_ret,
            )
            .first()
        )
        if mg_principal is None:
            raise ValueError("No pude recuperar la medida principal tras guardar M1")

    try:
        setattr(mg_principal, "_ingestion_warnings", warnings)
    except Exception:
        pass

    _safe_refresh(db, mg_principal)
    return mg_principal


def procesar_m1_autoconsumo(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero M1 de autoconsumo no contiene filas de datos")

    try:
        energia_total = sum(_to_float(f.get("Kwh", 0.0)) for f in filas)
    except Exception as exc:
        raise ValueError("Valores no numéricos en la columna 'Kwh'") from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})_", nombre)
    if not m:
        raise ValueError(
            f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {nombre}"
        )
    anio = int(m.group(1))
    mes = int(m.group(2))

    mg = (
        db.query(MedidaGeneral)
        .filter_by(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            anio=anio,
            mes=mes,
        )
        .first()
    )

    if mg is None:
        mg = MedidaGeneral(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            punto_id="M1",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    mg.energia_autoconsumo_kwh = float(energia_total)  # type: ignore[assignment]
    mg.file_id = _file_id(fichero)  # type: ignore[assignment]

    _recalcular_energia_neta_y_perdidas(mg)
    db.flush()
    _safe_refresh(db, mg)
    return mg