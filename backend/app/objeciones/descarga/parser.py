# app/objeciones/descarga/parser.py
# pyright: reportMissingImports=false

"""
Parser de nombres de ficheros AOB.

Formatos soportados (según spec V8 · Opción B tolerante):

  OBJEINCL:   OBJEINCL_CCCC_DDDD_YYYYMM_YYYYMMDD.N
  AOBAGRECL:  AOBAGRECL_DDDD[_CCCC]_YYYYMM_YYYYMMDD.N
  AOBCUPS:    AOBCUPS_DDDD[_CCCC]_YYYYMM_YYYYMMDD.N
  AOBCIL:     AOBCIL_DDDD[_CCCC]_YYYYMM_YYYYMMDD.N

Notas:
  - CCCC = código de comercializadora (4 dígitos).
  - DDDD = código de distribuidora (4 dígitos). En AOB* cruza con
           empresas.codigo_ree del tenant.
  - En AOBAGRECL/AOBCUPS/AOBCIL el CCCC es OPCIONAL (formato tolerante).
  - YYYYMM = año + mes (6 dígitos).
  - YYYYMMDD = fecha de emisión (8 dígitos).
  - N = versión (entero ≥ 0).
  - "Clave base" = nombre SIN el sufijo ".N" — se usa para agrupar
    todas las versiones de un mismo fichero.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


# ── Regex por tipo ────────────────────────────────────────────────────────────

# OBJEINCL lleva SIEMPRE CCCC (comercializadora) y DDDD (distribuidora).
_RE_OBJEINCL = re.compile(
    r"^(?P<tipo>OBJEINCL)"
    r"_(?P<cccc>\d{4})"
    r"_(?P<dddd>\d{4})"
    r"_(?P<aaaamm>\d{6})"
    r"_(?P<yyyymmdd>\d{8})"
    r"\.(?P<version>\d+)$"
)

# AOBAGRECL / AOBCUPS / AOBCIL — DDDD obligatorio, CCCC OPCIONAL (Opción B tolerante).
_RE_AOB = re.compile(
    r"^(?P<tipo>AOBAGRECL|AOBCUPS|AOBCIL)"
    r"_(?P<dddd>\d{4})"
    r"(?:_(?P<cccc>\d{4}))?"          # CCCC opcional
    r"_(?P<aaaamm>\d{6})"
    r"_(?P<yyyymmdd>\d{8})"
    r"\.(?P<version>\d+)$"
)


# ── Resultado del parser ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class AobFilename:
    """
    Representación parseada de un nombre de fichero AOB.

    Atributos:
        nombre:       nombre completo original, ej. "AOBAGRECL_0029_202604_20260415.0"
        tipo:         uno de "OBJEINCL" | "AOBAGRECL" | "AOBCUPS" | "AOBCIL"
        dddd:         código distribuidora (4 dígitos)
        cccc:         código comercializadora (4 dígitos) o None si no viene
        aaaamm:       periodo YYYYMM (6 dígitos)
        yyyymmdd:     fecha de emisión YYYYMMDD (8 dígitos)
        version:      entero ≥ 0 (parte tras el punto)
        clave_base:   nombre sin la extensión ".N" — agrupa versiones del mismo fichero
    """

    nombre:      str
    tipo:        str
    dddd:        str
    cccc:        Optional[str]
    aaaamm:      str
    yyyymmdd:    str
    version:     int
    clave_base:  str


# ── API pública ───────────────────────────────────────────────────────────────

def parse_aob_filename(nombre: str) -> Optional[AobFilename]:
    """
    Intenta parsear un nombre de fichero AOB. Devuelve None si no matchea.

    Es tolerante:
      - AOBAGRECL/AOBCUPS/AOBCIL aceptan con o sin CCCC.
      - OBJEINCL solo matchea con CCCC+DDDD (formato fijo).

    Returns:
        AobFilename si el nombre matchea algún patrón conocido; None si no.
    """
    if not nombre:
        return None

    # Probar OBJEINCL primero (regex más específico).
    m = _RE_OBJEINCL.match(nombre)
    if m:
        return _build_from_match(nombre, m, has_cccc_always=True)

    # Probar AOBAGRECL/AOBCUPS/AOBCIL.
    m = _RE_AOB.match(nombre)
    if m:
        return _build_from_match(nombre, m, has_cccc_always=False)

    return None


def clave_base(nombre: str) -> Optional[str]:
    """
    Devuelve la clave base del fichero (nombre sin ".N") o None si no matchea.
    Atajo cuando solo se necesita la clave base sin el objeto completo.
    """
    parsed = parse_aob_filename(nombre)
    return parsed.clave_base if parsed else None


# ── Helpers internos ──────────────────────────────────────────────────────────

def _build_from_match(nombre: str, m: re.Match[str], *, has_cccc_always: bool) -> AobFilename:
    version_str = m.group("version")
    # La clave base es todo lo que hay antes del ".N"
    dot_idx = nombre.rfind(".")
    clave = nombre[:dot_idx]
    return AobFilename(
        nombre     = nombre,
        tipo       = m.group("tipo"),
        dddd       = m.group("dddd"),
        cccc       = m.group("cccc") if (has_cccc_always or m.group("cccc")) else None,
        aaaamm     = m.group("aaaamm"),
        yyyymmdd   = m.group("yyyymmdd"),
        version    = int(version_str),
        clave_base = clave,
    )