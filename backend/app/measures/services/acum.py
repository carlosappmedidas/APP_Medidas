# app/measures/services/acum.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from typing import Iterable, Dict, Any
import re

from sqlalchemy.orm import Session

from app.measures.models import MedidaGeneral
from app.ingestion.models import IngestionFile

from app.measures.services.general import _save_general_period_contribution_and_rebuild


# ---------- procesador ACUM genérico ----------


def _procesar_acum_generico(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
    nombre_fichero_log: str,
    magnitud_objetivo: str,
    regex_periodo: str,
    source_tipo: str,
    punto_id_default: str,
    energia_generada: bool = False,
    energia_frontera_dd: bool = False,
    energia_pf: bool = False,
) -> MedidaGeneral:
    """Núcleo común para todos los procesadores de ficheros ACUM H2 y ACUMCIL.

    Parámetros de destino energético (exactamente uno debe ser True):
      energia_generada    → rellena energia_generada_kwh
      energia_frontera_dd → rellena energia_frontera_dd_kwh
      energia_pf          → rellena energia_pf_kwh
    """
    filas = list(filas_raw)

    if not filas:
        raise ValueError(f"El fichero {nombre_fichero_log} no contiene filas de datos")

    magnitud_norm = str(magnitud_objetivo).strip().upper()
    filas_filtradas = [
        f for f in filas
        if str(f.get("Magnitud", "")).strip().upper() == magnitud_norm
    ]
    if not filas_filtradas:
        raise ValueError(
            f"No hay filas con Magnitud '{magnitud_norm}' en el fichero {nombre_fichero_log}"
        )

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_filtradas
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Valores no numéricos en 'Valor_Acumulado_Total_Energia' en {nombre_fichero_log}"
        ) from exc

    filename = str(getattr(fichero, "filename", "") or "")
    m = re.search(regex_periodo, filename)
    if not m:
        raise ValueError(
            f"No se ha podido extraer el periodo AAAAMM del nombre de fichero: {filename}"
        )

    anio = int(m.group(1))
    mes = int(m.group(2))

    return _save_general_period_contribution_and_rebuild(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        anio=anio,
        mes=mes,
        source_tipo=source_tipo,
        energia_generada_kwh=float(energia_total) if energia_generada else 0.0,
        energia_frontera_dd_kwh=float(energia_total) if energia_frontera_dd else 0.0,
        energia_pf_kwh=float(energia_total) if energia_pf else 0.0,
        punto_id_default=punto_id_default,
    )


# ---------- procesadores ACUMCIL y ACUM H2 ----------


def procesar_acumcil_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    return _procesar_acum_generico(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
        nombre_fichero_log="ACUMCIL",
        magnitud_objetivo="AS",
        regex_periodo=r"_(\d{4})(\d{2})_",
        source_tipo="ACUMCIL",
        punto_id_default="ACUMCIL",
        energia_generada=True,
    )


def procesar_acum_h2_grd_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    return _procesar_acum_generico(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
        nombre_fichero_log="ACUM H2 GRD",
        magnitud_objetivo="AS",
        regex_periodo=r"_(\d{4})(\d{2})",
        source_tipo="ACUM_H2_GRD",
        punto_id_default="ACUM_H2_GRD",
        energia_generada=True,
    )


def procesar_acum_h2_gen_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    return _procesar_acum_generico(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
        nombre_fichero_log="ACUM H2 GEN",
        magnitud_objetivo="AS",
        regex_periodo=r"_(\d{4})(\d{2})",
        source_tipo="ACUM_H2_GEN",
        punto_id_default="ACUM_H2_GEN",
        energia_generada=True,
    )


def procesar_acum_h2_rdd_frontera_dd(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
    magnitud_objetivo: str = "AE",
    source_tipo: str = "ACUM_H2_RDD_FRONTERA_DD",
    punto_id_default: str = "ACUM_H2_RDD",
) -> MedidaGeneral:
    return _procesar_acum_generico(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
        nombre_fichero_log="ACUM H2 RDD",
        magnitud_objetivo=magnitud_objetivo,
        regex_periodo=r"_(\d{4})(\d{2})",
        source_tipo=source_tipo,
        punto_id_default=punto_id_default,
        energia_frontera_dd=True,
    )


def procesar_acum_h2_rdd_pf_kwh(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    return _procesar_acum_generico(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
        nombre_fichero_log="ACUM H2 RDD (PF)",
        magnitud_objetivo="AE",
        regex_periodo=r"_(\d{4})(\d{2})",
        source_tipo="ACUM_H2_RDD_PF",
        punto_id_default="ACUM_H2_RDD_PF",
        energia_pf=True,
    )


def procesar_acum_h2_trd_pf_kwh(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    return _procesar_acum_generico(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
        nombre_fichero_log="ACUM H2 TRD (PF)",
        magnitud_objetivo="AE",
        regex_periodo=r"_(\d{4})(\d{2})",
        source_tipo="ACUM_H2_TRD_PF",
        punto_id_default="ACUM_H2_TRD_PF",
        energia_pf=True,
    )