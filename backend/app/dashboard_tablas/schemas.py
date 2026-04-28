# app/dashboard_tablas/schemas.py
# pyright: reportMissingImports=false
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


# =====================================================================
# Schemas comunes
# =====================================================================

VentanaCode = Literal["m1", "m2", "m7", "m11", "art15"]


class EmpresaRef(BaseModel):
    """Referencia mínima a una empresa, igual en mensual e histórico."""
    id: int
    nombre: str
    codigo_ree: str | None = None


# =====================================================================
# Mensual — Medidas General
# =====================================================================

class MensualGeneralVentanaCard(BaseModel):
    """
    Tarjeta del pipeline (M1, M2, M7, M11, ART15).
    Representa el estado del último mes con datos de esa ventana.
    """
    ventana: VentanaCode
    anio: int | None = None              # null si la ventana aún no tiene datos
    mes: int | None = None
    energia_kwh: float = 0.0
    perdidas_pct: float | None = None
    empresas_con_dato: int = 0
    empresas_total: int = 0


class MensualGeneralEmpresaVentanaCelda(BaseModel):
    """Celda de la tabla 'detalle por empresa' (una empresa × una ventana)."""
    energia_kwh: float | None = None     # null = pendiente / no recibido
    perdidas_kwh: float | None = None
    perdidas_pct: float | None = None
    pendiente: bool = False              # True si la celda está en 'pendiente'


class MensualGeneralEmpresaDespliegueCelda(BaseModel):
    """
    Celda de la mini-tabla del despliegue por empresa
    (mes_afectado × ventana). Si la ventana no aplica para ese mes, value=null.
    """
    energia_kwh: float | None = None
    perdidas_pct: float | None = None
    es_ultima_publicacion: bool = False


class MensualGeneralEmpresaDespliegueFila(BaseModel):
    """Una fila del despliegue: un mes afectado y sus 5 ventanas."""
    anio: int
    mes: int
    celdas: dict[VentanaCode, MensualGeneralEmpresaDespliegueCelda]


class MensualGeneralEmpresaDetalle(BaseModel):
    """Una fila 'detalle por empresa' del bloque General."""
    empresa: EmpresaRef
    celdas: dict[VentanaCode, MensualGeneralEmpresaVentanaCelda]
    despliegue_meses: list[MensualGeneralEmpresaDespliegueFila]
    """Los meses afectados por la publicación de cada ventana, listos para mostrar."""


class MensualGeneralBlock(BaseModel):
    pipeline: list[MensualGeneralVentanaCard]
    detalle_por_empresa: list[MensualGeneralEmpresaDetalle]


# =====================================================================
# Mensual — Medidas PS
# =====================================================================

class MensualPSKpis(BaseModel):
    cups_total: int
    cups_delta_vs_mes_anterior: int | None = None
    energia_kwh: float
    energia_pct_vs_mes_anterior: float | None = None
    importe_eur: float
    importe_pct_vs_mes_anterior: float | None = None


class MensualPSRepartoCard(BaseModel):
    """
    Tarjeta de reparto (por tarifa o por tipo).
    'codigo' es el identificador legible: '20td','30td','30tdve','61td' o
    'tipo_1','tipo_2','tipo_3','tipo_4','tipo_5'.
    """
    codigo: str
    cups: int
    energia_kwh: float
    importe_eur: float


class MensualPSRepartoBlock(BaseModel):
    por_tarifa: list[MensualPSRepartoCard]
    por_tipo: list[MensualPSRepartoCard]


class MensualPSEmpresaCelda(BaseModel):
    cups: int | None = None
    energia_kwh: float | None = None
    importe_eur: float | None = None


class MensualPSEmpresaDetalle(BaseModel):
    empresa: EmpresaRef
    por_tarifa: dict[str, MensualPSEmpresaCelda]
    por_tipo: dict[str, MensualPSEmpresaCelda]


class MensualPSBlock(BaseModel):
    anio: int
    mes: int
    empresas_con_dato: int
    empresas_total: int
    kpis: MensualPSKpis
    reparto: MensualPSRepartoBlock
    detalle_por_empresa: list[MensualPSEmpresaDetalle]


# =====================================================================
# Mensual — Banda de salud (carga del mes)
# =====================================================================

class MensualBandaPendienteGrupo(BaseModel):
    """Un grupo de pendientes agrupado por ventana + mes.
    El frontend pinta la cabecera (label) en negrita y luego la lista de empresas.
    """
    ventana: VentanaCode
    anio: int
    mes: int
    label: str
    """Cabecera ya formateada lista para mostrar, ej. 'falta M11 jun 2025'."""
    empresas: list[str]
    """Nombres de las empresas que faltan en este grupo."""


class MensualBandaSalud(BaseModel):
    ficheros_recibidos: int
    ficheros_esperados: int
    ventanas_completas: int
    ventanas_total: int
    ps_completas: int
    ps_total: int
    pendientes_resumen: str | None = None
    """Texto plano del resumen — fallback si el frontend no usa pendientes_grupos."""
    pendientes_grupos: list[MensualBandaPendienteGrupo] = []
    """Pendientes estructurados por ventana/mes para que el frontend los formatee."""


# =====================================================================
# Mensual — respuesta global
# =====================================================================

class MensualResponse(BaseModel):
    carga_anio: int
    carga_mes: int
    banda_salud: MensualBandaSalud
    general: MensualGeneralBlock
    ps: MensualPSBlock


# =====================================================================
# Histórico — Medidas General
# =====================================================================

class HistoricoGeneralAnioTarjeta(BaseModel):
    anio: int
    estado: Literal["en_curso", "en_regularizacion", "cerrado", "solo_m1"]
    meses_con_dato: int
    empresas: int
    energia_kwh: float
    perdidas_pct: float | None = None
    art15_meses_cerrados: int
    art15_meses_total: int


class HistoricoGeneralMesCeldaVentana(BaseModel):
    energia_kwh: float | None = None
    perdidas_pct: float | None = None
    es_ultima_publicacion: bool = False


class HistoricoGeneralMesEmpresaFila(BaseModel):
    """Fila de empresa dentro del despliegue de un mes."""
    empresa: EmpresaRef
    celdas: dict[VentanaCode, HistoricoGeneralMesCeldaVentana]


class HistoricoGeneralMesFila(BaseModel):
    """Fila de mes dentro del despliegue de un año."""
    anio: int
    mes: int
    celdas: dict[VentanaCode, HistoricoGeneralMesCeldaVentana]
    desglose_por_empresa: list[HistoricoGeneralMesEmpresaFila]


class HistoricoGeneralAnioDetalle(BaseModel):
    """Detalle expandido de un año: 12 meses × 5 ventanas + totales."""
    anio: int
    meses: list[HistoricoGeneralMesFila]
    total: dict[VentanaCode, HistoricoGeneralMesCeldaVentana]


class HistoricoGeneralEmpresaAnioTarjeta(BaseModel):
    """Tarjeta-año pequeña para el desglose por empresa (compacta).

    Muestra los datos del año filtrados a una empresa concreta.
    """
    anio: int
    meses_con_dato: int
    energia_kwh: float
    perdidas_pct: float | None = None
    art15_meses_cerrados: int
    art15_meses_total: int
    sin_datos: bool = False
    """True cuando esa empresa no tiene ningún dato en ese año."""


class HistoricoGeneralEmpresaDetalle(BaseModel):
    """Una empresa con sus 5 tarjetas-año + detalle por año (mes a mes)."""
    empresa: EmpresaRef
    anios: list[HistoricoGeneralEmpresaAnioTarjeta]
    detalle_anios: list[HistoricoGeneralAnioDetalle]
    """Mismo tipo que el detalle global, pero filtrado a esta empresa.
    Cada HistoricoGeneralAnioDetalle aquí tendrá desglose_por_empresa con
    una sola entrada (la propia empresa) o vacío."""


class HistoricoGeneralBlock(BaseModel):
    anios: list[HistoricoGeneralAnioTarjeta]
    detalle_anios: list[HistoricoGeneralAnioDetalle]
    """Detalle precalculado de los años visibles. El frontend filtra al expandir."""
    por_empresa: list[HistoricoGeneralEmpresaDetalle] = []
    """Desglose por empresa: cada empresa con sus tarjetas-año y detalle anual."""


# =====================================================================
# Histórico — Medidas PS
# =====================================================================

class HistoricoPSAnioTarjeta(BaseModel):
    anio: int
    estado: Literal["en_curso", "cerrado"]
    meses_con_dato: int
    empresas: int
    cups_final_anio: int
    energia_kwh: float
    importe_eur: float


class HistoricoPSMesFila(BaseModel):
    anio: int
    mes: int
    cups: int
    por_tarifa: dict[str, MensualPSEmpresaCelda]
    por_tipo: dict[str, MensualPSEmpresaCelda]


class HistoricoPSAnioDetalle(BaseModel):
    anio: int
    meses: list[HistoricoPSMesFila]
    total: MensualPSEmpresaCelda
    """Total acumulado del año (cups final + suma energia/importe)."""


class HistoricoPSEmpresaAnioTarjeta(BaseModel):
    """Tarjeta-año pequeña para el desglose PS por empresa."""
    anio: int
    meses_con_dato: int
    cups_final_anio: int
    energia_kwh: float
    importe_eur: float
    sin_datos: bool = False


class HistoricoPSEmpresaDetalle(BaseModel):
    """Una empresa con sus 5 tarjetas-año PS + detalle por año (mes a mes)."""
    empresa: EmpresaRef
    anios: list[HistoricoPSEmpresaAnioTarjeta]
    detalle_anios: list[HistoricoPSAnioDetalle]


class HistoricoPSBlock(BaseModel):
    anios: list[HistoricoPSAnioTarjeta]
    detalle_anios: list[HistoricoPSAnioDetalle]
    por_empresa: list[HistoricoPSEmpresaDetalle] = []
    """Desglose por empresa: cada empresa con sus tarjetas-año y detalle anual."""



# =====================================================================
# Histórico — respuesta global
# =====================================================================

class HistoricoResponse(BaseModel):
    anios_visibles: list[int]
    """Lista de los años que el endpoint ha decidido devolver, p.ej. [2026..2022]."""
    general: HistoricoGeneralBlock
    ps: HistoricoPSBlock