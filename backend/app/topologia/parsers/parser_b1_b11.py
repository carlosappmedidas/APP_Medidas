# app/topologia/parsers/parser_b1_b11.py
"""
Parsers para los ficheros B1 y B11 de la Circular CNMC 8/2021 (BOE-A-2021-21003).

B1  — Tramos de líneas de distribución.
      Separador: ; | Sin cabecera
      Campos (índice 0-based, según Formulario B1 del BOE):
        0:  IDENTIFICADOR_TRAMO      C(22) — id único del tramo
        1:  CINI                     C(8)
        2:  CODIGO_CCUU              C(6)  — tipología de instalación
        3:  NUDO_INICIAL             C(22)
        4:  NUDO_FINAL               C(22)
        5:  CCAA_1                   C(2)
        6:  CCAA_2 / nivel_tension   C(2)  — 07=MT, 08=BT
        7:  PROPIEDAD                E(1)  — 0=terceros, 1=propia
        8:  TENSION_EXPLOTACION      D(3,3) — kV
        9:  TENSION_CONSTRUCCION     D(3,3) — kV
        10: LONGITUD                 D(4,3) — km
        11: RESISTENCIA              D(4,3) — ohmios
        12: REACTANCIA               D(4,3) — ohmios
        13: INTENSIDAD               D(4,3) — amperios
        14: (campo sin uso)
        15: PUNTO_FRONTERA           E(1)  — 0=no, 1=sí
        16: MODELO                   C(1)  — I=inventario, M=modelo red
        17: OPERACION                E(1)  — 0=abierto, 1=activo
        18: FECHA_APS                dd/mm/aaaa
        19: CAUSA_BAJA               E(1)  — 0=activo, 1/2/3=baja
        20: FECHA_BAJA               dd/mm/aaaa

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
from datetime import date
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


def _date(val: str) -> date | None:
    """Parsea fecha dd/mm/aaaa → date. Devuelve None si vacía o inválida."""
    v = val.strip()
    if not v or len(v) != 10:
        return None
    try:
        d, m, y = v.split("/")
        return date(int(y), int(m), int(d))
    except (ValueError, AttributeError):
        return None


def _get(campos: list[str], idx: int) -> str:
    """Devuelve el campo en el índice dado o cadena vacía si no existe."""
    return campos[idx].strip() if len(campos) > idx else ""


# ─── Parser B1 ────────────────────────────────────────────────────────────────

def parsear_b1(contenido: str) -> list[dict[str, Any]]:
    """
    Parsea el fichero B1 según el Formulario B1 (BOE-A-2021-21003).
    Extrae todos los campos relevantes para el tooltip del mapa.
    """
    registros: list[dict[str, Any]] = []

    for linea in contenido.splitlines():
        linea = linea.strip()
        if not linea:
            continue

        campos = linea.split(";")
        if len(campos) < 5:
            continue

        id_tramo = _get(campos, 0) or None
        if not id_tramo:
            continue

        registros.append({
            # Identificación
            "id_tramo":    id_tramo,
            "cini":        _get(campos, 1)  or None,
            "codigo_ccuu": _get(campos, 2)  or None,

            # Topología
            "nudo_inicio": _get(campos, 3)  or None,
            "nudo_fin":    _get(campos, 4)  or None,
            "ccaa_1":      _get(campos, 5)  or None,

            # Nivel tensión (campo 6 en práctica contiene 07/08)
            "nivel_tension": _get(campos, 6) or None,

            # Características eléctricas
            "propiedad":              _int(_get(campos, 7)),
            "tension_kv":             _float(_get(campos, 8)),
            "tension_construccion_kv": _float(_get(campos, 9)),
            "longitud_km":            _float(_get(campos, 10)),
            "resistencia_ohm":        _float(_get(campos, 11)),
            "reactancia_ohm":         _float(_get(campos, 12)),
            "intensidad_a":           _float(_get(campos, 13)),

            # Estado
            "punto_frontera": _int(_get(campos, 15)),
            "modelo":         _get(campos, 16) or None,
            "operacion":      _int(_get(campos, 17)),
            "fecha_aps":      _date(_get(campos, 18)),
            "causa_baja":     _int(_get(campos, 19)),
            "fecha_baja":     _date(_get(campos, 20)),
        })

    return registros


# ─── Parser B11 ───────────────────────────────────────────────────────────────

def parsear_b11(contenido: str) -> list[dict[str, Any]]:
    """
    Parsea el fichero B11 según el Formulario B1.1 (BOE-A-2021-21003).
    Convierte coordenadas UTM ETRS89 huso 30 → WGS84.
    """
    registros: list[dict[str, Any]] = []

    for linea in contenido.splitlines():
        linea = linea.strip()
        if not linea:
            continue

        campos = linea.split(";")
        if len(campos) < 9:
            continue

        utm_x_ini = _float(_get(campos, 4))
        utm_y_ini = _float(_get(campos, 5))
        utm_x_fin = _float(_get(campos, 7))
        utm_y_fin = _float(_get(campos, 8))

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
            "id_tramo":  _get(campos, 0) or None,   # SEGMENTO
            "id_linea":  _get(campos, 1) or None,   # IDENTIFICADOR_TRAMO
            "orden":     _int(_get(campos, 2)),
            "num_tramo": _int(_get(campos, 3)),
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
