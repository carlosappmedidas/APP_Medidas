# app/envios/parser_inventario.py
# pyright: reportMissingImports=false
"""
Parser para nombres de ficheros AUTOCONSUMO/CUPSCAU/CUPS45/CUPSDAT
enviados al SFTP REE.

A diferencia del parser de envíos M (AGRECL/INMECL/MAGCL/F1/...), estos
ficheros NO llevan periodo de datos: solo fecha de generación.

Estructuras soportadas:
  AUTOCONSUMO_{empresa}_{fechagen}.{ver}.bz2   (mensual)
  CUPSCAU_{empresa}_{fechagen}.{ver}.bz2       (mensual)
  CUPS45_{empresa}_{fechagen}.{ver}.bz2        (diario)
  CUPSDAT_{empresa}_{fechagen}.{ver}.bz2       (diario)

Variantes de respuesta REE (mismo patrón que envíos M):
  ...{ver}.ok.bz2       → REE aceptó el fichero
  ...{ver}.bad{N}.bz2   → REE rechazó (N = número de bad)

Función pública:
  parsear_nombre_inventario(nombre)  → ParsedInventario | None
"""

from __future__ import annotations

import re
from datetime import date
from typing import Optional

from app.envios.schemas_inventario import ParsedInventario


# ── Frecuencia por tipo ───────────────────────────────────────────────────────
FRECUENCIA_POR_TIPO: dict[str, str] = {
    "AUTOCONSUMO": "mensual",
    "CUPSCAU":     "mensual",
    "CUPS45":      "diario",
    "CUPSDAT":     "diario",
}


# ── Regex compartido ──────────────────────────────────────────────────────────
# Componentes:
#   tipo:     AUTOCONSUMO/CUPSCAU/CUPS45/CUPSDAT
#   empresa:  dígitos (codigo_ree)
#   fechagen: 8 dígitos AAAAMMDD
#   ver:      dígitos
#   resp:     opcional .ok | .badN
#   ext:      opcional .bz2

_RESP = r"(?:\.(?P<resp_tipo>ok|bad)(?P<resp_n>\d*))?"
_EXT  = r"(?:\.bz2)?"

# CUPSCAU debe comprobarse ANTES que CUPS45/CUPSDAT por el prefijo común "CUPS"
# (aunque el regex es anclado con ^, mantenemos el orden por claridad).
_RE_AUTOCONSUMO = re.compile(
    rf"^AUTOCONSUMO_(?P<empresa>\d+)_(?P<fechagen>\d{{8}})\.(?P<ver>\d+){_RESP}{_EXT}$"
)
_RE_CUPSCAU = re.compile(
    rf"^CUPSCAU_(?P<empresa>\d+)_(?P<fechagen>\d{{8}})\.(?P<ver>\d+){_RESP}{_EXT}$"
)
_RE_CUPS45 = re.compile(
    rf"^CUPS45_(?P<empresa>\d+)_(?P<fechagen>\d{{8}})\.(?P<ver>\d+){_RESP}{_EXT}$"
)
_RE_CUPSDAT = re.compile(
    rf"^CUPSDAT_(?P<empresa>\d+)_(?P<fechagen>\d{{8}})\.(?P<ver>\d+){_RESP}{_EXT}$"
)


def _parse_fecha(yyyymmdd: str) -> date:
    return date(int(yyyymmdd[0:4]), int(yyyymmdd[4:6]), int(yyyymmdd[6:8]))


def parsear_nombre_inventario(nombre: str) -> Optional[ParsedInventario]:
    """
    Intenta parsear un nombre de fichero de inventario. Devuelve
    ParsedInventario si encaja, None en caso contrario.

    Acepta tanto el fichero original como su respuesta:
      AUTOCONSUMO_0277_20260508.0.bz2          → es_respuesta=False
      AUTOCONSUMO_0277_20260508.0.ok.bz2       → es_respuesta=True, resp='ok'
      CUPS45_0277_20260512.0.bad2.bz2          → es_respuesta=True, resp='bad', n=2
    """
    # Orden importante: CUPSCAU antes que CUPS45/CUPSDAT por prefijo "CUPS"
    # (los regex son anclados pero seguimos el patrón del parser de envíos M).
    for tipo, regex in (
        ("AUTOCONSUMO", _RE_AUTOCONSUMO),
        ("CUPSCAU",     _RE_CUPSCAU),
        ("CUPS45",      _RE_CUPS45),
        ("CUPSDAT",     _RE_CUPSDAT),
    ):
        m = regex.match(nombre)
        if m:
            return _build_parsed(tipo, m, nombre=nombre)
    return None


def _build_parsed(
    tipo: str,
    m: re.Match,
    *,
    nombre: str,
) -> ParsedInventario:
    resp_tipo = m.group("resp_tipo")
    resp_n_raw = m.group("resp_n") or ""
    resp_n: Optional[int] = None
    if resp_tipo == "bad":
        # bad → n=1 implícito; bad2 → n=2; bad3 → n=3...
        resp_n = int(resp_n_raw) if resp_n_raw else 1

    # Construir nombre_base: el nombre sin la respuesta y sin el .bz2
    # ej: AUTOCONSUMO_0277_20260508.0.ok.bz2 → AUTOCONSUMO_0277_20260508.0
    nombre_sin_bz2 = nombre[:-4] if nombre.endswith(".bz2") else nombre
    if resp_tipo:
        sufijo = f".{resp_tipo}{resp_n_raw}"
        nombre_base = nombre_sin_bz2[: -len(sufijo)]
    else:
        nombre_base = nombre_sin_bz2

    return ParsedInventario(
        tipo=tipo,  # type: ignore[arg-type]
        frecuencia=FRECUENCIA_POR_TIPO[tipo],  # type: ignore[arg-type]
        codigo_ree_empresa=m.group("empresa"),
        fecha_generacion=_parse_fecha(m.group("fechagen")),
        version=int(m.group("ver")),
        nombre_base=nombre_base,
        es_respuesta=bool(resp_tipo),
        respuesta_tipo=resp_tipo,  # type: ignore[arg-type]
        respuesta_n=resp_n,
    )


# ── Helper: nombre base desde un nombre de respuesta ──────────────────────────

def nombre_base_original_inventario(nombre_respuesta: str) -> Optional[str]:
    """
    Convierte el nombre de una respuesta REE de inventario en el nombre
    del fichero original al que pertenece.

    Ejemplos:
      AUTOCONSUMO_0277_20260508.0.ok.bz2    → AUTOCONSUMO_0277_20260508.0.bz2
      CUPS45_0277_20260512.0.bad2.bz2       → CUPS45_0277_20260512.0.bz2

    Devuelve None si el patrón no encaja.
    """
    if not nombre_respuesta.endswith(".bz2"):
        return None
    sin_bz2 = nombre_respuesta[:-4]
    # ".ok" al final
    if sin_bz2.endswith(".ok"):
        return sin_bz2[:-3] + ".bz2"
    # ".badN" al final
    idx = sin_bz2.rfind(".bad")
    if idx > 0:
        resto = sin_bz2[idx + 4:]
        if resto == "" or resto.isdigit():
            return sin_bz2[:idx] + ".bz2"
    return None