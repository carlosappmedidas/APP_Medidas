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


def normalizar_identificador(v):
    """Forma canónica del documento para guardar/buscar: mayúsculas, sin guiones ni espacios. None si vacío."""
    if v is None:
        return None
    n = _norm(v)
    return n or None


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


def validar_codigos_cnmc(db, dir_tipo_via=None, dir_piso=None, dir_puerta=None, dir_tipo_aclarador=None) -> tuple[bool, str]:
    """Valida que los codigos de direccion existan y esten activos en su catalogo CNMC.

    Bloqueante: solo comprueba los campos que traen valor. Devuelve (False, msg) al primer fallo.
    Import local de los modelos para evitar import circular (validators -> models).
    """
    from app.erp.models import (
        ErpCnmcTipoVia, ErpCnmcPiso, ErpCnmcPuerta, ErpCnmcAclaradorFinca,
    )

    comprobaciones = [
        (dir_tipo_via, ErpCnmcTipoVia, "tipo de via"),
        (dir_piso, ErpCnmcPiso, "piso"),
        (dir_puerta, ErpCnmcPuerta, "puerta"),
        (dir_tipo_aclarador, ErpCnmcAclaradorFinca, "tipo de aclarador"),
    ]
    for valor, modelo, etiqueta in comprobaciones:
        cod = (valor or "").strip()
        if not cod:
            continue
        fila = db.query(modelo).filter(modelo.codigo == cod).first()
        if fila is None:
            return False, f"El codigo de {etiqueta} '{cod}' no existe en el catalogo CNMC"
        if not fila.activo:
            return False, f"El codigo de {etiqueta} '{cod}' esta dado de baja en el catalogo CNMC"
    return True, ""


def validar_telefono_es(valor, solo_movil=False) -> tuple[bool, str]:
    """Valida un telefono espanol. Solo si trae valor (campos opcionales).

    Acepta prefijo +34 / 0034 / 34 opcional y 9 digitos.
    - telefono general: empieza por 6, 7, 8 o 9.
    - movil (solo_movil=True): empieza por 6 o 7.
    Ignora espacios, guiones y parentesis.
    """
    if valor is None:
        return True, ""
    v = str(valor).strip()
    if not v:
        return True, ""
    limpio = v.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if limpio.startswith("+34"):
        limpio = limpio[3:]
    elif limpio.startswith("0034"):
        limpio = limpio[4:]
    elif limpio.startswith("34") and len(limpio) == 11:
        limpio = limpio[2:]
    if not limpio.isdigit() or len(limpio) != 9:
        return False, "Telefono invalido (9 digitos, admite prefijo +34)"
    if solo_movil:
        if limpio[0] not in ("6", "7"):
            return False, "Movil invalido (debe empezar por 6 o 7)"
    else:
        if limpio[0] not in ("6", "7", "8", "9"):
            return False, "Telefono invalido (debe empezar por 6, 7, 8 o 9)"
    return True, ""


def normalizar_cups(v):
    """Forma canonica del CUPS para guardar: mayusculas, sin guiones ni espacios. None si vacio."""
    if v is None:
        return None
    n = _norm(v)
    return n or None


def validar_geolocalizacion(utm_x=None, utm_y=None, utm_huso=None, latitud=None, longitud=None) -> tuple[bool, str]:
    """Valida rangos de geolocalizacion. Solo campos con valor (todos opcionales).

    - latitud: -90..90 ; longitud: -180..180
    - huso UTM: 28..31 (Espana: peninsula + Canarias)
    - coherencia X/Y: si viene una de utm_x/utm_y, debe venir la otra
    """
    def _num(v):
        if v is None or v == "":
            return None, False
        try:
            return float(v), False
        except (TypeError, ValueError):
            return None, True

    lat, e_lat = _num(latitud)
    lon, e_lon = _num(longitud)
    x, e_x = _num(utm_x)
    y, e_y = _num(utm_y)
    huso, e_huso = _num(utm_huso)

    if e_lat or e_lon or e_x or e_y or e_huso:
        return False, "Geolocalizacion: valor numerico invalido"
    if lat is not None and not (-90.0 <= lat <= 90.0):
        return False, "Latitud fuera de rango (-90 a 90)"
    if lon is not None and not (-180.0 <= lon <= 180.0):
        return False, "Longitud fuera de rango (-180 a 180)"
    if huso is not None and not (28 <= huso <= 31):
        return False, "Huso UTM fuera de rango para Espana (28 a 31)"
    if (x is None) != (y is None):
        return False, "Coordenadas UTM incompletas: indique X e Y juntas"
    return True, ""
