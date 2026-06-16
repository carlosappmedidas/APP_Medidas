# app/erp/validators.py
"""
Validadores de formato — ÚNICO punto de mantenimiento de algoritmos.

Cambiar un algoritmo = una función aquí. Reutilizados por schemas.py.
Solo se validan los tipos con algoritmo de control (NIF/DNI, NIE, CIF);
los demás (Pasaporte, NIVA, Carta de trabajo, Otro) no tienen checksum estándar.
"""
import re

_NIF_LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE"
_NIE_PREFIJO = {"X": "0", "Y": "1", "Z": "2"}
_CIF_LETRAS_CONTROL = "JABCDEFGHI"
_CIF_ORG = "ABCDEFGHJNPQRSUVW"

_RE_NIF = re.compile(r"^\d{8}[A-Z]$")
_RE_NIE = re.compile(r"^[XYZ]\d{7}[A-Z]$")
_RE_CIF = re.compile(r"^[A-Z]\d{7}[0-9A-J]$")


def _norm(v: str) -> str:
    return (v or "").strip().upper().replace("-", "").replace(" ", "")


def validar_nif(v: str) -> bool:
    """DNI/NIF persona física: 8 dígitos + letra de control (mod 23)."""
    v = _norm(v)
    if not _RE_NIF.match(v):
        return False
    return _NIF_LETRAS[int(v[:8]) % 23] == v[8]


def validar_nie(v: str) -> bool:
    """NIE: X/Y/Z + 7 dígitos + letra (X->0, Y->1, Z->2, luego mod 23)."""
    v = _norm(v)
    if not _RE_NIE.match(v):
        return False
    num = _NIE_PREFIJO[v[0]] + v[1:8]
    return _NIF_LETRAS[int(num) % 23] == v[8]


def validar_cif(v: str) -> bool:
    """CIF: letra de organización + 7 dígitos + control (dígito o letra)."""
    v = _norm(v)
    if not _RE_CIF.match(v) or v[0] not in _CIF_ORG:
        return False
    pares = sum(int(v[i]) for i in (2, 4, 6))
    impares = 0
    for i in (1, 3, 5, 7):
        d = int(v[i]) * 2
        impares += d // 10 + d % 10
    control = (10 - (pares + impares) % 10) % 10
    c = v[8]
    return int(c) == control if c.isdigit() else c == _CIF_LETRAS_CONTROL[control]


def validar_documento(tipo, identificador) -> tuple[bool, str]:
    """
    Valida el documento según tipo_identificador (TABLA_6).
    Devuelve (ok, mensaje_error). Si falta tipo o identificador, no valida (ok).
    """
    if not tipo or not identificador:
        return True, ""
    v = _norm(identificador)
    if tipo == "DN":
        return validar_nif(v), "DNI inválido (8 dígitos + letra de control)"
    if tipo == "CI":
        return validar_cif(v), "CIF inválido (letra + 7 dígitos + control)"
    if tipo == "NE":
        return validar_nie(v), "NIE inválido (X/Y/Z + 7 dígitos + letra)"
    if tipo == "NI":
        ok = validar_nif(v) or validar_nie(v) or validar_cif(v)
        return ok, "NIF inválido (no es un DNI, NIE ni CIF válido)"
    # PS, NV, CT, OT: sin algoritmo de control estándar
    return True, ""


# ---------------------------------------------------------------------------
# CUPS — 2 letras de control (mod 529 sobre los 16 dígitos).
# Misma tabla de 23 letras que el NIF/NIE.
# ---------------------------------------------------------------------------
def validar_cups_control(cups: str) -> bool:
    """Verifica las 2 letras de control del CUPS ('ES' + 16 dígitos + 2 letras)."""
    v = _norm(cups)
    if len(v) < 20 or v[:2] != "ES" or not v[2:18].isdigit():
        return False
    r = int(v[2:18]) % 529
    esperado = _NIF_LETRAS[r // 23] + _NIF_LETRAS[r % 23]
    return v[18:20] == esperado


# ---------------------------------------------------------------------------
# Formatos simples: CP, código INE de municipio, referencia catastral, email.
# ---------------------------------------------------------------------------
_RE_CP = re.compile(r"^\d{5}$")
_RE_INE = re.compile(r"^\d{5}$")
_RE_CATASTRO = re.compile(r"^[A-Z0-9]{20}$")
_RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validar_cp(v: str) -> bool:
    """Código postal español: 5 dígitos, provincia 01–52."""
    v = (v or "").strip()
    if not _RE_CP.match(v):
        return False
    return 1 <= int(v[:2]) <= 52


def validar_codigo_ine(v: str) -> bool:
    """Código INE de municipio: 5 dígitos."""
    return bool(_RE_INE.match((v or "").strip()))


def validar_ref_catastral(v: str) -> bool:
    """Referencia catastral: 20 caracteres alfanuméricos."""
    return bool(_RE_CATASTRO.match((v or "").strip().upper()))


def validar_email(v: str) -> bool:
    """Formato básico de email."""
    return bool(_RE_EMAIL.match((v or "").strip()))


def validar_formatos_titular(dir_cp, email) -> tuple[bool, str]:
    if dir_cp and not validar_cp(dir_cp):
        return False, "Código postal inválido (5 dígitos, provincia 01–52)"
    if email and not validar_email(email):
        return False, "Email con formato inválido"
    return True, ""


def validar_formatos_suministro(dir_cp, municipio_codigo_ine, ref_catastral) -> tuple[bool, str]:
    if dir_cp and not validar_cp(dir_cp):
        return False, "Código postal inválido (5 dígitos, provincia 01–52)"
    if municipio_codigo_ine and not validar_codigo_ine(municipio_codigo_ine):
        return False, "Código INE de municipio inválido (5 dígitos)"
    if ref_catastral and not validar_ref_catastral(ref_catastral):
        return False, "Referencia catastral inválida (20 caracteres alfanuméricos)"
    return True, ""
