# app/measures/services.py
# pyright: reportCallIssue=false, reportAttributeAccessIssue=false, reportMissingImports=false

from __future__ import annotations

from typing import Iterable, Dict, Any, Tuple, cast
from datetime import datetime, date
import re
import math

from sqlalchemy.orm import Session

from app.measures.models import MedidaGeneral, MedidaPS
from app.ingestion.models import IngestionFile


# ---------- utilidades comunes ----------


def _to_date(value: Any) -> date:
    """Convierte distintos formatos de fecha a date.

    Acepta:
      - date
      - datetime
      - str en formatos tipo '2024-02-01' o '2024/02/01'
    """
    # OJO: datetime es subclass de date, por eso lo comprobamos primero
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        value_norm = value.replace("/", "-")
        return datetime.fromisoformat(value_norm).date()
    raise ValueError(f"No puedo interpretar la fecha: {value!r}")


def _obtener_periodo_desde_fechas(
    filas: Iterable[Dict[str, Any]],
) -> Tuple[int, int]:
    """
    A partir de las filas (con campo Fecha_final):
    - Toma la última Fecha_final.
    - Devuelve (anio, mes) de esa fecha.
    """
    fechas = [_to_date(f["Fecha_final"]) for f in filas]
    ultima = max(fechas)
    return ultima.year, ultima.month


def _to_float(value: Any) -> float:
    """
    Convierte un valor tipo str/'', None, etc. a float **seguro**.

    - Reemplaza coma por punto.
    - Cadenas vacías o basura -> 0.0
    - Si el resultado es NaN o infinito -> 0.0
    """
    if value is None:
        return 0.0

    if isinstance(value, (int, float)):
        x = float(value)
        if math.isnan(x) or math.isinf(x):
            return 0.0
        return x

    s = str(value).strip()
    if not s:
        return 0.0

    if s.upper() in {"NA", "N/A", "NULL"}:
        return 0.0

    s = s.replace(",", ".")

    try:
        x = float(s)
    except (TypeError, ValueError):
        return 0.0

    if math.isnan(x) or math.isinf(x):
        return 0.0

    return x


def _recalcular_energia_neta_y_perdidas(mg: MedidaGeneral) -> None:
    """
    Recalcula:
      - energia_neta_facturada_kwh
      - perdidas_e_facturada_kwh
      - perdidas_e_facturada_pct
    y sus versiones por ventana BALD (m2, m7, m11, art15).
    """

    # NOTA PYLANCE:
    # En modelos SQLAlchemy sin typing 2.0, Pylance suele inferir atributos como Column[...].
    # En runtime aquí son valores del instance (float/None). Hacemos cast explícito para evitar warnings.

    energia_bruta = cast(float | None, mg.energia_bruta_facturada) or 0.0
    energia_auto = cast(float | None, mg.energia_autoconsumo_kwh) or 0.0
    energia_pf_final = cast(float | None, mg.energia_pf_final_kwh) or 0.0
    energia_frontera_dd = cast(float | None, mg.energia_frontera_dd_kwh) or 0.0

    energia_neta = energia_bruta - energia_auto
    mg.energia_neta_facturada_kwh = energia_neta  # type: ignore[assignment]

    perdidas_kwh = energia_pf_final - energia_neta
    mg.perdidas_e_facturada_kwh = perdidas_kwh  # type: ignore[assignment]

    denom = energia_neta + energia_frontera_dd
    if denom > 0:
        mg.perdidas_e_facturada_pct = (perdidas_kwh / denom) * 100.0  # type: ignore[assignment]
    else:
        mg.perdidas_e_facturada_pct = None  # type: ignore[assignment]

    for sufijo in ("m2", "m7", "m11", "art15"):
        energia_publicada = cast(
            float | None, getattr(mg, f"energia_publicada_{sufijo}_kwh", 0.0)
        ) or 0.0
        energia_autoconsumo = cast(
            float | None, getattr(mg, f"energia_autoconsumo_{sufijo}_kwh", 0.0)
        ) or 0.0
        energia_pf = cast(float | None, getattr(mg, f"energia_pf_{sufijo}_kwh", 0.0)) or 0.0
        energia_gen = cast(
            float | None, getattr(mg, f"energia_generada_{sufijo}_kwh", 0.0)
        ) or 0.0
        energia_frontera_dd_win = cast(
            float | None, getattr(mg, f"energia_frontera_dd_{sufijo}_kwh", 0.0)
        ) or 0.0

        energia_neta_win = energia_publicada - energia_autoconsumo
        setattr(mg, f"energia_neta_facturada_{sufijo}_kwh", energia_neta_win)

        pf_final_win = energia_pf + energia_gen - energia_frontera_dd_win

        perdidas_win_kwh = pf_final_win - energia_neta_win
        setattr(mg, f"perdidas_e_facturada_{sufijo}_kwh", perdidas_win_kwh)

        denom_win = energia_neta_win + energia_frontera_dd_win
        if denom_win > 0:
            perdidas_pct = (perdidas_win_kwh / denom_win) * 100.0
        else:
            perdidas_pct = None

        setattr(mg, f"perdidas_e_facturada_{sufijo}_pct", perdidas_pct)


def _recalcular_energia_pf_final(mg: MedidaGeneral) -> None:
    """
    energia_pf_final_kwh =
        (energia_pf_kwh o 0)
      + (energia_generada_kwh o 0)
      - (energia_frontera_dd_kwh o 0)
    y después recalcula neta y pérdidas.
    """
    energia_pf = cast(float | None, mg.energia_pf_kwh) or 0.0
    energia_gen = cast(float | None, mg.energia_generada_kwh) or 0.0
    energia_frontera = cast(float | None, mg.energia_frontera_dd_kwh) or 0.0

    mg.energia_pf_final_kwh = energia_pf + energia_gen - energia_frontera  # type: ignore[assignment]
    _recalcular_energia_neta_y_perdidas(mg)


# ---------- M1 facturación (energia_bruta_facturada) ----------


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

    try:
        anio, mes = _obtener_periodo_desde_fechas(filas)
    except KeyError as exc:
        raise ValueError("Falta la columna 'Fecha_final' en las filas M1") from exc

    filas_mes = [
        f
        for f in filas
        if _to_date(f["Fecha_final"]).year == anio
        and _to_date(f["Fecha_final"]).month == mes
    ]

    if not filas_mes:
        raise ValueError("No hay filas del mes detectado en el fichero M1")

    try:
        energia_total = sum(_to_float(f.get("Energia_Kwh", 0.0)) for f in filas_mes)
    except Exception as exc:
        raise ValueError("Valores no numéricos en la columna 'Energia_Kwh'") from exc

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

    mg.energia_bruta_facturada = energia_total  # type: ignore[assignment]
    mg.file_id = fichero.id  # type: ignore[assignment]

    _recalcular_energia_neta_y_perdidas(mg)

    db.commit()
    db.refresh(mg)
    return mg


# ---------- M1 autoconsumos (energia_autoconsumo_kwh) ----------


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

    mg.energia_autoconsumo_kwh = energia_total  # type: ignore[assignment]
    mg.file_id = fichero.id  # type: ignore[assignment]

    _recalcular_energia_neta_y_perdidas(mg)

    db.commit()
    db.refresh(mg)
    return mg


# ---------- ACUMCIL (generación: energia_generada_kwh) ----------


def procesar_acumcil_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUMCIL no contiene filas de datos")

    for f in filas:
        mag = f.get("Magnitud", "")
        f["Magnitud_normalizada"] = str(mag).strip().upper()

    filas_as = [f for f in filas if f["Magnitud_normalizada"] == "AS"]
    if not filas_as:
        raise ValueError("No hay filas con Magnitud 'AS' en el fichero ACUMCIL")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_as
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUMCIL"
        ) from exc

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
            punto_id="ACUMCIL",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    mg.energia_generada_kwh = (cast(float | None, mg.energia_generada_kwh) or 0.0) + energia_total  # type: ignore[assignment]
    _recalcular_energia_pf_final(mg)
    mg.file_id = fichero.id  # type: ignore[assignment]

    db.commit()
    db.refresh(mg)
    return mg


# ---------- ACUM H2 GRD (generación adicional: energia_generada_kwh) ----------


def procesar_acum_h2_grd_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 GRD no contiene filas de datos")

    filas_as = [f for f in filas if str(f.get("Magnitud", "")).strip().upper() == "AS"]
    if not filas_as:
        raise ValueError("No hay filas con Magnitud 'AS' en el fichero ACUM H2 GRD")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_as
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 GRD"
        ) from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
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
            punto_id="ACUM_H2_GRD",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    mg.energia_generada_kwh = (cast(float | None, mg.energia_generada_kwh) or 0.0) + energia_total  # type: ignore[assignment]
    _recalcular_energia_pf_final(mg)
    mg.file_id = fichero.id  # type: ignore[assignment]

    db.commit()
    db.refresh(mg)
    return mg


# ---------- ACUM H2 GEN (mismo tratamiento que ACUM H2 GRD) ----------


def procesar_acum_h2_gen_generacion(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    return procesar_acum_h2_grd_generacion(
        db=db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        fichero=fichero,
        filas_raw=filas_raw,
    )


# ---------- ACUM H2 RDD (energia_frontera_dd_kwh) ----------


def procesar_acum_h2_rdd_frontera_dd(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
    magnitud_objetivo: str = "AE",
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 RDD no contiene filas de datos")

    magnitud_objetivo_norm = str(magnitud_objetivo).strip().upper()

    filas_filtradas = [
        f
        for f in filas
        if str(f.get("Magnitud", "")).strip().upper() == magnitud_objetivo_norm
    ]
    if not filas_filtradas:
        raise ValueError(
            f"No hay filas con Magnitud '{magnitud_objetivo_norm}' en el fichero ACUM H2 RDD"
        )

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_filtradas
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 RDD"
        ) from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
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
            punto_id="ACUM_H2_RDD",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    mg.energia_frontera_dd_kwh = (cast(float | None, mg.energia_frontera_dd_kwh) or 0.0) + energia_total  # type: ignore[assignment]
    _recalcular_energia_pf_final(mg)
    mg.file_id = fichero.id  # type: ignore[assignment]

    db.commit()
    db.refresh(mg)
    return mg


# ---------- ACUM H2 RDD (energia_pf_kwh) ----------


def procesar_acum_h2_rdd_pf_kwh(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 RDD (PF) no contiene filas de datos")

    filas_ae = [f for f in filas if str(f.get("Magnitud", "")).strip().upper() == "AE"]
    if not filas_ae:
        raise ValueError("No hay filas con Magnitud 'AE' en el fichero ACUM H2 RDD (PF)")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_ae
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 RDD (PF)"
        ) from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
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
            punto_id="ACUM_H2_RDD_PF",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    mg.energia_pf_kwh = (cast(float | None, mg.energia_pf_kwh) or 0.0) + energia_total  # type: ignore[assignment]
    _recalcular_energia_pf_final(mg)
    mg.file_id = fichero.id  # type: ignore[assignment]

    db.commit()
    db.refresh(mg)
    return mg


# ---------- ACUM H2 TRD (energia_pf_kwh) ----------


def procesar_acum_h2_trd_pf_kwh(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaGeneral:
    filas = list(filas_raw)

    if not filas:
        raise ValueError("El fichero ACUM H2 TRD (PF) no contiene filas de datos")

    filas_ae = [f for f in filas if str(f.get("Magnitud", "")).strip().upper() == "AE"]
    if not filas_ae:
        raise ValueError("No hay filas con Magnitud 'AE' en el fichero ACUM H2 TRD (PF)")

    try:
        energia_total = sum(
            float(str(f.get("Valor_Acumulado_Total_Energia", "0")).replace(",", "."))
            for f in filas_ae
        )
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "Valores no numéricos en 'Valor_Acumulado_Total_Energia' en ACUM H2 TRD (PF)"
        ) from exc

    filename = getattr(fichero, "filename", "") or ""
    nombre = str(filename)
    m = re.search(r"_(\d{4})(\d{2})", nombre)
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
            punto_id="ACUM_H2_TRD_PF",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    mg.energia_pf_kwh = (cast(float | None, mg.energia_pf_kwh) or 0.0) + energia_total  # type: ignore[assignment]
    _recalcular_energia_pf_final(mg)
    mg.file_id = fichero.id  # type: ignore[assignment]

    db.commit()
    db.refresh(mg)
    return mg


# ---------- BALD (M2/M7/M11/ART15) ----------


def procesar_bald_medidas_general(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    periodo_bald: str,  # "M2" | "M7" | "M11" | "ART15"
    fila: Dict[str, Any],
) -> MedidaGeneral:
    periodo_bald_norm = str(periodo_bald).upper()
    if periodo_bald_norm not in {"M2", "M7", "M11", "ART15"}:
        raise ValueError(f"Periodo BALD no reconocido: {periodo_bald}")

    # Pylance a veces tipa anio/mes como Column[int] (por el modelo). Forzamos cast.
    anio = cast(int, fichero.anio)
    mes = cast(int, fichero.mes)

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
            punto_id="BALD",
            anio=anio,
            mes=mes,
        )
        db.add(mg)

    demanda_suministrada = _to_float(fila.get("Demanda_suministrada"))
    demanda_vertida = _to_float(fila.get("Demanda_vertida"))
    adquisicion = _to_float(fila.get("Adquisicion"))
    dd_s = _to_float(fila.get("DD_S"))
    ed = _to_float(fila.get("ED"))
    cil = _to_float(fila.get("CIL"))
    energia_generada = ed + cil

    sufijo = periodo_bald_norm.lower()  # "m2", "m7", "m11", "art15"

    def _set(attr_base: str, valor: float) -> None:
        attr = f"{attr_base}_{sufijo}_kwh"
        setattr(mg, attr, valor)

    _set("energia_publicada", demanda_suministrada)
    _set("energia_autoconsumo", demanda_vertida)
    _set("energia_pf", adquisicion)
    _set("energia_frontera_dd", dd_s)
    _set("energia_generada", energia_generada)

    _recalcular_energia_neta_y_perdidas(mg)

    mg.file_id = fichero.id  # type: ignore[assignment]

    db.commit()
    db.refresh(mg)
    return mg


# ---------- PS (medidas_ps) ----------


def procesar_ps(
    *,
    db: Session,
    tenant_id: int,
    empresa_id: int,
    fichero: IngestionFile,
    filas_raw: Iterable[Dict[str, Any]],
) -> MedidaPS:
    filas = list(filas_raw)
    if not filas:
        raise ValueError("El fichero PS no contiene filas de datos")

    try:
        anio, mes = _obtener_periodo_desde_fechas(filas)
    except KeyError as exc:
        raise ValueError("Falta la columna 'Fecha_final' en las filas PS") from exc

    def _poliza(f: Dict[str, Any]) -> str:
        raw = f.get("Poliza", "")
        if raw is None:
            return ""

        s = str(raw).strip()
        if not s:
            return ""

        try:
            num = float(s.replace(",", "."))
            if not math.isnan(num) and not math.isinf(num):
                num_rounded = int(round(num))
                if 1 <= num_rounded <= 5:
                    return str(num_rounded)
        except (TypeError, ValueError):
            pass

        m_pol = re.search(r"[1-5]", s)
        if m_pol:
            return m_pol.group(0)

        return ""

    def _tarifa(f: Dict[str, Any]) -> str:
        return str(f.get("Tarifa_acceso", "")).strip().upper()

    def _cups(f: Dict[str, Any]) -> str:
        return str(f.get("CUPS", "")).strip()

    energia_por_tipo: dict[int, float] = {}
    cups_por_tipo: dict[int, int] = {}
    importe_por_tipo: dict[int, float] = {}

    for tipo_int in range(1, 6):
        tipo_str = str(tipo_int)
        filas_tipo = [f for f in filas if _poliza(f) == tipo_str]

        energia = sum(_to_float(f.get("Energia_facturada")) for f in filas_tipo)
        cups_set = {_cups(f) for f in filas_tipo if _cups(f)}
        importe = sum(_to_float(f.get("Total")) for f in filas_tipo)

        energia_por_tipo[tipo_int] = energia
        cups_por_tipo[tipo_int] = len(cups_set)
        importe_por_tipo[tipo_int] = importe

    energia_total = sum(energia_por_tipo.values())
    cups_total = sum(cups_por_tipo.values())
    importe_total = sum(importe_por_tipo.values())

    TARIFAS: list[tuple[str, str]] = [
        ("2.0TD", "20td"),
        ("3.0TD", "30td"),
        ("3.0TDVE", "30tdve"),
        ("6.1TD", "61td"),
        ("6.2TD", "62td"),
        ("6.3TD", "63td"),
        ("6.4TD", "64td"),
    ]

    energia_tarifa: dict[str, float] = {sufijo: 0.0 for _, sufijo in TARIFAS}
    cups_tarifa: dict[str, int] = {sufijo: 0 for _, sufijo in TARIFAS}
    importe_tarifa: dict[str, float] = {sufijo: 0.0 for _, sufijo in TARIFAS}

    for codigo, sufijo in TARIFAS:
        filas_tarifa = [f for f in filas if _tarifa(f) == codigo]

        energia_t = sum(_to_float(f.get("Energia_facturada")) for f in filas_tarifa)
        cups_set_t = {_cups(f) for f in filas_tarifa if _cups(f)}
        importe_t = sum(_to_float(f.get("Total")) for f in filas_tarifa)

        energia_tarifa[sufijo] = energia_t
        cups_tarifa[sufijo] = len(cups_set_t)
        importe_tarifa[sufijo] = importe_t

    mp = (
        db.query(MedidaPS)
        .filter_by(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            punto_id="PS",
            anio=anio,
            mes=mes,
        )
        .first()
    )

    if mp is None:
        mp = MedidaPS(  # type: ignore[call-arg]
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            punto_id="PS",
            anio=anio,
            mes=mes,
        )
        db.add(mp)

    mp.energia_ps_tipo_1_kwh = energia_por_tipo[1]  # type: ignore[assignment]
    mp.energia_ps_tipo_2_kwh = energia_por_tipo[2]  # type: ignore[assignment]
    mp.energia_ps_tipo_3_kwh = energia_por_tipo[3]  # type: ignore[assignment]
    mp.energia_ps_tipo_4_kwh = energia_por_tipo[4]  # type: ignore[assignment]
    mp.energia_ps_tipo_5_kwh = energia_por_tipo[5]  # type: ignore[assignment]
    mp.energia_ps_total_kwh = energia_total  # type: ignore[assignment]

    mp.cups_tipo_1 = cups_por_tipo[1]  # type: ignore[assignment]
    mp.cups_tipo_2 = cups_por_tipo[2]  # type: ignore[assignment]
    mp.cups_tipo_3 = cups_por_tipo[3]  # type: ignore[assignment]
    mp.cups_tipo_4 = cups_por_tipo[4]  # type: ignore[assignment]
    mp.cups_tipo_5 = cups_por_tipo[5]  # type: ignore[assignment]
    mp.cups_total = cups_total  # type: ignore[assignment]

    mp.importe_tipo_1_eur = importe_por_tipo[1]  # type: ignore[assignment]
    mp.importe_tipo_2_eur = importe_por_tipo[2]  # type: ignore[assignment]
    mp.importe_tipo_3_eur = importe_por_tipo[3]  # type: ignore[assignment]
    mp.importe_tipo_4_eur = importe_por_tipo[4]  # type: ignore[assignment]
    mp.importe_tipo_5_eur = importe_por_tipo[5]  # type: ignore[assignment]
    mp.importe_total_eur = importe_total  # type: ignore[assignment]

    mp.energia_tarifa_20td_kwh = energia_tarifa["20td"]  # type: ignore[assignment]
    mp.cups_tarifa_20td = cups_tarifa["20td"]  # type: ignore[assignment]
    mp.importe_tarifa_20td_eur = importe_tarifa["20td"]  # type: ignore[assignment]

    mp.energia_tarifa_30td_kwh = energia_tarifa["30td"]  # type: ignore[assignment]
    mp.cups_tarifa_30td = cups_tarifa["30td"]  # type: ignore[assignment]
    mp.importe_tarifa_30td_eur = importe_tarifa["30td"]  # type: ignore[assignment]

    mp.energia_tarifa_30tdve_kwh = energia_tarifa["30tdve"]  # type: ignore[assignment]
    mp.cups_tarifa_30tdve = cups_tarifa["30tdve"]  # type: ignore[assignment]
    mp.importe_tarifa_30tdve_eur = importe_tarifa["30tdve"]  # type: ignore[assignment]

    mp.energia_tarifa_61td_kwh = energia_tarifa["61td"]  # type: ignore[assignment]
    mp.cups_tarifa_61td = cups_tarifa["61td"]  # type: ignore[assignment]
    mp.importe_tarifa_61td_eur = importe_tarifa["61td"]  # type: ignore[assignment]

    mp.energia_tarifa_62td_kwh = energia_tarifa["62td"]  # type: ignore[assignment]
    mp.cups_tarifa_62td = cups_tarifa["62td"]  # type: ignore[assignment]
    mp.importe_tarifa_62td_eur = importe_tarifa["62td"]  # type: ignore[assignment]

    mp.energia_tarifa_63td_kwh = energia_tarifa["63td"]  # type: ignore[assignment]
    mp.cups_tarifa_63td = cups_tarifa["63td"]  # type: ignore[assignment]
    mp.importe_tarifa_63td_eur = importe_tarifa["63td"]  # type: ignore[assignment]

    mp.energia_tarifa_64td_kwh = energia_tarifa["64td"]  # type: ignore[assignment]
    mp.cups_tarifa_64td = cups_tarifa["64td"]  # type: ignore[assignment]
    mp.importe_tarifa_64td_eur = importe_tarifa["64td"]  # type: ignore[assignment]

    mp.file_id = fichero.id  # type: ignore[assignment]

    db.commit()
    db.refresh(mp)
    return mp