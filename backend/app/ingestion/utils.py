# app/ingestion/utils.py
import unicodedata

def norm_header(s: str) -> str:
    """
    Normaliza nombres de cabecera para poder buscarlos
    sin preocuparnos de espacios, mayúsculas, acentos, etc.
    """
    s = s.strip().lower()
    # quitar acentos
    s = "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )
    s = s.replace(" ", "_")
    return s