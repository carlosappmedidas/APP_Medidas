# app/topologia/parsers/parser_b2.py
# pyright: reportMissingImports=false
"""
Parser del fichero B2 de la Circular CNMC 8/2021 (BOE-A-2021-21003).
Formato: texto plano separado por ';', sin cabecera.

Mapa de campos (índice 0-based, según Formulario B2 del BOE):
  0  IDENTIFICADOR_CT
  1  CINI
  2  DENOMINACION
  3  CODIGO_CCUU
  4  NUDO_ALTA
  5  NUDO_BAJA
  6  TENSION_EXPLOTACION    (kV, coma decimal)
  7  TENSION_CONSTRUCCION   (kV, coma decimal)
  8  POTENCIA               (kVA, coma decimal)
  9  COORDENADAS X          (UTM, coma decimal)
  10 COORDENADAS Y          (UTM, coma decimal)
  11 COORDENADAS Z          (ignorado)
  12 MUNICIPIO              (INE C4)
  13 PROVINCIA              (INE C2)
  14 CCAA                   (INE C2)
  15 ZONA                   (U/SU/RC/RD)
  16 ESTADO                 (0/1/2)
  17 MODELO                 (I/M/D/E)
  18 PUNTO_FRONTERA         (0/1)
  19 FECHA_APS              (dd/mm/aaaa)
  20 CAUSA_BAJA             (0/1/2/3)
  21 FECHA_BAJA             (dd/mm/aaaa)
  22 FECHA_IP               (dd/mm/aaaa)
  23 TIPO_INVERSION         (0/1)
  24 IM_TRAMITES            (€)
  25 IM_CONSTRUCCION        (€)
  26 IM_TRABAJOS            (€)
  27 SUBVENCIONES_EUROPEAS  (€)
  28 SUBVENCIONES_NACIONALES(€)
  29 SUBVENCIONES_PRTR      (€)
  30 VALOR_AUDITADO         (€)
  31 FINANCIADO             (% 0-100)
  32 CUENTA
  33 MOTIVACION
  34 AVIFAUNA               (0/1)
  35 IDENTIFICADOR_BAJA
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
        return int(float(v.replace(",", ".")))
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

def parsear_b2(
    contenido: bytes,
    encoding: str = "latin-1",
    utm_zone: int = 30,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parsea el contenido binario del fichero B2 (CTs).
    Almacena todos los campos definidos en el Formulario B2 del BOE.
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
            id_ct = _str(_get(campos, 0))
            if not id_ct:
                errores.append(f"Línea {num}: IDENTIFICADOR_CT vacío")
                continue

            utm_x = _float(_get(campos, 9))
            utm_y = _float(_get(campos, 10))

            lat, lon = None, None
            if utm_x is not None and utm_y is not None:
                try:
                    lat, lon = _utm_to_wgs84(utm_x, utm_y, zone=utm_zone)
                except Exception:
                    errores.append(f"Línea {num} ({id_ct}): error convirtiendo coordenadas UTM")

            registros.append({
                # Identificación
                "id_ct":        id_ct,
                "cini":         _str(_get(campos, 1)),
                "nombre":       _str(_get(campos, 2)) or id_ct,
                "codigo_ccuu":  _str(_get(campos, 3)),

                # Topología
                "nudo_alta":    _str(_get(campos, 4)),
                "nudo_baja":    _str(_get(campos, 5)),

                # Características eléctricas
                "tension_kv":              _float(_get(campos, 6)),
                "tension_construccion_kv": _float(_get(campos, 7)),
                "potencia_kva":            _float(_get(campos, 8)),

                # Coordenadas
                "utm_x": utm_x,
                "utm_y": utm_y,
                "lat":   lat,
                "lon":   lon,

                # Ubicación
                "municipio_ine": _str(_get(campos, 12)),
                "provincia":     _str(_get(campos, 13)),
                "ccaa":          _str(_get(campos, 14)),
                "zona":          _str(_get(campos, 15)),

                # Estado
                "estado":         _int(_get(campos, 16)),
                "modelo":         _str(_get(campos, 17)),
                "punto_frontera": _int(_get(campos, 18)),

                # Fechas
                "fecha_aps":  _date(_get(campos, 19)),
                "causa_baja": _int(_get(campos, 20)),
                "fecha_baja": _date(_get(campos, 21)),
                "fecha_ip":   _date(_get(campos, 22)),

                # Inversión
                "tipo_inversion":          _int(_get(campos, 23)),
                "im_tramites":             _float(_get(campos, 24)),
                "im_construccion":         _float(_get(campos, 25)),
                "im_trabajos":             _float(_get(campos, 26)),
                "subvenciones_europeas":   _float(_get(campos, 27)),
                "subvenciones_nacionales": _float(_get(campos, 28)),
                "subvenciones_prtr":       _float(_get(campos, 29)),
                "valor_auditado":          _float(_get(campos, 30)),
                "financiado":              _float(_get(campos, 31)),
                "cuenta":                  _str(_get(campos, 32)),
                "motivacion":              _str(_get(campos, 33)),
                "avifauna":                _int(_get(campos, 34)),
                "identificador_baja":      _str(_get(campos, 35)),
            })

        except Exception as exc:
            errores.append(f"Línea {num}: error inesperado — {exc}")

    return registros, errores
