# app/topologia/parsers/parser_a1.py
# pyright: reportMissingImports=false
"""
Parser del fichero A1 de la Circular CNMC 8/2021 (BOE-A-2021-21003).
Formato: texto plano separado por ';', sin cabecera.

Mapa de campos (índice 0-based, según Formulario A1 del BOE):
  0    NUDO                       (id nudo — se usa como id_ct provisional)
  1    COORDENADAS X              (UTM, coma decimal)
  2    COORDENADAS Y              (UTM, coma decimal)
  3    COORDENADAS Z              (ignorado)
  4    CNAE                       (CNAE-2009)
  5    COD_TFA                    (código tarifa)
  6    CUPS
  7    MUNICIPIO                  (INE C4)
  8    PROVINCIA                  (INE C2)
  9    ZONA                       (U/SU/RC/RD)
  10   CONEXION                   (A=aérea, S=subterránea)
  11   TENSION                    (kV, coma decimal)
  12   ESTADO_CONTRATO            (0=vigente, 1=sin contrato)
  13   POTENCIA_CONTRATADA        (kW, coma decimal)
  14   POTENCIA_ADSCRITA          (kW, coma decimal)
  15   ENERGIA_ACTIVA_CONSUMIDA   (kWh, coma decimal)
  16   ENERGIA_REACTIVA_CONSUMIDA (kVArh, coma decimal)
  17   AUTOCONSUMO                (0/1)
  18   CINI_EQUIPO_MEDIDA
  19   FECHA_INSTALACION          (dd/mm/aaaa)
  20   LECTURAS
  21   BAJA_SUMINISTRO            (0/1)
  22   CAMBIO_TITULARIDAD         (0/1)
  23   FACTURAS_ESTIMADAS
  24   FACTURAS_TOTAL
  25   CAU
  26   COD_AUTO
  27   COD_GENERACION_AUTO        (entero)
  28   CONEXION_AUTOCONSUMO       (0/1/2)
  29   ENERGIA_AUTOCONSUMIDA      (kWh, coma decimal)
  30   ENERGIA_EXCEDENTARIA       (kWh, coma decimal)

Nota: id_ct se deja None — el cruce CUPS→CT requiere GIS o PRIMER.
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any, Dict, List, Tuple


# ── Conversión UTM ETRS89 huso 30 → WGS84 ────────────────────────────────────

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
    v = valor.strip()
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        return None


def _date(valor: str) -> date | None:
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


def _get(campos: list, idx: int) -> str:
    return campos[idx] if len(campos) > idx else ""


# ── Parser principal ──────────────────────────────────────────────────────────

def parsear_a1(
    contenido: bytes,
    encoding: str = "latin-1",
    utm_zone: int = 30,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parsea el contenido binario del fichero A1 (puntos de suministro).
    Almacena todos los campos definidos en el Formulario A1 del BOE.
    """
    registros: List[Dict[str, Any]] = []
    errores:   List[str]            = []

    texto = contenido.decode(encoding, errors="replace")

    for num, linea in enumerate(texto.splitlines(), start=1):
        linea = linea.strip()
        if not linea:
            continue

        campos = linea.split(";")

        if len(campos) < 7:
            errores.append(f"Línea {num}: insuficientes campos ({len(campos)})")
            continue

        try:
            cups = _str(_get(campos, 6))
            if not cups:
                errores.append(f"Línea {num}: CUPS vacío")
                continue

            utm_x = _float(_get(campos, 1))
            utm_y = _float(_get(campos, 2))

            lat, lon = None, None
            if utm_x is not None and utm_y is not None:
                try:
                    lat, lon = _utm_to_wgs84(utm_x, utm_y, zone=utm_zone)
                except Exception:
                    errores.append(f"Línea {num} ({cups}): error convirtiendo coordenadas UTM")

            registros.append({
                # Identificación
                "cups":     cups,
                "id_ct":    _str(_get(campos, 0)),   # NUDO de conexión del CUPS
                "id_salida": None,  # no existe en A1

                # Clasificación
                "cnae":   _str(_get(campos, 4)),
                "tarifa": _str(_get(campos, 5)),   # COD_TFA

                # Coordenadas
                "utm_x": utm_x,
                "utm_y": utm_y,
                "lat":   lat,
                "lon":   lon,

                # Ubicación
                "municipio": _str(_get(campos, 7)),
                "provincia": _str(_get(campos, 8)),
                "zona":      _str(_get(campos, 9)),
                "conexion":  _str(_get(campos, 10)),  # A=aérea, S=subterránea

                # Características eléctricas
                "tension_kv":             _float(_get(campos, 11)),
                "estado_contrato":        _int(_get(campos, 12)),
                "potencia_contratada_kw": _float(_get(campos, 13)),
                "potencia_adscrita_kw":   _float(_get(campos, 14)),
                "energia_activa_kwh":     _float(_get(campos, 15)),
                "energia_reactiva_kvarh": _float(_get(campos, 16)),

                # Autoconsumo y medida
                "autoconsumo":    _int(_get(campos, 17)),
                "cini_contador":  _str(_get(campos, 18)),   # CINI_EQUIPO_MEDIDA
                "fecha_alta":     _date(_get(campos, 19)),  # FECHA_INSTALACION

                # Gestión
                "lecturas":           _int(_get(campos, 20)),
                "baja_suministro":    _int(_get(campos, 21)),
                "cambio_titularidad": _int(_get(campos, 22)),
                "facturas_estimadas": _int(_get(campos, 23)),
                "facturas_total":     _int(_get(campos, 24)),

                # Autoconsumo detalle
                "cau":                    _str(_get(campos, 25)),
                "cod_auto":               _str(_get(campos, 26)),
                "cod_generacion_auto":    _int(_get(campos, 27)),
                "conexion_autoconsumo":   _int(_get(campos, 28)),
                "energia_autoconsumida_kwh": _float(_get(campos, 29)),
                "energia_excedentaria_kwh":  _float(_get(campos, 30)),
            })

        except Exception as exc:
            errores.append(f"Línea {num}: error inesperado — {exc}")

    return registros, errores
