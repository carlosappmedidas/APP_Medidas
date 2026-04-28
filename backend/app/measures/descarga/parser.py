# app/measures/descarga/parser.py
# pyright: reportMissingImports=false

"""
Parser de nombres de ficheros publicados por REE en el SFTP.

Formato soportado (FASE 1 — solo BALD):

  BALD: BALD_DDDD_YYYYMM_YYYYMMDD.N[.bz2]

Notas:
  - DDDD     = código de distribuidora (4 dígitos). Cruza con empresas.codigo_ree del tenant.
  - YYYYMM   = año + mes del periodo cubierto (6 dígitos).
  - YYYYMMDD = fecha de publicación REE (8 dígitos).
  - N        = versión (entero ≥ 0).
  - "Clave base" = nombre SIN el sufijo ".N" — agrupa todas las versiones de un mismo fichero.

El fichero BALD cubre internamente las ventanas M2 / M7 / M11 / ART15 según la
diferencia entre periodo y fecha de publicación. Esa clasificación NO se hace
aquí — la hace el importador (`procesar_fichero_bald` en app/ingestion/services.py).

Más adelante se podrán añadir aquí más tipos (M1/MAGCL, PS, etc.) sin tocar el
resto del módulo.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


# ── Regex por tipo ────────────────────────────────────────────────────────────

_RE_BALD = re.compile(
    r"^(?P<tipo>BALD)"
    r"_(?P<dddd>\d{4})"
    r"_(?P<aaaamm>\d{6})"
    r"_(?P<yyyymmdd>\d{8})"
    r"\.(?P<version>\d+)"
    r"(?:\.bz2)?$"
)


# ── Resultado del parser ──────────────────────────────────────────────────────

@dataclass(frozen=True)
class PublicacionFilename:
    """
    Representación parseada de un nombre de fichero publicado por REE.

    Atributos:
        nombre:          nombre completo original tal como vino en el SFTP,
                         puede incluir sufijo ".bz2".
        nombre_sin_bz2:  nombre SIN sufijo ".bz2" — se usa para guardar en BD
                         (en IngestionFile.filename) y cruzar con los ficheros
                         importados manualmente.
        tipo:            por ahora siempre "BALD".
        dddd:            código distribuidora (4 dígitos).
        aaaamm:          periodo YYYYMM (6 dígitos).
        yyyymmdd:        fecha de publicación YYYYMMDD (8 dígitos).
        version:         entero ≥ 0 (parte tras el punto).
        clave_base:      nombre sin la extensión ".N" y SIN ".bz2" — agrupa
                         versiones del mismo fichero.
        es_bz2:          True si el nombre original llevaba sufijo ".bz2".
    """

    nombre:          str
    nombre_sin_bz2:  str
    tipo:            str
    dddd:            str
    aaaamm:          str
    yyyymmdd:        str
    version:         int
    clave_base:      str
    es_bz2:          bool


# ── API pública ───────────────────────────────────────────────────────────────

def parse_publicacion_filename(nombre: str) -> Optional[PublicacionFilename]:
    """
    Intenta parsear un nombre de fichero publicado por REE.
    Devuelve None si no matchea ningún patrón conocido.
    """
    if not nombre:
        return None

    m = _RE_BALD.match(nombre)
    if m:
        return _build_from_match(nombre, m, tipo="BALD")

    return None


def clave_base(nombre: str) -> Optional[str]:
    """
    Devuelve la clave base del fichero (nombre sin ".N") o None si no matchea.
    """
    parsed = parse_publicacion_filename(nombre)
    return parsed.clave_base if parsed else None


# ── Helpers internos ──────────────────────────────────────────────────────────

def _build_from_match(nombre: str, m: re.Match[str], *, tipo: str) -> PublicacionFilename:
    version_str = m.group("version")

    nombre_lower = nombre.lower()
    if nombre_lower.endswith(".bz2"):
        nombre_sin_bz2 = nombre[: -len(".bz2")]
        es_bz2 = True
    else:
        nombre_sin_bz2 = nombre
        es_bz2 = False

    dot_idx = nombre_sin_bz2.rfind(".")
    clave = nombre_sin_bz2[:dot_idx]

    return PublicacionFilename(
        nombre         = nombre,
        nombre_sin_bz2 = nombre_sin_bz2,
        tipo           = tipo,
        dddd           = m.group("dddd"),
        aaaamm         = m.group("aaaamm"),
        yyyymmdd       = m.group("yyyymmdd"),
        version        = int(version_str),
        clave_base     = clave,
        es_bz2         = es_bz2,
    )