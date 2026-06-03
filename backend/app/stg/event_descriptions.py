# -*- coding: utf-8 -*-
"""
Helper para traducir códigos crudos de eventos PRIME STG a descripciones
humanas en español.

primestg incluye los diccionarios oficiales en `primestg.event_groups`:
  - event_groups:           lista de tuplas (id_grupo, nombre_grupo)
  - meter_event_groups:     subset de grupos aplicables a contadores
  - cnc_event_group:        grupos aplicables a concentradores
  - meter_events:           dict {id_grupo: {id_evento: descripcion}}

Este módulo expone funciones puras (`describir_evento_meter`,
`describir_evento_cnc`) que se pueden usar tanto en endpoints como en
scripts de análisis.

NUNCA persistimos las descripciones en BD: la BD guarda el dato crudo
(event_group + event_code) en `stg_medida.datos`, y la traducción se
hace al renderizar. Así, si primestg actualiza su diccionario, no hay
que migrar datos.
"""

from typing import Optional

try:
    from primestg.event_groups import (
        event_groups as _event_groups_raw,
        meter_events as _meter_events_raw,
        cnc_event_group as _cnc_event_group_raw,
    )

    # Convertir las listas de tuplas a dicts para lookup O(1).
    EVENT_GROUPS_DICT: dict = dict(_event_groups_raw)
    CNC_EVENT_GROUPS_DICT: dict = dict(_cnc_event_group_raw)
    METER_EVENTS_DICT: dict = _meter_events_raw   # ya es dict
except ImportError:
    # Fallback si primestg no está instalado: vacíos
    EVENT_GROUPS_DICT = {}
    CNC_EVENT_GROUPS_DICT = {}
    METER_EVENTS_DICT = {}


def _coerce_int(value) -> Optional[int]:
    """Convierte un valor a int de forma tolerante. None si no es convertible."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def describir_grupo_meter(grupo) -> str:
    """Devuelve el nombre del grupo de eventos de contador."""
    g = _coerce_int(grupo)
    if g is None:
        return "Grupo desconocido"
    return EVENT_GROUPS_DICT.get(g, f"Grupo {g} (no documentado)")


def describir_evento_meter(grupo, codigo) -> dict:
    """
    Para eventos del CONTADOR (S09).

    Devuelve un dict con:
      - grupo (int)
      - codigo (int)
      - descripcion_grupo (str)
      - descripcion_evento (str)

    Si el grupo o código no están en los diccionarios de primestg,
    se devuelve un placeholder informativo en lugar de fallar.
    """
    g = _coerce_int(grupo)
    c = _coerce_int(codigo)

    descripcion_grupo = describir_grupo_meter(g)

    if g is None or c is None:
        descripcion_evento = "Evento sin grupo/código válido"
    else:
        descripcion_evento = (
            METER_EVENTS_DICT.get(g, {}).get(c)
            or f"Código {c} no documentado en Grupo {g}"
        )

    return {
        "grupo": g,
        "codigo": c,
        "descripcion_grupo": descripcion_grupo,
        "descripcion_evento": descripcion_evento,
    }


def describir_evento_cnc(grupo, codigo) -> dict:
    """
    Para eventos del CONCENTRADOR (futuro, cuando se procese G01 etc.).
    Usa el diccionario `cnc_event_group` (los grupos no son los mismos
    que los del meter).
    """
    g = _coerce_int(grupo)
    c = _coerce_int(codigo)

    descripcion_grupo = (
        CNC_EVENT_GROUPS_DICT.get(g, f"Grupo {g} (no documentado)")
        if g is not None
        else "Grupo desconocido"
    )

    # No hay todavía diccionario de códigos por grupo cnc en primestg
    # (sólo los nombres de grupos), así que devolvemos placeholder.
    return {
        "grupo": g,
        "codigo": c,
        "descripcion_grupo": descripcion_grupo,
        "descripcion_evento": f"Código {c} (sin descripción detallada)",
    }
