# app/calendario_laboral/services_festivos.py
# pyright: reportMissingImports=false
"""
Servicio de cálculo automático de festivos Madrid (capital + CCAA + nacionales)
y utilidades para calcular el n-ésimo día hábil de un mes según ese calendario.

Algoritmos puros — NO dependen de internet ni de librerías externas.
La fórmula de Pascua usa el algoritmo de Gauss (válido para el calendario gregoriano).

Festivos cubiertos
──────────────────
• NACIONALES (siempre fijos):
   - 1 enero  · Año Nuevo
   - 6 enero  · Reyes
   - 1 mayo   · Día del Trabajo
   - 15 agosto · Asunción de la Virgen
   - 12 octubre · Fiesta Nacional
   - 1 noviembre · Todos los Santos
   - 6 diciembre · Día de la Constitución
   - 8 diciembre · Inmaculada Concepción
   - 25 diciembre · Navidad

• NACIONALES (móviles, dependen de Pascua):
   - Jueves Santo  (Pascua - 3 días)
   - Viernes Santo (Pascua - 2 días)

• CCAA Madrid:
   - 2 mayo   · Día de la Comunidad de Madrid
   - 9 noviembre · Nuestra Señora de la Almudena

• LOCAL Madrid capital:
   - 15 mayo · San Isidro

NOTA: Estos festivos son la base recurrente. Si en un año concreto el BOE
declara un festivo excepcional (o se traslada uno por caer en domingo),
el usuario podrá sobrescribirlo manualmente desde la página de configuración.

Funciones
─────────
• calcular_pascua(anio) -> date
    Algoritmo de Gauss para calcular el Domingo de Pascua.

• calcular_festivos_madrid(anio) -> list[FestivoCalculado]
    Devuelve la lista completa de festivos Madrid para un año concreto.

• es_dia_habil_madrid(fecha, festivos) -> bool
    True si la fecha NO es sábado/domingo y NO está en `festivos`.

• nth_dia_habil_madrid(anio, mes, n, festivos) -> date | None
    Devuelve el n-ésimo día hábil del mes. None si n excede los días del mes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


# ── Tipo de retorno del cálculo de festivos ──────────────────────────────

@dataclass(frozen=True)
class FestivoCalculado:
    """Representa un festivo calculado automáticamente."""

    fecha: date
    nombre: str
    ambito: str  # "NACIONAL" | "CCAA" | "LOCAL"


# ── Algoritmo de Pascua (Gauss) ──────────────────────────────────────────

def calcular_pascua(anio: int) -> date:
    """
    Calcula el Domingo de Pascua para el calendario gregoriano usando el
    algoritmo de Gauss. Funciona correctamente para todos los años entre
    1583 y 4099, que cubre con creces nuestras necesidades.

    Returns
    -------
    date
        Fecha del Domingo de Pascua en el año indicado.
    """
    # Variables del algoritmo de Gauss (renombradas para evitar warnings
    # de "Ambiguous variable name" sobre `l` y `k` de la versión original).
    a = anio % 19
    b = anio // 100
    c = anio % 100
    d = b // 4
    e = b % 4
    ff = (b + 8) // 25
    g = (b - ff + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    ii = c // 4
    kk = c % 4
    ll = (32 + 2 * e + 2 * ii - h - kk) % 7
    mm = (a + 11 * h + 22 * ll) // 451
    mes = (h + ll - 7 * mm + 114) // 31
    dia = ((h + ll - 7 * mm + 114) % 31) + 1
    return date(anio, mes, dia)


# ── Cálculo de festivos Madrid ───────────────────────────────────────────

def calcular_festivos_madrid(anio: int) -> list[FestivoCalculado]:
    """
    Calcula automáticamente la lista de festivos Madrid (nacionales + CCAA + local)
    para un año dado.

    Returns
    -------
    list[FestivoCalculado]
        Lista de festivos ordenados por fecha ascendente.
    """
    festivos: list[FestivoCalculado] = []

    # ── NACIONALES FIJOS ──────────────────────────────────────────────────
    festivos_fijos_nacionales: list[tuple[int, int, str]] = [
        (1, 1, "Año Nuevo"),
        (1, 6, "Reyes"),
        (5, 1, "Día del Trabajo"),
        (8, 15, "Asunción de la Virgen"),
        (10, 12, "Fiesta Nacional"),
        (11, 1, "Todos los Santos"),
        (12, 6, "Día de la Constitución"),
        (12, 8, "Inmaculada Concepción"),
        (12, 25, "Navidad"),
    ]
    for mes, dia, nombre in festivos_fijos_nacionales:
        festivos.append(
            FestivoCalculado(
                fecha=date(anio, mes, dia),
                nombre=nombre,
                ambito="NACIONAL",
            )
        )

    # ── NACIONALES MÓVILES (Semana Santa) ─────────────────────────────────
    pascua = calcular_pascua(anio)
    festivos.append(
        FestivoCalculado(
            fecha=pascua - timedelta(days=3),
            nombre="Jueves Santo",
            ambito="NACIONAL",
        )
    )
    festivos.append(
        FestivoCalculado(
            fecha=pascua - timedelta(days=2),
            nombre="Viernes Santo",
            ambito="NACIONAL",
        )
    )

    # ── CCAA MADRID ───────────────────────────────────────────────────────
    festivos.append(
        FestivoCalculado(
            fecha=date(anio, 5, 2),
            nombre="Día de la Comunidad de Madrid",
            ambito="CCAA",
        )
    )
    festivos.append(
        FestivoCalculado(
            fecha=date(anio, 11, 9),
            nombre="Nuestra Señora de la Almudena",
            ambito="CCAA",
        )
    )

    # ── LOCAL MADRID CAPITAL ──────────────────────────────────────────────
    festivos.append(
        FestivoCalculado(
            fecha=date(anio, 5, 15),
            nombre="San Isidro",
            ambito="LOCAL",
        )
    )

    festivos.sort(key=lambda f: f.fecha)
    return festivos


# ── Días hábiles ──────────────────────────────────────────────────────────

def es_dia_habil_madrid(fecha: date, festivos: set[date]) -> bool:
    """
    Determina si una fecha concreta es día hábil en Madrid.

    Un día hábil = NO sábado, NO domingo, NO festivo (en el set proporcionado).

    Parameters
    ----------
    fecha : date
    festivos : set[date]
        Conjunto de fechas marcadas como festivo (activo). Se usa set en lugar
        de list para tener acceso O(1) en el bucle de nth_dia_habil_madrid.
    """
    # weekday(): lunes=0, martes=1, ..., sábado=5, domingo=6
    if fecha.weekday() >= 5:
        return False
    if fecha in festivos:
        return False
    return True


def nth_dia_habil_madrid(
    anio: int,
    mes: int,
    n: int,
    festivos: set[date],
) -> date | None:
    """
    Devuelve el n-ésimo día hábil del mes/año indicado.

    Parameters
    ----------
    anio : int
    mes : int  (1-12)
    n : int  (1-based; n=1 es el primer día hábil del mes)
    festivos : set[date]
        Conjunto de festivos activos. Se asume que el caller ha aplicado el
        filtro `activo=True` antes de pasarlos.

    Returns
    -------
    date | None
        La fecha del n-ésimo día hábil, o None si n es mayor que el número
        de días hábiles del mes (caso raro, p.ej. pedir el 25º día hábil).
    """
    if n < 1 or mes < 1 or mes > 12:
        return None

    # Encontrar el primer día del mes y avanzar hasta el último día.
    fecha = date(anio, mes, 1)
    contador = 0

    while fecha.month == mes:
        if es_dia_habil_madrid(fecha, festivos):
            contador += 1
            if contador == n:
                return fecha
        fecha = fecha + timedelta(days=1)

    return None


def nth_dia_natural_mes(anio: int, mes: int, n: int) -> date | None:
    """
    Devuelve el n-ésimo día natural del mes (sencillo: el día n del mes,
    si existe). Útil para plazos que cuentan días naturales (p.ej. M2 = 12º día
    natural).

    Returns None si n es mayor que el número de días del mes (p.ej. 31 en
    febrero).
    """
    if n < 1 or mes < 1 or mes > 12:
        return None
    try:
        return date(anio, mes, n)
    except ValueError:
        return None
