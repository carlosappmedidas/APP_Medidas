# app/ingestion/services.py
# pyright: reportMissingImports=false, reportMissingModuleSource=false

from pathlib import Path
from typing import Iterable, Any, Optional, cast
import re

import pandas as pd
from sqlalchemy.orm import Session

from app.ingestion.models import IngestionFile
from app.measures.services import (
    procesar_m1,
    procesar_m1_autoconsumo,
    procesar_acumcil_generacion,
    procesar_acum_h2_grd_generacion,
    procesar_acum_h2_gen_generacion,
    procesar_acum_h2_rdd_frontera_dd,
    procesar_acum_h2_rdd_pf_kwh,  # ⬅️ PF desde RDD
    procesar_bald_medidas_general,
    procesar_ps,  # ⬅️ NUEVO: medidas PS
)

# Cabeceras asociadas al ACUMCIL H2 (el fichero real no las trae,
# pero siempre respeta este orden y separador ';').
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

# Cabeceras asociadas al ACUM H2 GRD (fichero sin cabeceras, separado por ';')
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

# ACUM H2 GEN tiene el mismo layout que ACUM H2 GRD
ACUM_H2_GEN_COLUMNS = ACUM_H2_GRD_COLUMNS

# ACUM H2 RDD (P1/P2) también comparte el mismo layout
ACUM_H2_RDD_COLUMNS = ACUM_H2_GRD_COLUMNS

# BALD (sin cabeceras, separado por ';')
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
# M1 (facturación y autoconsumo)
#   -> aquí soportamos tanto Excel (.xlsm, .xlsx, .xls) como CSV ';'
# ---------------------------------------------------------------------------


def _leer_fichero_m1_desde_excel_o_csv(
    file_path: str,
) -> list[dict[str, Any]]:
    """
    Lee un fichero M1 de facturación/autoconsumo.

    - Si la extensión es Excel (.xls, .xlsx, .xlsm):
        * Intentamos leer la hoja 'cabeceras' (que es donde está la tabla).
        * Si no existe, usamos la primera hoja.
    - Si no, asumimos CSV ';' con cabeceras.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in {".xls", ".xlsx", ".xlsm"}:
        # Excel (como tu fichero 0288_202509_Facturacion.xlsm)
        try:
            df = pd.read_excel(path, sheet_name="cabeceras")
        except Exception:
            # Si por lo que sea no existe 'cabeceras', cogemos la primera hoja
            df = pd.read_excel(path)
    else:
        # CSV normal con ';'
        df = pd.read_csv(
            path,
            sep=";",
            dtype=str,
            engine="python",
        )

    # En tu fichero hemos comprobado que las columnas son:
    #   'Fecha_inicio', 'Fecha_final', 'Energia_Kwh'
    # Así que no hace falta renombrar nada salvo que quisieras normalizar.
    return cast(list[dict[str, Any]], df.to_dict(orient="records"))


def procesar_fichero_m1(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[dict[str, Any]],
):
    """
    Envuelve el procesado del fichero M1 de facturación
    cuando ya tenemos filas parseadas.
    """
    return procesar_m1(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
    )


def procesar_fichero_m1_autoconsumo(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[dict[str, Any]],
):
    """
    Envuelve el procesado del fichero M1 de autoconsumo
    cuando ya tenemos filas parseadas.
    """
    return procesar_m1_autoconsumo(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
    )


def procesar_fichero_m1_desde_csv(  # mantenemos el nombre para no tocar routes.py
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: str,
):
    """
    Procesa un fichero M1 de facturación directamente desde disco.

    Ahora soporta tanto:
      - Excel (.xls, .xlsx, .xlsm) -> hoja 'cabeceras' de tu fichero
      - CSV ';' con cabeceras

    Se asume que el fichero tiene al menos:
      - 'Fecha_final'
      - 'Energia_Kwh'
    """
    filas_local = _leer_fichero_m1_desde_excel_o_csv(file_path=file_path)

    return procesar_m1(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )


def procesar_fichero_m1_autoconsumo_desde_csv(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    file_path: str,
):
    """
    Procesa un fichero M1 de autoconsumos directamente desde disco.

    Mismo tratamiento de formato (Excel/CSV) que facturación, pero la
    lógica de negocio la hace procesar_m1_autoconsumo.
    """
    filas_local = _leer_fichero_m1_desde_excel_o_csv(file_path=file_path)

    return procesar_m1_autoconsumo(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )


# ---------------------------------------------------------------------------
# PS_* (plantilla energía facturada / tarifa / póliza)
# ---------------------------------------------------------------------------


def _leer_fichero_ps_desde_excel_o_csv(
    file_path: str,
) -> list[dict[str, Any]]:
    """
    Lee un fichero PS_*.

    - Si la extensión es Excel (.xls, .xlsx, .xlsm): lee la primera hoja.
    - Si no, asume CSV ';' con cabeceras.

    Normaliza nombres de columnas a:

      Energia_facturada, Tarifa_acceso, CUPS, Fecha_final, Poliza, Total
    """
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

    # 🔴 IMPORTANTE: normalizamos cabeceras reales del Excel (con "> Descripción", "agree_tipus", etc.)
    rename_map = {
        # Energía facturada
        "Energía facturada": "Energia_facturada",
        "Energia facturada": "Energia_facturada",
        "Energia_facturada": "Energia_facturada",

        # Tarifa de acceso
        "Tarifa de acceso": "Tarifa_acceso",
        "Tarifa acceso": "Tarifa_acceso",
        "Tarifa_acceso": "Tarifa_acceso",
        "Tarifa de acceso > Descripción": "Tarifa_acceso",

        # CUPS
        "CUPS": "CUPS",
        "CUPS > Descripción": "CUPS",

        # Fecha final
        "Fecha final": "Fecha_final",
        "Fecha_final": "Fecha_final",

        # Póliza / tipo PS
        "Póliza": "Poliza",
        "Poliza": "Poliza",
        "Póliza > agree_tipus": "Poliza",

        # Importe
        "Total": "Total",
    }
    df = df.rename(columns=rename_map)

    # Fallback extra: si no tenemos "Poliza", intentamos localizarla por nombre aproximado
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
    """
    Procesa un fichero PS_* directamente desde disco:

      - Lee Excel/CSV.
      - Normaliza columnas.
      - Llama a procesar_ps (medidas_ps).
    """
    filas_local = _leer_fichero_ps_desde_excel_o_csv(file_path=file_path)

    return procesar_ps(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_local,
    )


# ---------------------------------------------------------------------------
# Lectura de ficheros sin cabeceras (ACUM, BALD, ...)
# ---------------------------------------------------------------------------


def _leer_fichero_csv_sin_cabeceras(
    file_path: str,
    columnas: list[str],
) -> list[dict[str, Any]]:
    """
    Función auxiliar para leer ficheros ';' sin cabeceras y devolver
    una lista de dicts (uno por fila).
    """
    path = Path(file_path)

    df = pd.read_csv(
        path,
        sep=";",
        header=None,
        names=columnas,
        dtype=str,
        engine="python",
    )

    filas_local = cast(list[dict[str, Any]], df.to_dict(orient="records"))
    return filas_local


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
    """
    Envuelve el procesado del fichero ACUMCIL de generación.

    Puede recibir:
      - filas_raw ya parseadas (lista de dicts), o
      - file_path apuntando al fichero plano sin cabeceras.
    """

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
    """
    Envuelve el procesado del fichero ACUM_H2_GRD_... de generación.

    La lógica de negocio real la hace procesar_acum_h2_grd_generacion.
    """

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
    """
    Envuelve el procesado del fichero ACUM_H2_GEN_... de generación.

    El formato es idéntico al de ACUM H2 GRD, así que reutilizamos
    exactamente el mismo parsing y la misma lógica.
    """

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
    """
    Envuelve el procesado del fichero ACUM_H2_RDD_... P2 (magnitud AE)
    que alimenta medidas_general.energia_frontera_dd_kwh.
    """
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
    """
    Envuelve el procesado del fichero ACUM_H2_RDD_... P1 (magnitud AS)
    que también suma en medidas_general.energia_frontera_dd_kwh.
    """
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
# ACUM H2 RDD (energia_pf_kwh) desde P1 (magnitud AE)
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
    """
    Envuelve el procesado del fichero ACUM_H2_RDD_... (P1) que alimenta
    medidas_general.energia_pf_kwh usando la magnitud AE.

    La lógica de negocio real la hace procesar_acum_h2_rdd_pf_kwh
    (definido en app.measures.services).
    """
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
    """
    A partir del nombre del fichero BALD_0277_202401_20240318.0
    calcula la diferencia en meses entre el periodo (202401) y la
    fecha de publicación (20240318), y devuelve:
      - 'M2'   si diff < 7
      - 'M7'   si 7 <= diff < 10
      - 'M11'  si 10 <= diff <= 13
      - 'ART15' si diff > 13
    """
    nombre = str(getattr(fichero, "filename", ""))
    m = re.search(r"BALD_\d+_(\d{6})_(\d{8})", nombre)
    if not m:
        raise ValueError(f"No se reconoce el patrón BALD en el nombre: {nombre}")

    periodo_str = m.group(1)  # AAAAMM
    pub_str = m.group(2)  # AAAAMMDD

    anio_periodo = int(periodo_str[:4])
    mes_periodo = int(periodo_str[4:6])

    anio_pub = int(pub_str[:4])
    mes_pub = int(pub_str[4:6])

    diff_meses = (anio_pub - anio_periodo) * 12 + (mes_pub - mes_periodo)

    if diff_meses < 7:
        return "M2"
    elif 7 <= diff_meses < 10:
        return "M7"
    elif 10 <= diff_meses <= 13:
        return "M11"
    else:
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
    """
    Procesa un fichero BALD_* (M2/M7/M11/ART15).

    - Lee el fichero BALD (sin cabeceras, ';').
    - Clasifica el periodo (M2/M7/M11/ART15) a partir del nombre.
    - Usa la primera fila (normalmente hay una) para alimentar
      medidas_general.<cabeceras>_mX_kwh.
    """
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