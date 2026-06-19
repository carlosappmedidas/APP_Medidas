# app/erp/normativa_atr.py
"""
Tablas y enums normativos ATR — ÚNICO punto de mantenimiento.

Si cambia la norma, se edita AQUÍ (no en schemas.py ni en services.py). Cada
tabla lleva su referencia normativa. Los `Literal` de schemas.py se importan de
este módulo, de modo que añadir/cambiar un código es una sola línea aquí.
"""
from typing import Literal, get_args

# ---------------------------------------------------------------------------
# TABLA_6 — Tipos de documento identificativo del cliente (bloque Cliente ATR)
# Ref.: formatos de intercambio ATR CNMC (Resolución 16-may-2024); gestionatr TABLA_6.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Tipo de persona — clasificacion propia del ERP (fisica / juridica)
# ---------------------------------------------------------------------------
TIPO_PERSONA_LABEL: dict[str, str] = {
    "fisica": "Persona física",
    "juridica": "Persona jurídica",
}

TipoIdentificador = Literal["CI", "DN", "NI", "OT", "NE"]

TIPO_IDENTIFICADOR_LABEL: dict[str, str] = {
    "CI": "CIF",
    "DN": "DNI",
    "NI": "NIF",
    "OT": "Otro",
    "NE": "NIE",
}

# Coherencia: el Literal y la tabla de etiquetas no pueden divergir nunca.
assert set(get_args(TipoIdentificador)) == set(TIPO_IDENTIFICADOR_LABEL), \
    "TipoIdentificador y TIPO_IDENTIFICADOR_LABEL deben tener los mismos códigos"


# ---------------------------------------------------------------------------
# Tipo de contrato de acceso ATR — RD 88/2026 (+ guía ATR Directo Web)
# ---------------------------------------------------------------------------
TipoContratoATR = Literal["anual", "eventual", "temporada", "obras"]
TIPO_CONTRATO_ATR_LABEL: dict[str, str] = {
    "anual": "Anual (prórroga tácita)",
    "eventual": "Eventual (< 12 meses)",
    "temporada": "Temporada",
    "obras": "Suministro de obras",
}

# ---------------------------------------------------------------------------
# Tipo de autoconsumo — RD 244/2019 art. 4
# ---------------------------------------------------------------------------
AutoconsumoTipo = Literal[
    "sin_excedentes",
    "con_excedentes_compensacion",
    "con_excedentes_no_compensacion",
]
AUTOCONSUMO_TIPO_LABEL: dict[str, str] = {
    "sin_excedentes": "Sin excedentes",
    "con_excedentes_compensacion": "Con excedentes — acogido a compensación",
    "con_excedentes_no_compensacion": "Con excedentes — no acogido (venta)",
}

# ---------------------------------------------------------------------------
# Modo de control de potencia — CNMC Circular 3/2020 (maxímetro > 15 kW)
# ---------------------------------------------------------------------------
ModoControlPotencia = Literal["icp", "maximetro"]
MODO_CONTROL_POTENCIA_LABEL: dict[str, str] = {
    "icp": "ICP",
    "maximetro": "Maxímetro",
}

assert set(get_args(TipoContratoATR)) == set(TIPO_CONTRATO_ATR_LABEL)
assert set(get_args(AutoconsumoTipo)) == set(AUTOCONSUMO_TIPO_LABEL)
assert set(get_args(ModoControlPotencia)) == set(MODO_CONTROL_POTENCIA_LABEL)


def validar_enums_contrato(tipo_contrato_atr, autoconsumo_tipo, modo_control_potencia) -> tuple[bool, str]:
    """Valida los enums del contrato contra las tablas de arriba (solo en escritura)."""
    if tipo_contrato_atr is not None and tipo_contrato_atr not in set(get_args(TipoContratoATR)):
        return False, "tipo_contrato_atr inválido (anual, eventual, temporada, obras)"
    if autoconsumo_tipo and autoconsumo_tipo not in set(get_args(AutoconsumoTipo)):
        return False, "autoconsumo_tipo inválido (sin_excedentes, con_excedentes_compensacion, con_excedentes_no_compensacion)"
    if modo_control_potencia and modo_control_potencia not in set(get_args(ModoControlPotencia)):
        return False, "modo_control_potencia inválido (icp, maximetro)"
    return True, ""
