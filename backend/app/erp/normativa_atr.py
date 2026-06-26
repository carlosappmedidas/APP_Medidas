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

# Código de fases del equipo de medida (SIPS CNMC Tabla 111, campo
# codigoFasesEquipoMedida): "M" monofásico, "T" trifásico.
CODIGO_FASES_LABEL: dict[str, str] = {
    "M": "Monofásico",
    "T": "Trifásico",
}
assert set(get_args(TipoContratoATR)) == set(TIPO_CONTRATO_ATR_LABEL)
assert set(get_args(AutoconsumoTipo)) == set(AUTOCONSUMO_TIPO_LABEL)
assert set(get_args(ModoControlPotencia)) == set(MODO_CONTROL_POTENCIA_LABEL)


def validar_enums_contrato(tipo_contrato_atr, modo_control_potencia) -> tuple[bool, str]:
    """Valida los enums del contrato contra las tablas de arriba (solo en escritura).

    Nota: autoconsumo_tipo ya no vive en contrato (irá al módulo Autoconsumo);
    aquí solo queda el flag es_autoconsumo, que no necesita validación de enum.
    """
    if tipo_contrato_atr is not None and tipo_contrato_atr not in set(get_args(TipoContratoATR)):
        return False, "tipo_contrato_atr inválido (anual, eventual, temporada, obras)"
    if modo_control_potencia and modo_control_potencia not in set(get_args(ModoControlPotencia)):
        return False, "modo_control_potencia inválido (icp, maximetro)"
    return True, ""


# ---------------------------------------------------------------------------
# Tipo de punto de medida (RPUM - RD 1110/2007) segun potencia contratada
# ---------------------------------------------------------------------------
def tipo_punto_medida_rpum(p_max_kw):
    """Tipo de punto de medida segun la potencia contratada maxima (kW).

    RPUM (RD 1110/2007):
      Tipo 5: P <= 15 kW
      Tipo 4: 15 < P <= 50 kW
      Tipo 3: 50 < P <= 450 kW
      Tipo 2: 450 kW < P < 10 MW
      Tipo 1: P >= 10 MW
    Devuelve None si no hay potencia (p.ej. borrador sin periodos).
    """
    if p_max_kw is None:
        return None
    p = float(p_max_kw)
    if p <= 15:
        return 5
    if p <= 50:
        return 4
    if p <= 450:
        return 3
    if p < 10000:
        return 2
    return 1
