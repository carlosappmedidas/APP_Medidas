# app/erp/services_contrato.py
# pyright: reportArgumentType=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportCallIssue=false, reportAttributeAccessIssue=false, reportAssignmentType=false
"""
Servicios del contrato ERP (E-6b).

Reglas de negocio:
  1. Periodos según la tarifa: cada `periodo` de potencia debe existir en
     erp_tarifa_periodo (tipo='potencia') para la tarifa del contrato.
  2. Un contrato activo por suministro: no puede haber dos contratos con
     estado='activo' para el mismo suministro (en la misma empresa).
  3. FKs válidas para la empresa: titular/pagador/suministro deben pertenecer
     a la empresa; tarifa/comercializadora deben existir (catálogo global).

El `Out` se construye con campos derivados de display (titular_nombre, cups,
tarifa_codigo, comercializadora_nombre) vía join.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.permissions import assert_empresa_access
from app.erp.models import (
    ErpContrato, ErpContratoPotencia,
    ErpTitular, ErpSuministro, ErpTarifa, ErpTarifaPeriodo, ErpComercializadora,
)
from app.erp.schemas import (
    ErpContratoCreate, ErpContratoUpdate, ErpContratoOut, ErpContratoPotenciaOut,
)
from app.tenants.models import User


def _ahora_madrid_naive() -> datetime:
    return datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)


# --- Errores de validación específicos ---
class ContratoValidacionError(ValueError):
    """Datos del contrato inválidos (periodos, FKs)."""
    pass


class ContratoSuministroActivoError(ValueError):
    """Ya hay un contrato activo para ese suministro."""
    pass


# ============================================================
# Helpers
# ============================================================
def _cargar_contrato_con_acceso(db: Session, user: User, contrato_id: int) -> ErpContrato:
    c = db.query(ErpContrato).filter(ErpContrato.id == contrato_id).first()
    if c is None:
        raise ValueError(f"Contrato {contrato_id} no encontrado")
    assert_empresa_access(db, user, c.empresa_id)
    return c


def _validar_fks(
    db: Session, empresa_id: int,
    titular_id: int, pagador_id: Optional[int], suministro_id: int,
    tarifa_id: int, comercializadora_id: Optional[int],
) -> None:
    t = db.query(ErpTitular).filter(ErpTitular.id == titular_id).first()
    if t is None or t.empresa_id != empresa_id:
        raise ContratoValidacionError(f"Titular {titular_id} no válido para esta empresa")
    if pagador_id is not None:
        p = db.query(ErpTitular).filter(ErpTitular.id == pagador_id).first()
        if p is None or p.empresa_id != empresa_id:
            raise ContratoValidacionError(f"Pagador {pagador_id} no válido para esta empresa")
    s = db.query(ErpSuministro).filter(ErpSuministro.id == suministro_id).first()
    if s is None or s.empresa_id != empresa_id:
        raise ContratoValidacionError(f"Suministro {suministro_id} no válido para esta empresa")
    if db.query(ErpTarifa).filter(ErpTarifa.id == tarifa_id).first() is None:
        raise ContratoValidacionError(f"Tarifa {tarifa_id} no existe")
    if comercializadora_id is not None:
        if db.query(ErpComercializadora).filter(ErpComercializadora.id == comercializadora_id).first() is None:
            raise ContratoValidacionError(f"Comercializadora {comercializadora_id} no existe")


def _validar_periodos_tarifa(db: Session, tarifa_id: int, potencias: list[dict]) -> None:
    if not potencias:
        return
    permitidos = {
        p.periodo
        for p in db.query(ErpTarifaPeriodo).filter(
            ErpTarifaPeriodo.tarifa_id == tarifa_id,
            ErpTarifaPeriodo.tipo == "potencia",
        ).all()
    }
    vistos: set[str] = set()
    for p in potencias:
        per = p["periodo"]
        if per in vistos:
            raise ContratoValidacionError(f"Periodo {per} duplicado")
        vistos.add(per)
        if per not in permitidos:
            permitidos_txt = ", ".join(sorted(permitidos)) or "ninguno"
            raise ContratoValidacionError(
                f"Periodo {per} no válido para la tarifa (permitidos: {permitidos_txt})"
            )


def _validar_potencias_crecientes(potencias: list[dict]) -> None:
    """Regla CNMC Circular 3/2020 (BOE-A-2020-1066): Pn+1 >= Pn.

    La potencia contratada en un periodo debe ser >= a la del periodo anterior
    (P1 <= P2 <= ... <= P6). Se ordena por el código de periodo (P1..P6).
    """
    if not potencias:
        return
    ordenadas = sorted(potencias, key=lambda p: p["periodo"])
    anterior_kw = None
    anterior_per = None
    for p in ordenadas:
        actual_kw = p["potencia_kw"]
        if anterior_kw is not None and actual_kw < anterior_kw:
            raise ContratoValidacionError(
                f"Potencias no crecientes: {p['periodo']} ({actual_kw} kW) es menor "
                f"que {anterior_per} ({anterior_kw} kW). Debe cumplirse Pn+1 >= Pn."
            )
        anterior_kw = actual_kw
        anterior_per = p["periodo"]


def _validar_potencias_completas(db: Session, tarifa_id: int, potencias: list[dict]) -> None:
    """Contrato activo: deben estar TODOS los periodos de potencia de la tarifa.

    La potencia contratada se define para cada periodo de la tarifa
    (CNMC Circular 3/2020); un contrato activo no puede dejar periodos sin potencia.
    """
    requeridos = {
        p.periodo
        for p in db.query(ErpTarifaPeriodo).filter(
            ErpTarifaPeriodo.tarifa_id == tarifa_id,
            ErpTarifaPeriodo.tipo == "potencia",
        ).all()
    }
    presentes = {p["periodo"] for p in potencias}
    faltan = requeridos - presentes
    if faltan:
        faltan_txt = ", ".join(sorted(faltan))
        raise ContratoValidacionError(
            f"Faltan potencias de los periodos: {faltan_txt}. "
            "Un contrato activo debe tener potencia en todos los periodos de la tarifa."
        )


def _validar_suministro_unico_activo(
    db: Session, empresa_id: int, suministro_id: int, exclude_id: Optional[int] = None
) -> None:
    q = db.query(ErpContrato).filter(
        ErpContrato.empresa_id == empresa_id,
        ErpContrato.suministro_id == suministro_id,
        ErpContrato.estado == "activo",
    )
    if exclude_id is not None:
        q = q.filter(ErpContrato.id != exclude_id)
    if q.first() is not None:
        raise ContratoSuministroActivoError(
            "Ya existe un contrato activo para ese suministro"
        )


def _contrato_out(db: Session, c: ErpContrato) -> ErpContratoOut:
    out = ErpContratoOut.model_validate(c)
    potencias = (
        db.query(ErpContratoPotencia)
        .filter(ErpContratoPotencia.contrato_id == c.id)
        .order_by(ErpContratoPotencia.periodo)
        .all()
    )
    out.potencias = [ErpContratoPotenciaOut.model_validate(p) for p in potencias]

    titular = db.query(ErpTitular).filter(ErpTitular.id == c.titular_id).first()
    out.titular_nombre = titular.nombre if titular else None
    suministro = db.query(ErpSuministro).filter(ErpSuministro.id == c.suministro_id).first()
    out.cups = suministro.cups if suministro else None
    tarifa = db.query(ErpTarifa).filter(ErpTarifa.id == c.tarifa_id).first()
    out.tarifa_codigo = tarifa.codigo if tarifa else None
    if c.comercializadora_id:
        com = db.query(ErpComercializadora).filter(ErpComercializadora.id == c.comercializadora_id).first()
        out.comercializadora_nombre = com.nombre if com else None
    return out


# ============================================================
# CRUD
# ============================================================
def listar_contratos(
    db: Session, user: User, empresa_id: int,
    search: Optional[str] = None, estado: Optional[str] = None,
    suministro_id: Optional[int] = None, solo_activos: bool = False,
) -> list[ErpContratoOut]:
    assert_empresa_access(db, user, empresa_id)
    q = db.query(ErpContrato).filter(ErpContrato.empresa_id == empresa_id)
    if solo_activos:
        q = q.filter(ErpContrato.activo.is_(True))
    if estado:
        q = q.filter(ErpContrato.estado == estado)
    if suministro_id:
        q = q.filter(ErpContrato.suministro_id == suministro_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpContrato.numero_contrato.ilike(like),
                ErpContrato.codigo_interno.ilike(like),
            )
        )
    contratos = q.order_by(ErpContrato.numero_contrato).all()
    return [_contrato_out(db, c) for c in contratos]


def obtener_contrato(db: Session, user: User, contrato_id: int) -> ErpContratoOut:
    c = _cargar_contrato_con_acceso(db, user, contrato_id)
    return _contrato_out(db, c)


def crear_contrato(
    db: Session, user: User, empresa_id: int, payload: ErpContratoCreate
) -> ErpContratoOut:
    assert_empresa_access(db, user, empresa_id)
    data = payload.model_dump()
    potencias = data.pop("potencias", []) or []

    _validar_fks(
        db, empresa_id,
        data["titular_id"], data.get("pagador_id"), data["suministro_id"],
        data["tarifa_id"], data.get("comercializadora_id"),
    )
    _validar_periodos_tarifa(db, data["tarifa_id"], potencias)
    _validar_potencias_crecientes(potencias)
    if data.get("estado", "activo") == "activo":
        _validar_potencias_completas(db, data["tarifa_id"], potencias)
        _validar_suministro_unico_activo(db, empresa_id, data["suministro_id"])

    ahora = _ahora_madrid_naive()
    c = ErpContrato(
        tenant_id=user.tenant_id, empresa_id=empresa_id,
        created_at=ahora, updated_at=ahora, **data,
    )
    db.add(c)
    db.flush()  # asigna c.id

    for p in potencias:
        db.add(ErpContratoPotencia(
            tenant_id=user.tenant_id, empresa_id=empresa_id, contrato_id=c.id,
            periodo=p["periodo"], potencia_kw=p["potencia_kw"],
            created_at=ahora, updated_at=ahora,
        ))

    db.commit()
    db.refresh(c)
    return _contrato_out(db, c)


def actualizar_contrato(
    db: Session, user: User, contrato_id: int, payload: ErpContratoUpdate
) -> ErpContratoOut:
    c = _cargar_contrato_con_acceso(db, user, contrato_id)
    data = payload.model_dump(exclude_unset=True)
    potencias = data.pop("potencias", None)  # None = no tocar; lista = reemplazar

    eff_titular = data.get("titular_id", c.titular_id)
    eff_pagador = data.get("pagador_id", c.pagador_id)
    eff_suministro = data.get("suministro_id", c.suministro_id)
    eff_tarifa = data.get("tarifa_id", c.tarifa_id)
    eff_com = data.get("comercializadora_id", c.comercializadora_id)
    eff_estado = data.get("estado", c.estado)

    _validar_fks(db, c.empresa_id, eff_titular, eff_pagador, eff_suministro, eff_tarifa, eff_com)
    if eff_estado == "activo":
        _validar_suministro_unico_activo(db, c.empresa_id, eff_suministro, exclude_id=c.id)
        pots_efectivas = potencias if potencias is not None else [
            {"periodo": p.periodo, "potencia_kw": p.potencia_kw}
            for p in db.query(ErpContratoPotencia).filter(ErpContratoPotencia.contrato_id == c.id).all()
        ]
        _validar_potencias_completas(db, eff_tarifa, pots_efectivas)
    if potencias is not None:
        _validar_periodos_tarifa(db, eff_tarifa, potencias)
        _validar_potencias_crecientes(potencias)

    for campo, valor in data.items():
        setattr(c, campo, valor)
    c.updated_at = _ahora_madrid_naive()

    if potencias is not None:
        db.query(ErpContratoPotencia).filter(ErpContratoPotencia.contrato_id == c.id).delete()
        ahora = _ahora_madrid_naive()
        for p in potencias:
            db.add(ErpContratoPotencia(
                tenant_id=c.tenant_id, empresa_id=c.empresa_id, contrato_id=c.id,
                periodo=p["periodo"], potencia_kw=p["potencia_kw"],
                created_at=ahora, updated_at=ahora,
            ))

    db.commit()
    db.refresh(c)
    return _contrato_out(db, c)


def desactivar_contrato(db: Session, user: User, contrato_id: int) -> ErpContratoOut:
    """Baja lógica: estado='baja' + activo=False (libera el suministro)."""
    c = _cargar_contrato_con_acceso(db, user, contrato_id)
    c.estado = "baja"
    c.activo = False
    c.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(c)
    return _contrato_out(db, c)
