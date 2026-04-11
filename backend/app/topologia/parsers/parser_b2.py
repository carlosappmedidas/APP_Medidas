# app/topologia/parsers/parser_b2.py
# pyright: reportMissingImports=false
"""
Parser del fichero B2 de la Circular CNMC 8/2021.
Formato: texto plano separado por ';', sin cabecera.

Mapa de campos (índice 0-based):
  0  → IDENTIFICADOR_CT
  1  → CINI
  2  → NOMBRE
  3  → CODIGO_TI
  4  → NUDO_MT_ENTRADA   (no se almacena)
  5  → NUDO_MT_SALIDA    (no se almacena)
  6  → TENSION_KV        (coma decimal)
  7  → (vacío)
  8  → POTENCIA_KVA
  9  → UTM_X             (coma decimal)
  10 → UTM_Y             (coma decimal)
  11 → UTM_Z             (no se almacena)
  12 → MUNICIPIO_INE
  13 → PROVINCIA         (no se almacena)
  14 → ZONA              (no se almacena)
  15 → TIPO_ZONA         (no se almacena)
  16 → PUNTO_FRONTERA    (no se almacena)
  17 → PROPIEDAD         (I=propia / E=cedida)
  18 → (flag)
  19 → FECHA_APS         (dd/mm/yyyy)
  ...resto → datos de inversión, no se almacenan
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any, Dict, List, Tuple


# ── Conversión UTM ETRS89 → WGS84 ────────────────────────────────────────────
# Sin dependencias externas. Error < 1 m en España peninsular huso 30.

_A  = 6_378_137.0
_F  = 1 / 298.257_223_563
_B  = _A * (1 - _F)
_E2 = 1 - (_B / _A) ** 2
_K0 = 0.9996
_E0 = 500_000.0
_N0 = 0.0


def _utm_to_wgs84(easting: float, northing: float, zone: int = 30) -> Tuple[float, float]:
    """Devuelve (lat, lon) en grados decimales WGS84."""
    lon0 = math.radians((zone - 1) * 6 - 180 + 3)
    e1   = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))
    x    = easting - _E0
    y    = northing - _N0

    m  = y / _K0
    mu = m / (_A * (1 - _E2 / 4 - 3 * _E2 ** 2 / 64 - 5 * _E2 ** 3 / 256))

    p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
    p2 = p1 + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
    p3 = p2 + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
    p4 = p3 + (1097 * e1 ** 4 / 512) * math.sin(8 * mu)

    n = _A / math.sqrt(1 - _E2 * math.sin(p4) ** 2)
    t = math.tan(p4) ** 2
    c = _E2 / (1 - _E2) * math.cos(p4) ** 2
    r = _A * (1 - _E2) / (1 - _E2 * math.sin(p4) ** 2) ** 1.5
    d = x / (n * _K0)

    lat = p4 - (n * math.tan(p4) / r) * (
        d ** 2 / 2
        - (5 + 3 * t + 10 * c - 4 * c ** 2 - 9 * _E2 / (1 - _E2)) * d ** 4 / 24
        + (61 + 90 * t + 298 * c + 45 * t ** 2 - 252 * _E2 / (1 - _E2) - 3 * c ** 2) * d ** 6 / 720
    )
    lon = lon0 + (
        d
        - (1 + 2 * t + c) * d ** 3 / 6
        + (5 - 2 * c + 28 * t - 3 * c ** 2 + 8 * _E2 / (1 - _E2) + 24 * t ** 2) * d ** 5 / 120
    ) / math.cos(p4)

    return math.degrees(lat), math.degrees(lon)


# ── Helpers de tipo ───────────────────────────────────────────────────────────

def _float(valor: str) -> float | None:
    v = valor.strip().replace(",", ".")
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _int(valor: str) -> int | None:
    v = valor.strip().replace(",", ".")
    if not v:
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def _date(valor: str) -> date | None:
    """Parsea dd/mm/yyyy."""
    v = valor.strip()
    if len(v) != 10:
        return None
    try:
        return date(int(v[6:10]), int(v[3:5]), int(v[0:2]))
    except ValueError:
        return None


def _str(valor: str) -> str | None:
    v = valor.strip()
    return v if v else None


# ── Parser principal ──────────────────────────────────────────────────────────

def parsear_b2(
    contenido: bytes,
    encoding: str = "latin-1",
    utm_zone: int = 30,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parsea el contenido binario del fichero B2 (CTs).

    Devuelve:
        registros : lista de dicts listos para insertar en ct_inventario
        errores   : lista de mensajes de líneas con problema
    """
    registros: List[Dict[str, Any]] = []
    errores:   List[str]            = []

    texto = contenido.decode(encoding, errors="replace")

    for num, linea in enumerate(texto.splitlines(), start=1):
        linea = linea.strip()
        if not linea:
            continue

        campos = linea.split(";")

        if len(campos) < 10:
            errores.append(f"Línea {num}: insuficientes campos ({len(campos)})")
            continue

        try:
            id_ct = _str(campos[0])
            if not id_ct:
                errores.append(f"Línea {num}: id_ct vacío")
                continue

            utm_x = _float(campos[9])
            utm_y = _float(campos[10]) if len(campos) > 10 else None

            lat, lon = None, None
            if utm_x is not None and utm_y is not None:
                try:
                    lat, lon = _utm_to_wgs84(utm_x, utm_y, zone=utm_zone)
                except Exception:
                    errores.append(f"Línea {num} ({id_ct}): error convirtiendo coordenadas UTM")

            registros.append({
                "id_ct":         id_ct,
                "cini":          _str(campos[1]),
                "nombre":        _str(campos[2]) or id_ct,
                "codigo_ti":     _str(campos[3]),
                "tension_kv":    _float(campos[6]),
                "potencia_kva":  _int(campos[8]) if len(campos) > 8 else None,
                "utm_x":         utm_x,
                "utm_y":         utm_y,
                "lat":           lat,
                "lon":           lon,
                "municipio_ine": _str(campos[12]) if len(campos) > 12 else None,
                "propiedad":     _str(campos[17]) if len(campos) > 17 else None,
                "fecha_aps":     _date(campos[19]) if len(campos) > 19 else None,
            })

        except Exception as exc:
            errores.append(f"Línea {num}: error inesperado — {exc}")

    return registros, errores
