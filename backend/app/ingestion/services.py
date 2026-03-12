# app/ingestion/services.py
# pyright: reportMissingImports=false, reportMissingModuleSource=false

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterable, Optional, cast

import pandas as pd
from sqlalchemy.orm import Session

from app.ingestion.models import IngestionFile
from app.measures.services import (
    procesar_acum_h2_gen_generacion,
    procesar_acum_h2_grd_generacion,
    procesar_acum_h2_rdd_frontera_dd,
    procesar_acum_h2_rdd_pf_kwh,
    procesar_acumcil_generacion,
    procesar_bald_medidas_general,
    procesar_m1,
    procesar_m1_autoconsumo,
    procesar_ps,
)

ACUMCIL_H2_COLUMNS = [
    "Codigo_CIL",
    "Codigo_Distribuidor",
    "Codigo_Unidad_programacion",
    "Codigo_Tipo_Punto",
    "Codigo_Provincia",
    "Fecha_inicio",
    "Fecha_final",
    "Magnitud",
    "Parcial_Estimada",
    "Horas_Estimadas",
    "Parcial_Redundante",
    "Horas_Redundantes",
    "Valor_Acumulado_Total_Energia",
    "Horas_Totales",
    "Col_dummy",
]

ACUM_H2_GRD_COLUMNS = [
    "Codigo_PF",
    "Magnitud",
    "Valor_Acumulado_Parcial_Energia_Estimada_(KWh)",
    "Numero_Horas_Medidas_Estimadas",
    "Valor_Acumulado_Parcial_Energia_Registrador_Redundante_(KWh)",
    "Numero_Horas_Medidas_Registrador_Redundante",
    "Valor_Acumulado_Parcial_Energia_Registrador_Configuracion_(KWh)",
    "Numero_Horas_Medidas_Registrador_Configuracion_(KWh)",
    "Valor_Acumulado_Total_Energia",
    "Numero_Total_Horas_Medidas",
    "Col_dummy",
]

ACUM_H2_GEN_COLUMNS = ACUM_H2_GRD_COLUMNS
ACUM_H2_RDD_COLUMNS = ACUM_H2_GRD_COLUMNS

BALD_COLUMNS = [
    "Codigo_unidad_perdidas",
    "GD",
    "ED",
    "CIL",
    "DT",
    "DD",
    "DD_A",
    "DD_S",
    "E0_suministrada",
    "E1_suministrada",
    "E2_suministrada",
    "E3_suministrada",
    "E4_suministrada",
    "E5_suministrada",
    "E6_suministrada",
    "E0_vertida",
    "E1_vertida",
    "E2_vertida",
    "E3_vertida",
    "E4_vertida",
    "E5_vertida",
    "E6_vertida",
    "Demanda_suministrada",
    "Demanda_vertida",
    "Demanda_neta",
    "Adquisicion",
    "Perdidas",
    "Perdidas_porcentaje",
    "Col_dummy",
]


# ---------------------------------------------------------------------------
# Helpers internos (warnings)
# ---------------------------------------------------------------------------


def _try_attach_ingestion_warnings(fichero: IngestionFile, warnings: Any) -> None:
    """
    Adjunta warnings al objeto IngestionFile y los persiste en warnings_json.
    """
    if not warnings:
        return

    try:
        setattr(fichero, "_ingestion_warnings", warnings)
    except Exception:
        pass

    try:
        setattr(fichero, "warnings_json", json.dumps(warnings, ensure_ascii=False))
    except Exception:
        pass


def _try_copy_warnings_from_result(fichero: IngestionFile, result: Any) -> None:
    """
    Si el procesador de medidas adjunta warnings en el resultado
    (p.ej. procesar_m1 / procesar_ps), los copiamos al IngestionFile.
    """
    try:
        warnings = getattr(result, "_ingestion_warnings", None)
    except Exception:
        warnings = None

    if warnings:
        _try_attach_ingestion_warnings(fichero, warnings)


# ---------------------------------------------------------------------------
# M1 (facturación y autoconsumo)
# ---------------------------------------------------------------------------


def _leer_fichero_m1_desde_excel_o_csv(
    file_path: str,
) -> list[dict[str, Any]]:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in {".xls", ".xlsx", ".xlsm"}:
        try:
            df = pd.read_excel(path, sheet_name="cabeceras")
        except Exception:
            df = pd.read_excel(path)
    else:
        df = pd.read_csv(
            path,
            sep=";",
            dtype=str,
            engine="python",
        )

    return cast(list[dict[str, Any]], df.to_dict(orient="records"))


def procesar_fichero_m1(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[dict[str, Any]],
):
    res = procesar_m1(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    _try_copy_warnings_from_result(fichero, res)
    return res


def procesar_fichero_m1_autoconsumo(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[dict[str, Any]],
):
    res = procesar_m1_autoconsumo(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
    )

    _try_copy_warnings_from_result(fichero, res)
    return res


def procesar_fichero_m1_desde_csv(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: str,
):
    filas_local = _leer_fichero_m1_desde_excel_o_csv(file_path=file_path)

    res = procesar_m1(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )

    _try_copy_warnings_from_result(fichero, res)
    return res


def procesar_fichero_m1_autoconsumo_desde_csv(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: str,
):
    filas_local = _leer_fichero_m1_desde_excel_o_csv(file_path=file_path)

    res = procesar_m1_autoconsumo(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )

    _try_copy_warnings_from_result(fichero, res)
    return res


# ---------------------------------------------------------------------------
# PS_* (plantilla energía facturada / tarifa / póliza)
# ---------------------------------------------------------------------------


def _leer_fichero_ps_desde_excel_o_csv(
    file_path: str,
) -> list[dict[str, Any]]:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in {".xls", ".xlsx", ".xlsm"}:
        df = pd.read_excel(path)
    else:
        df = pd.read_csv(
            path,
            sep=";",
            dtype=str,
            engine="python",
        )

    rename_map = {
        "Energía facturada": "Energia_facturada",
        "Energia facturada": "Energia_facturada",
        "Energia_facturada": "Energia_facturada",
        "Tarifa de acceso": "Tarifa_acceso",
        "Tarifa acceso": "Tarifa_acceso",
        "Tarifa_acceso": "Tarifa_acceso",
        "Tarifa de acceso > Descripción": "Tarifa_acceso",
        "CUPS": "CUPS",
        "CUPS > Descripción": "CUPS",
        "Fecha final": "Fecha_final",
        "Fecha_final": "Fecha_final",
        "Póliza": "Poliza",
        "Poliza": "Poliza",
        "Póliza > agree_tipus": "Poliza",
        "Total": "Total",
    }
    df = df.rename(columns=rename_map)

    if "Poliza" not in df.columns:
        for col in list(df.columns):
            col_norm = str(col).strip().lower()
            if "póliza" in col_norm or "poliza" in col_norm:
                df = df.rename(columns={col: "Poliza"})
                break

    return cast(list[dict[str, Any]], df.to_dict(orient="records"))


def procesar_fichero_ps(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: str,
):
    filas_local = _leer_fichero_ps_desde_excel_o_csv(file_path=file_path)

    res = procesar_ps(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )

    _try_copy_warnings_from_result(fichero, res)
    return res


# ---------------------------------------------------------------------------
# Lectura de ficheros sin cabeceras (ACUM, BALD, ...)
# ---------------------------------------------------------------------------


def _leer_fichero_csv_sin_cabeceras(
    file_path: str,
    columnas: list[str],
) -> list[dict[str, Any]]:
    path = Path(file_path)

    df = pd.read_csv(
        path,
        sep=";",
        header=None,
        names=columnas,
        dtype=str,
        engine="python",
    )

    return cast(list[dict[str, Any]], df.to_dict(orient="records"))


# ---------------------------------------------------------------------------
# ACUMCIL H2 (generación)
# ---------------------------------------------------------------------------


def procesar_fichero_acumcil_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: Optional[str] = None,
    filas_raw: Optional[Iterable[dict[str, Any]]] = None,
):
    if filas_raw is None:
        if file_path is None:
            raise ValueError(
                "Debes pasar o bien filas_raw o bien file_path para procesar ACUMCIL"
            )

        filas_local = _leer_fichero_csv_sin_cabeceras(
            file_path=file_path,
            columnas=ACUMCIL_H2_COLUMNS,
        )
    else:
        filas_local = list(filas_raw)

    return procesar_acumcil_generacion(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )


# ---------------------------------------------------------------------------
# ACUM H2 GRD (generación)
# ---------------------------------------------------------------------------


def procesar_fichero_acum_h2_grd_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: Optional[str] = None,
    filas_raw: Optional[Iterable[dict[str, Any]]] = None,
):
    if filas_raw is None:
        if file_path is None:
            raise ValueError(
                "Debes pasar o bien filas_raw o bien file_path para procesar ACUM H2 GRD"
            )

        filas_local = _leer_fichero_csv_sin_cabeceras(
            file_path=file_path,
            columnas=ACUM_H2_GRD_COLUMNS,
        )
    else:
        filas_local = list(filas_raw)

    return procesar_acum_h2_grd_generacion(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )


# ---------------------------------------------------------------------------
# ACUM H2 GEN (generación)
# ---------------------------------------------------------------------------


def procesar_fichero_acum_h2_gen_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: Optional[str] = None,
    filas_raw: Optional[Iterable[dict[str, Any]]] = None,
):
    if filas_raw is None:
        if file_path is None:
            raise ValueError(
                "Debes pasar o bien filas_raw o bien file_path para procesar ACUM H2 GEN"
            )

        filas_local = _leer_fichero_csv_sin_cabeceras(
            file_path=file_path,
            columnas=ACUM_H2_GEN_COLUMNS,
        )
    else:
        filas_local = list(filas_raw)

    return procesar_acum_h2_gen_generacion(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )


# ---------------------------------------------------------------------------
# ACUM H2 RDD (energia_frontera_dd_kwh)
# ---------------------------------------------------------------------------


def procesar_fichero_acum_h2_rdd_p2_frontera_dd(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: Optional[str] = None,
    filas_raw: Optional[Iterable[dict[str, Any]]] = None,
):
    if filas_raw is None:
        if file_path is None:
            raise ValueError(
                "Debes pasar o bien filas_raw o bien file_path para procesar ACUM H2 RDD P2"
            )

        filas_local = _leer_fichero_csv_sin_cabeceras(
            file_path=file_path,
            columnas=ACUM_H2_RDD_COLUMNS,
        )
    else:
        filas_local = list(filas_raw)

    return procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
        magnitud_objetivo="AE",
    )


def procesar_fichero_acum_h2_rdd_p1_frontera_dd(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: Optional[str] = None,
    filas_raw: Optional[Iterable[dict[str, Any]]] = None,
):
    if filas_raw is None:
        if file_path is None:
            raise ValueError(
                "Debes pasar o bien filas_raw o bien file_path para procesar ACUM H2 RDD P1"
            )

        filas_local = _leer_fichero_csv_sin_cabeceras(
            file_path=file_path,
            columnas=ACUM_H2_RDD_COLUMNS,
        )
    else:
        filas_local = list(filas_raw)

    return procesar_acum_h2_rdd_frontera_dd(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
        magnitud_objetivo="AS",
    )


# ---------------------------------------------------------------------------
# ACUM H2 RDD (energia_pf_kwh)
# ---------------------------------------------------------------------------


def procesar_fichero_acum_h2_rdd_pf_kwh(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: Optional[str] = None,
    filas_raw: Optional[Iterable[dict[str, Any]]] = None,
):
    if filas_raw is None:
        if file_path is None:
            raise ValueError(
                "Debes pasar o bien filas_raw o bien file_path para procesar ACUM H2 RDD (PF)"
            )

        filas_local = _leer_fichero_csv_sin_cabeceras(
            file_path=file_path,
            columnas=ACUM_H2_RDD_COLUMNS,
        )
    else:
        filas_local = list(filas_raw)

    return procesar_acum_h2_rdd_pf_kwh(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )


# ---------------------------------------------------------------------------
# BALD (M2 / M7 / M11 / ART15)
# ---------------------------------------------------------------------------


def _clasificar_bald_periodo(fichero: IngestionFile) -> str:
    nombre = str(getattr(fichero, "filename", ""))
    m = re.search(r"BALD_\d+_(\d{6})_(\d{8})", nombre)
    if not m:
        raise ValueError(f"No se reconoce el patrón BALD en el nombre: {nombre}")

    periodo_str = m.group(1)
    pub_str = m.group(2)

    anio_periodo = int(periodo_str[:4])
    mes_periodo = int(periodo_str[4:6])

    anio_pub = int(pub_str[:4])
    mes_pub = int(pub_str[4:6])

    diff_meses = (anio_pub - anio_periodo) * 12 + (mes_pub - mes_periodo)

    if diff_meses < 7:
        return "M2"
    if 7 <= diff_meses < 10:
        return "M7"
    if 10 <= diff_meses <= 13:
        return "M11"
    return "ART15"


def procesar_fichero_bald(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: Optional[str] = None,
    filas_raw: Optional[Iterable[dict[str, Any]]] = None,
):
    if filas_raw is None:
        if file_path is None:
            raise ValueError(
                "Debes pasar o bien filas_raw o bien file_path para procesar BALD"
            )

        filas_local = _leer_fichero_csv_sin_cabeceras(
            file_path=file_path,
            columnas=BALD_COLUMNS,
        )
    else:
        filas_local = list(filas_raw)

    if not filas_local:
        raise ValueError("El fichero BALD no contiene filas de datos")

    fila = filas_local[0]
    periodo_bald = _clasificar_bald_periodo(fichero)

    return procesar_bald_medidas_general(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        periodo_bald=periodo_bald,
        fila=fila,
    )