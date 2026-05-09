# app/dashboard/schemas_envios.py
# pyright: reportMissingImports=false
"""
Schemas Pydantic v2 para el endpoint /dashboard/envios-resumen.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class AlertaPlazo(BaseModel):
    """Información del plazo REE para uno de los Ms (M1/M2/M7) en el mes envío."""

    model_config = ConfigDict(from_attributes=True)

    M: Literal["M1", "M2", "M7"]
    periodo: str
    plazo_fecha: datetime
    plazo_label: str
    estado: Literal["en_plazo", "vence_hoy", "vencido", "enviado"]
    dias_restantes: int
    ficheros_enviados: int


class GrupoPeriodo(BaseModel):
    """Una línea dentro de la tarjeta de un grupo: 1 periodo + 1 M con contadores."""

    periodo: str
    M: Literal["M1", "M2", "M7"]
    ficheros_enviados: int
    respuestas_ok: int
    respuestas_bad: int
    respuestas_pendiente: int


class GrupoResumen(BaseModel):
    """Tarjeta de un grupo de tipos."""

    id: Literal["PM_1_2_3", "PM_4_5", "GEN_4_5"]
    label: str
    tipos: list[str]
    periodos: list[GrupoPeriodo]


class EmpresaGrupoTotales(BaseModel):
    """Totales por grupo dentro de la fila resumen de una empresa."""

    enviados: int
    ok: int
    bad: int
    pendiente: int


class EmpresaGrupoPeriodoDetalle(BaseModel):
    """Detalle de una empresa para un (grupo, periodo, M)."""

    periodo: str
    M: Literal["M1", "M2", "M7"]
    enviados: int
    ok: int
    bad: int
    pendiente: int


class EmpresaResumen(BaseModel):
    """Fila por empresa en el bloque "Detalle por empresa"."""

    empresa_id: int
    empresa_nombre: str
    codigo_ree: str | None
    total_enviados_mes: int
    totales_por_grupo: dict[Literal["PM_1_2_3", "PM_4_5", "GEN_4_5"], EmpresaGrupoTotales]
    detalle_por_grupo: dict[
        Literal["PM_1_2_3", "PM_4_5", "GEN_4_5"],
        list[EmpresaGrupoPeriodoDetalle],
    ]


class EnviosResumenResp(BaseModel):
    """Respuesta de GET /dashboard/envios-resumen."""

    mes_envio: str
    modo: Literal["mensual", "historico"]
    alertas: dict[Literal["M1", "M2", "M7"], AlertaPlazo] | None
    grupos: list[GrupoResumen]
    por_empresa: list[EmpresaResumen]


# ── Histórico jerárquico (Año → Mes → Detalle) ───────────────────────────

class HistoricoMes(BaseModel):
    """Detalle de un mes_envio dentro del histórico anual."""

    mes_envio: str  # "YYYY-MM"
    total_enviados: int
    respuestas_ok: int
    respuestas_bad: int
    grupos: list[GrupoResumen]
    por_empresa: list[EmpresaResumen]


class HistoricoAnio(BaseModel):
    """Resumen de un año completo con sus meses."""

    anio: int
    total_enviados: int
    respuestas_ok: int
    respuestas_bad: int
    totales_por_grupo: dict[Literal["PM_1_2_3", "PM_4_5", "GEN_4_5"], int]
    meses: list[HistoricoMes]


class EnviosHistoricoResp(BaseModel):
    """Respuesta de GET /dashboard/envios-historico."""

    anios: list[HistoricoAnio]
