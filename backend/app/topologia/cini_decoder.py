# app/topologia/cini_decoder.py
# pyright: reportMissingImports=false
"""
Decodificador del CINI I28 — Parques de distribución y posiciones equipadas.
Según la Circular CNMC 8/2021 (BOE-A-2021-21003), Anexo II, págs. 156048-156050.

Un CINI I28 tiene 8 caracteres, cada uno codifica una posición:

  Pos 1: Tipo de instalación         (I = Instalación)
  Pos 2: Actividad                   (2 = Distribución)
  Pos 3: Tipo de equipo              (8 = Parques y posiciones equipadas)
  Pos 4: Rango de tensión            (2/3/4/A/B/C)
  Pos 5: Tipo de posición            (1=Parque, 2=Con interruptor, 3=Sin interruptor, 4=SE reparto, 5=Punto Frontera)
  Pos 6: Ubicación/tipología         (depende de pos5)
  Pos 7: Función                     (depende de pos5)
  Pos 8: Tensión nominal             (C..T, U..Z, 1, 2, 5)

Ejemplo: I28C2A2M
  p1=I  → Instalación
  p2=2  → Distribución
  p3=8  → Parques y posiciones equipadas
  p4=C  → 36 kV > U ≥ 1 kV
  p5=2  → Posición con interruptor
  p6=A  → Interior - Blindada
  p7=2  → Transformación
  p8=M  → 15 kV
"""
from __future__ import annotations

from typing import Dict, Optional



# ── Pos 1: Tipo de instalación ────────────────────────────────────────────────
_POS1 = {
    "I": "Instalación",
}

# ── Pos 2: Actividad ─────────────────────────────────────────────────────────
_POS2 = {
    "2": "Distribución",
}

# ── Pos 3: Tipo de equipo ────────────────────────────────────────────────────
_POS3 = {
    "8": "Parques y posiciones equipadas",
}

# ── Pos 4: Rango de tensión ──────────────────────────────────────────────────
_POS4 = {
    "2": "110 kV ≤ U < 220 kV",
    "3": "36 kV ≤ U < 110 kV",
    "4": "1 kV ≤ U < 36 kV",
    "A": "U ≥ 110 kV",
    "B": "110 kV > U ≥ 36 kV",
    "C": "36 kV > U ≥ 1 kV",
}

# ── Pos 5: Tipo de posición ──────────────────────────────────────────────────
_POS5 = {
    "1": "Parque",
    "2": "Posición con interruptor",
    "3": "Posición sin interruptor",
    "4": "Posición en SE reparto",
    "5": "Posición en Punto Frontera",
}

# ── Pos 6: Ubicación/tipología (depende de pos5) ─────────────────────────────
# Si pos5 = "1" (Parque) → tipología del parque
_POS6_PARQUE = {
    "1": "Convencional",
    "2": "Blindada",
    "3": "Híbrida",
}
# Si pos5 = "2".."5" (Posición) → ubicación de la posición
_POS6_POSICION = {
    "A": "Interior - Blindada",
    "B": "Intemperie - Blindada",
    "C": "Interior - Convencional",
    "D": "Intemperie - Convencional",
    "E": "Interior - Híbrida",
    "F": "Intemperie - Híbrida",
    "G": "Móvil - Blindada",
}

# ── Pos 7: Función (depende de pos5) ─────────────────────────────────────────
# Si pos5 = "1" (Parque) → tipo de embarrado
_POS7_PARQUE = {
    "A": "Simple barra",
    "B": "Simple barra partida",
    "C": "Doble barra",
    "D": "Doble barra partida",
    "E": "Tipo H",
    "Z": "Otras",
}
# Si pos5 = "2".."5" (Posición) → función de la celda
_POS7_POSICION = {
    "1": "Línea",
    "2": "Transformación",
    "3": "Acoplamiento",
    "4": "Medida",
    "5": "Reserva",
}

# ── Pos 8: Tensión nominal ───────────────────────────────────────────────────
_POS8 = {
    "C": "1 kV",
    "D": "3 kV",
    "E": "5 kV",
    "F": "5.5 kV",
    "G": "6 kV",
    "H": "6.6 kV",
    "I": "10 kV",
    "J": "11 kV",
    "K": "12 kV",
    "L": "13.2 kV",
    "M": "15 kV",
    "N": "16 kV",
    "O": "20 kV",
    "P": "22 kV",
    "Q": "24 kV",
    "R": "25 kV",
    "S": "30 kV",
    "T": "33 kV",
    "U": "45 kV",
    "V": "50 kV",
    "W": "55 kV",
    "X": "66 kV",
    "Y": "110 kV",
    "Z": "130 kV",
    "1": "132 kV",
    "2": "150 kV",
    "5": "Otros",
}


def decodificar_cini_i28(cini: Optional[str]) -> Dict[str, Optional[str]]:
    """
    Decodifica un CINI I28 completo en sus 8 posiciones.

    Devuelve un dict con claves cini_p1..cini_p8 listos para asignar
    directamente al modelo CtCelda.

    Si el CINI es None, vacío o tiene menos de 8 caracteres,
    devuelve todas las claves con valor None.
    """
    vacio: Dict[str, Optional[str]] = {
        "cini_p1_tipo_instalacion": None,
        "cini_p2_actividad":        None,
        "cini_p3_tipo_equipo":      None,
        "cini_p4_tension_rango":    None,
        "cini_p5_tipo_posicion":    None,
        "cini_p6_ubicacion":        None,
        "cini_p7_funcion":          None,
        "cini_p8_tension_nominal":  None,
    }

    if not cini or len(cini) < 8:
        return vacio

    c1 = cini[0]  # I
    c2 = cini[1]  # 2
    c3 = cini[2]  # 8
    c4 = cini[3]  # C / 2 / 3 / 4 / A / B
    c5 = cini[4]  # 1 / 2 / 3 / 4 / 5
    c6 = cini[5]  # A-G / 1-3
    c7 = cini[6]  # 1-5 / A-Z
    c8 = cini[7]  # C-T, U-Z, 1, 2, 5

    # Pos 6 y 7 dependen de si pos5 indica parque o posición
    es_parque = (c5 == "1")

    if es_parque:
        p6 = _POS6_PARQUE.get(c6)
        p7 = _POS7_PARQUE.get(c7)
    else:
        p6 = _POS6_POSICION.get(c6)
        p7 = _POS7_POSICION.get(c7)

    return {
        "cini_p1_tipo_instalacion": _POS1.get(c1, f"Desconocido ({c1})"),
        "cini_p2_actividad":        _POS2.get(c2, f"Desconocido ({c2})"),
        "cini_p3_tipo_equipo":      _POS3.get(c3, f"Desconocido ({c3})"),
        "cini_p4_tension_rango":    _POS4.get(c4, f"Desconocido ({c4})"),
        "cini_p5_tipo_posicion":    _POS5.get(c5, f"Desconocido ({c5})"),
        "cini_p6_ubicacion":        p6 or f"Desconocido ({c6})",
        "cini_p7_funcion":          p7 or f"Desconocido ({c7})",
        "cini_p8_tension_nominal":  _POS8.get(c8, f"Desconocido ({c8})"),
    }