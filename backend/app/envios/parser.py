# app/envios/parser.py
# pyright: reportMissingImports=false
"""
Parser para nombres de ficheros AGRECL/INMECL/MAGCL enviados al SFTP REE.

Estructuras soportadas:
  AGRECL_{empresa}_{fechagen}.{ver}.bz2
  MAGCL_{empresa}_{periodo}_{fechagen}.{ver}.bz2
  INMECL_{empresa}_{comerc}_{periodo}_{fechagen}.{ver}.bz2

Variantes de respuesta REE:
  ...{ver}.ok.bz2       → REE aceptó el fichero
  ...{ver}.bad{N}.bz2   → REE rechazó (N = número de bad)

Funciones:
  parsear_nombre_envio(nombre)  → ParsedEnvio | None
  clasificar_m(periodo_anio, periodo_mes, fecha_gen)  → 'M1' | 'M2' | 'M7' | None
"""

from __future__ import annotations

import re
from datetime import date
from typing import Optional

from app.envios.schemas import ParsedEnvio


# ── Regex por tipo ────────────────────────────────────────────────────────────
# Componentes:
#   tipo: AGRECL/INMECL/MAGCL
#   empresa: 4+ dígitos (codigo_ree)
#   comerc:  4+ dígitos (solo INMECL)
#   periodo: 6 dígitos AAAAMM (INMECL/MAGCL)
#   fechagen: 8 dígitos AAAAMMDD
#   ver: dígitos
#   resp: opcional .ok | .badN
#   ext: opcional .bz2

_RESP = r"(?:\.(?P<resp_tipo>ok|bad)(?P<resp_n>\d*))?"
_EXT  = r"(?:\.bz2)?"

_RE_AGRECL = re.compile(
    rf"^AGRECL_(?P<empresa>\d+)_(?P<fechagen>\d{{8}})\.(?P<ver>\d+){_RESP}{_EXT}$"
)

_RE_MAGCL = re.compile(
    rf"^MAGCL_(?P<empresa>\d+)_(?P<periodo>\d{{6}})_(?P<fechagen>\d{{8}})\.(?P<ver>\d+){_RESP}{_EXT}$"
)

_RE_INMECL = re.compile(
    rf"^INMECL_(?P<empresa>\d+)_(?P<comerc>\d+)_(?P<periodo>\d{{6}})_(?P<fechagen>\d{{8}})\.(?P<ver>\d+){_RESP}{_EXT}$"
)


def _parse_fecha(yyyymmdd: str) -> date:
    return date(int(yyyymmdd[0:4]), int(yyyymmdd[4:6]), int(yyyymmdd[6:8]))


def _parse_periodo(yyyymm: str) -> tuple[int, int]:
    return int(yyyymm[0:4]), int(yyyymm[4:6])


def parsear_nombre_envio(nombre: str) -> Optional[ParsedEnvio]:
    """
    Intenta parsear un nombre de fichero. Devuelve ParsedEnvio si encaja
    con AGRECL/INMECL/MAGCL, None en caso contrario.

    Acepta tanto el fichero original como su respuesta:
      AGRECL_0277_20251229.0.bz2          → es_respuesta=False
      AGRECL_0277_20251229.0.ok.bz2       → es_respuesta=True, resp='ok'
      INMECL_..._20251229.0.bad2.bz2      → es_respuesta=True, resp='bad', n=2
    """
    # Probar AGRECL primero (sin periodo)
    m = _RE_AGRECL.match(nombre)
    if m:
        return _build_parsed("AGRECL", m, comerc=None, periodo=None, nombre=nombre)

    # MAGCL (con periodo, sin comerc)
    m = _RE_MAGCL.match(nombre)
    if m:
        anio, mes = _parse_periodo(m.group("periodo"))
        return _build_parsed("MAGCL", m, comerc=None, periodo=(anio, mes), nombre=nombre)

    # INMECL (con comerc y periodo)
    m = _RE_INMECL.match(nombre)
    if m:
        anio, mes = _parse_periodo(m.group("periodo"))
        return _build_parsed("INMECL", m, comerc=m.group("comerc"), periodo=(anio, mes), nombre=nombre)

    return None


def _build_parsed(
    tipo: str,
    m: re.Match,
    *,
    comerc: Optional[str],
    periodo: Optional[tuple[int, int]],
    nombre: str,
) -> ParsedEnvio:
    resp_tipo = m.group("resp_tipo")
    resp_n_raw = m.group("resp_n") or ""
    resp_n: Optional[int] = None
    if resp_tipo == "bad":
        # bad → n=1 implícito; bad2 → n=2; bad3 → n=3...
        resp_n = int(resp_n_raw) if resp_n_raw else 1

    # Construir nombre_base: el nombre sin la respuesta y sin el .bz2
    # ej: AGRECL_0277_20251229.0.ok.bz2 → AGRECL_0277_20251229.0
    nombre_sin_bz2 = nombre[:-4] if nombre.endswith(".bz2") else nombre
    if resp_tipo:
        # quitar ".ok" o ".bad{N}"
        sufijo = f".{resp_tipo}{resp_n_raw}"
        nombre_base = nombre_sin_bz2[: -len(sufijo)]
    else:
        nombre_base = nombre_sin_bz2

    return ParsedEnvio(
        tipo=tipo,  # type: ignore[arg-type]
        codigo_ree_empresa=m.group("empresa"),
        comercializadora_codigo=comerc,
        periodo_anio=periodo[0] if periodo else None,
        periodo_mes=periodo[1] if periodo else None,
        fecha_generacion=_parse_fecha(m.group("fechagen")),
        version=int(m.group("ver")),
        nombre_base=nombre_base,
        es_respuesta=bool(resp_tipo),
        respuesta_tipo=resp_tipo,  # type: ignore[arg-type]
        respuesta_n=resp_n,
    )


def clasificar_m(
    periodo_anio: Optional[int],
    periodo_mes: Optional[int],
    fecha_generacion: date,
) -> Optional[str]:
    """
    Clasifica un envío como M1/M2/M7 calculando la diferencia entre
    el mes de generación y el mes del periodo de datos.

      M1 = 1 mes de retraso  (datos de Abril, generado en Mayo)
      M2 = 2 meses            (datos de Marzo, generado en Mayo)
      M7 = 7 meses            (datos de Octubre del año anterior)

    Para AGRECL (sin periodo) → devuelve None: el usuario lo elige.
    Para diferencias no contempladas → devuelve None.
    """
    if periodo_anio is None or periodo_mes is None:
        return None

    diff_meses = (fecha_generacion.year - periodo_anio) * 12 + (fecha_generacion.month - periodo_mes)
    if diff_meses == 1:
        return "M1"
    if diff_meses == 2:
        return "M2"
    if diff_meses == 7:
        return "M7"
    return None