# app/topologia/parsers/parser_b22.py
# pyright: reportMissingImports=false
"""
Parser del fichero B22 (Circular CNMC 8/2021).
Formato: 7 campos separados por ';'

  pos0  id_ct            — IDENTIFICADOR_CT (coincide con B2)
  pos1  id_celda         — IDENTIFICADOR_CELDA
  pos2  id_transformador — IDENTIFICADOR_MAQUINA (vacío si no es celda de trafo)
  pos3  cini             — I28C2A1M / I28C2A2M / I28C3A1M
  pos4  posicion         — 0=con interruptor automático, 1=sin auto, 2=sin interruptor
  pos5  en_servicio      — 0=terceros, 1=compañía
  pos6  anio_instalacion — AÑO_PS
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple


def parsear_b22(
    contenido: bytes,
    encoding: str = "latin-1",
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parsea el contenido binario del fichero B22.
    Devuelve (registros, errores).
    No lanza excepciones — los errores se acumulan en la lista.
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
            errores.append(f"Línea {num}: solo {len(campos)} campos (se esperan 7)")
            continue

        id_ct    = campos[0].strip()
        id_celda = campos[1].strip()

        if not id_ct:
            errores.append(f"Línea {num}: id_ct vacío")
            continue
        if not id_celda:
            errores.append(f"Línea {num}: id_celda vacío")
            continue

        id_transformador = campos[2].strip() or None
        cini             = campos[3].strip() or None

        posicion = None
        try:
            posicion = int(campos[4].strip())
        except (ValueError, IndexError):
            pass

        en_servicio = None
        try:
            en_servicio = int(campos[5].strip())
        except (ValueError, IndexError):
            pass

        anio_instalacion = None
        try:
            anio_instalacion = int(campos[6].strip())
        except (ValueError, IndexError):
            pass

        registros.append({
            "id_ct":            id_ct,
            "id_celda":         id_celda,
            "id_transformador": id_transformador,
            "cini":             cini,
            "posicion":         posicion,
            "en_servicio":      en_servicio,
            "anio_instalacion": anio_instalacion,
        })

    return registros, errores
