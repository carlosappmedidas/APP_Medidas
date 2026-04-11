# app/topologia/parsers/parser_b1_b11.py
"""
Parsers para los ficheros B1 y B11 de la Circular CNMC 8/2021 (BOE-A-2021-21003).

B1  — Tramos de líneas de distribución.
      Separador: ; | Sin cabecera
      Campos (índice 0-based, según Formulario B1 del BOE):
        0:  IDENTIFICADOR_TRAMO   C(22) — id único del tramo
        1:  CINI                  C(8)
        2:  CODIGO_CCUU           C(6)  — tipología de instalación
        3:  NUDO_INICIAL          C(22)
        4:  NUDO_FINAL            C(22)
        5:  CCAA_1                C(2)
        6:  CCAA_2                C(2)  — nivel tensión (07=MT, 08=BT, etc.)
        7:  PROPIEDAD             E(1)
        8:  TENSION_EXPLOTACION   D(3,3) — kV (coma decimal)
        9:  TENSION_CONSTRUCCION  D(3,3)
        10: LONGITUD              D(4,3) — km
        11: RESISTENCIA
        12: REACTANCIA
        13: INTENSIDAD
        ...

B11 — Segmentos GIS de los tramos (topología real de la red).
      Separador: ; | Sin cabecera
      Campos (Formulario B1.1 del BOE):
        0: SEGMENTO              C(22) — id único del segmento
        1: IDENTIFICADOR_TRAMO  C(22) — FK al tramo en B1
        2: ORDEN_SEGMENTO       E(3)
        3: N_SEGMENTOS          E(3)
        4: COORD_INI_X          D(12,3) — UTM ETRS89 huso 30
        5: COORD_INI_Y          D(12,3)
        6: COORD_INI_Z          D(12,3) — ignorado
        7: COORD_FIN_X          D(12,3)
        8: COORD_FIN_Y          D(12,3)
        9: COORD_FIN_Z          D(12,3) — ignorado
"""
from __future__ import annotations

import math
from typing import Any


# ─── Conversión UTM ETRS89 huso 30 → WGS84 ───────────────────────────────────

def _utm_to_wgs84(easting: float, northing: float, zone: int = 30) -> tuple[float, float]:
    """Devuelve (lat, lon) en grados decimales WGS84."""
    a  = 6_378_137.0
    f  = 1 / 298.257_223_563
    b  = a * (1 - f)
    e2 = 1 - (b / a) ** 2
    k0 = 0.9996

    x = easting - 500_000.0
    y = northing

    lon0 = math.radians((zone - 1) * 6 - 180 + 3)

    m  = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))

    e1  = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi = (mu
           + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
           + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
           + (151 * e1**3 / 96) * math.sin(6 * mu)
           + (1097 * e1**4 / 512) * math.sin(8 * mu))

    N1 = a / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    T1 = math.tan(phi) ** 2
    C1 = e2 / (1 - e2) * math.cos(phi) ** 2
    R1 = a * (1 - e2) / (1 - e2 * math.sin(phi) ** 2) ** 1.5
    D  = x / (N1 * k0)

    lat = phi - (N1 * math.tan(phi) / R1) * (
        D**2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1**2 - 9 * e2 / (1 - e2)) * D**4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1**2 - 252 * e2 / (1 - e2) - 3 * C1**2) * D**6 / 720
    )
    lon = lon0 + (
        D
        - (1 + 2 * T1 + C1) * D**3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1**2 + 8 * e2 / (1 - e2) + 24 * T1**2) * D**5 / 120
    ) / math.cos(phi)

    return math.degrees(lat), math.degrees(lon)


def _float(val: str) -> float | None:
    try:
        return float(val.strip().replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _int(val: str) -> int | None:
    try:
        return int(val.strip())
    except (ValueError, AttributeError):
        return None


# ─── Parser B1 ────────────────────────────────────────────────────────────────

def parsear_b1(contenido: str) -> list[dict[str, Any]]:
    """
    Parsea el fichero B1 según la estructura del Formulario B1 (BOE-A-2021-21003).

    Campos usados:
      0  → id_tramo          (IDENTIFICADOR_TRAMO)
      1  → cini              (CINI)
      2  → codigo_ccuu       (CODIGO_CCUU)
      3  → nudo_inicio       (NUDO_INICIAL)
      4  → nudo_fin          (NUDO_FINAL)
      5  → ccaa_1
      6  → ccaa_2            (en la práctica contiene nivel tensión: 07/08)
      8  → tension_kv        (TENSION_EXPLOTACION, kV con coma decimal)
      10 → longitud_km       (LONGITUD, km con coma decimal)
    """
    registros: list[dict[str, Any]] = []

    for linea in contenido.splitlines():
        linea = linea.strip()
        if not linea:
            continue

        campos = linea.split(";")
        if len(campos) < 5:
            continue

        id_tramo = campos[0].strip() or None
        if not id_tramo:
            continue

        registros.append({
            "id_tramo":    id_tramo,
            "cini":        campos[1].strip() or None if len(campos) > 1 else None,
            "codigo_ccuu": campos[2].strip() or None if len(campos) > 2 else None,
            "nudo_inicio": campos[3].strip() or None if len(campos) > 3 else None,
            "nudo_fin":    campos[4].strip() or None if len(campos) > 4 else None,
            "nivel_tension": campos[6].strip() or None if len(campos) > 6 else None,
            "tension_kv":  _float(campos[8])  if len(campos) > 8  else None,
            "longitud_km": _float(campos[10]) if len(campos) > 10 else None,
        })

    return registros


# ─── Parser B11 ───────────────────────────────────────────────────────────────

def parsear_b11(contenido: str) -> list[dict[str, Any]]:
    """
    Parsea el fichero B11 según el Formulario B1.1 (BOE-A-2021-21003).

    Campos:
      0 → id_segmento       (SEGMENTO)
      1 → id_tramo          (IDENTIFICADOR_TRAMO)
      2 → orden             (ORDEN_SEGMENTO)
      3 → num_segmentos     (N_SEGMENTOS)
      4 → utm_x_ini         (COORDENADAS_1 X)
      5 → utm_y_ini         (COORDENADAS_1 Y)
      6 → z_ini             (ignorado)
      7 → utm_x_fin         (COORDENADAS_2 X)
      8 → utm_y_fin         (COORDENADAS_2 Y)
      9 → z_fin             (ignorado)
    """
    registros: list[dict[str, Any]] = []

    for linea in contenido.splitlines():
        linea = linea.strip()
        if not linea:
            continue

        campos = linea.split(";")
        if len(campos) < 9:
            continue

        utm_x_ini = _float(campos[4])
        utm_y_ini = _float(campos[5])
        utm_x_fin = _float(campos[7])
        utm_y_fin = _float(campos[8])

        lat_ini = lon_ini = None
        lat_fin = lon_fin = None

        if utm_x_ini and utm_y_ini:
            try:
                lat_ini, lon_ini = _utm_to_wgs84(utm_x_ini, utm_y_ini)
            except Exception:
                pass

        if utm_x_fin and utm_y_fin:
            try:
                lat_fin, lon_fin = _utm_to_wgs84(utm_x_fin, utm_y_fin)
            except Exception:
                pass

        registros.append({
            "id_tramo":  campos[0].strip() or None,   # SEGMENTO — id único del segmento
            "id_linea":  campos[1].strip() or None,   # IDENTIFICADOR_TRAMO — agrupa segmentos
            "orden":     _int(campos[2]),
            "num_tramo": _int(campos[3]),
            "utm_x_ini": utm_x_ini,
            "utm_y_ini": utm_y_ini,
            "utm_x_fin": utm_x_fin,
            "utm_y_fin": utm_y_fin,
            "lat_ini":   lat_ini,
            "lon_ini":   lon_ini,
            "lat_fin":   lat_fin,
            "lon_fin":   lon_fin,
        })

    return registros
