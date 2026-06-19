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
    ErpContrato, ErpContratoPotencia, ErpContratoVersion,
    ErpTitular, ErpSuministro, ErpTarifa, ErpTarifaPeriodo, ErpComercializadora,
    ErpComercializadoraEmpresa,
)
from app.erp.schemas import (
    ErpContratoCreate, ErpContratoUpdate, ErpContratoOut, ErpContratoPotenciaOut,
    ErpContratoVersionListItem, ErpContratoVersionOut,
)
from app.erp.normativa_atr import tipo_punto_medida_rpum
from app.tenants.models import User


def _ahora_madrid_naive() -> datetime:
    return datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)


# --- Errores de validación específicos ---
class ContratoValidacionError(ValueError):
    """Datos del contrato inválidos (periodos, FKs)."""
    pass


class ContratoNumeroDuplicadoError(ValueError):
    """Ya existe un contrato con ese numero en la empresa (unique)."""
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
    tarifa_id: int, comercializadora_empresa_id: Optional[int],
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
    if comercializadora_empresa_id is not None:
        rel = db.query(ErpComercializadoraEmpresa).filter(
            ErpComercializadoraEmpresa.id == comercializadora_empresa_id
        ).first()
        if rel is None or rel.empresa_id != empresa_id:
            raise ContratoValidacionError(
                f"Comercializadora (empresa) {comercializadora_empresa_id} no válida para esta empresa"
            )


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
    if c.comercializadora_empresa_id:
        rel = db.query(ErpComercializadoraEmpresa).filter(
            ErpComercializadoraEmpresa.id == c.comercializadora_empresa_id
        ).first()
        if rel is not None:
            com = db.query(ErpComercializadora).filter(
                ErpComercializadora.id == rel.comercializadora_id
            ).first()
            out.comercializadora_nombre = com.nombre if com else None
    return out


# ============================================================
# Histórico de versiones (erp_contrato_version)
# ============================================================
# Campos del contrato que se comparan en el diff "Cambios detectados".
# Para los FK se compara el valor de display (nombre/código), no el id.
_CAMPOS_DIFF: list[tuple[str, str]] = [
    ("numero_contrato", "Nº contrato"),
    ("tipo_contrato_atr", "Tipo ATR"),
    ("estado", "Estado"),
    ("titular_nombre", "Titular"),
    ("cups", "CUPS"),
    ("comercializadora_nombre", "Comercializadora"),
    ("cnae", "CNAE"),
    ("tarifa_codigo", "Tarifa"),
    ("modo_control_potencia", "Modo control potencia"),
    ("tension_v", "Tensión (V)"),
    ("tension_normalizada", "Tensión normalizada"),
    ("tipo_punto_medida", "Tipo punto de medida"),
    ("es_autoconsumo", "Autoconsumo"),
    ("telegestion", "Telegestión"),
    ("bono_social", "Bono social"),
    ("no_cortable", "Esencial (no cortable)"),
    ("electrointensivo", "Electrointensivo"),
    ("exencion_iese", "Exención IESE"),
    ("vivienda_habitual", "Vivienda habitual"),
    ("peaje_directo", "Peaje directo"),
]


def _componer_snapshot(db: Session, c: ErpContrato) -> dict:
    """Foto del contrato para guardar en erp_contrato_version.snapshot (JSON).

    Guarda id + nombre de display de los FK (para ser fiel aunque luego se
    renombre el catálogo) y las potencias por periodo.
    """
    titular = db.query(ErpTitular).filter(ErpTitular.id == c.titular_id).first()
    suministro = db.query(ErpSuministro).filter(ErpSuministro.id == c.suministro_id).first()
    tarifa = db.query(ErpTarifa).filter(ErpTarifa.id == c.tarifa_id).first()
    com = None
    if c.comercializadora_empresa_id:
        rel = db.query(ErpComercializadoraEmpresa).filter(
            ErpComercializadoraEmpresa.id == c.comercializadora_empresa_id
        ).first()
        if rel is not None:
            com = db.query(ErpComercializadora).filter(
                ErpComercializadora.id == rel.comercializadora_id
            ).first()
    potencias = {
        p.periodo: (float(p.potencia_kw) if p.potencia_kw is not None else None)
        for p in db.query(ErpContratoPotencia)
        .filter(ErpContratoPotencia.contrato_id == c.id)
        .order_by(ErpContratoPotencia.periodo)
        .all()
    }
    return {
        "numero_contrato": c.numero_contrato,
        "tipo_contrato_atr": c.tipo_contrato_atr,
        "estado": c.estado,
        "titular_id": c.titular_id,
        "titular_nombre": titular.nombre if titular else None,
        "suministro_id": c.suministro_id,
        "cups": suministro.cups if suministro else None,
        "comercializadora_empresa_id": c.comercializadora_empresa_id,
        "comercializadora_nombre": com.nombre if com else None,
        "cnae": c.cnae,
        "tarifa_id": c.tarifa_id,
        "tarifa_codigo": tarifa.codigo if tarifa else None,
        "modo_control_potencia": c.modo_control_potencia,
        "tension_v": c.tension_v,
        "tension_normalizada": c.tension_normalizada,
        "tipo_punto_medida": c.tipo_punto_medida,
        "es_autoconsumo": c.es_autoconsumo,
        "telegestion": c.telegestion,
        "bono_social": c.bono_social,
        "no_cortable": c.no_cortable,
        "electrointensivo": c.electrointensivo,
        "exencion_iese": c.exencion_iese,
        "vivienda_habitual": c.vivienda_habitual,
        "peaje_directo": c.peaje_directo,
        "potencias": potencias,
    }


def _calcular_diff(antes: Optional[dict], despues: dict) -> list[dict]:
    """Diff [{campo, etiqueta, antes, despues}] entre dos snapshots."""
    antes = antes or {}
    cambios: list[dict] = []
    for campo, etiqueta in _CAMPOS_DIFF:
        a = antes.get(campo)
        d = despues.get(campo)
        if a != d:
            cambios.append({"campo": campo, "etiqueta": etiqueta, "antes": a, "despues": d})
    pa = antes.get("potencias") or {}
    pd = despues.get("potencias") or {}
    for per in sorted(set(pa) | set(pd)):
        a = pa.get(per)
        d = pd.get(per)
        if a != d:
            cambios.append({
                "campo": f"potencia_{per.lower()}", "etiqueta": f"Potencia {per}",
                "antes": a, "despues": d,
            })
    return cambios


def _estado_version(v: ErpContratoVersion) -> str:
    return "Activa" if v.fecha_baja is None else "Histórica"


def _version_list_item(v: ErpContratoVersion) -> ErpContratoVersionListItem:
    snap = v.snapshot or {}
    pots = snap.get("potencias") or {}
    potencia_txt = " / ".join(
        (f"{pots[p]:g}" if isinstance(pots[p], (int, float)) else str(pots[p]))
        for p in sorted(pots)
    ) or None
    return ErpContratoVersionListItem(
        id=v.id, version=v.version, tipo_atr=v.tipo_atr,
        comercializadora=snap.get("comercializadora_nombre"),
        tarifa=snap.get("tarifa_codigo"),
        potencia=potencia_txt,
        fecha_alta=v.fecha_alta, fecha_baja=v.fecha_baja,
        fecha_modificacion=v.fecha_modificacion,
        estado=_estado_version(v),
    )


def _version_out(v: ErpContratoVersion) -> ErpContratoVersionOut:
    return ErpContratoVersionOut(
        id=v.id, contrato_id=v.contrato_id, suministro_id=v.suministro_id,
        version=v.version, tipo_atr=v.tipo_atr, motivo=v.motivo, referencia=v.referencia,
        fecha_alta=v.fecha_alta, fecha_baja=v.fecha_baja, fecha_modificacion=v.fecha_modificacion,
        estado=_estado_version(v),
        snapshot=v.snapshot or {}, cambios=v.cambios,
        created_at=v.created_at, updated_at=v.updated_at,
    )


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

    # numero_contrato único por empresa (pre-check + UQ como red de seguridad)
    existe = (
        db.query(ErpContrato)
        .filter(
            ErpContrato.empresa_id == empresa_id,
            ErpContrato.numero_contrato == data["numero_contrato"],
        )
        .first()
    )
    if existe is not None:
        raise ContratoNumeroDuplicadoError(
            f"Ya existe un contrato con número {data['numero_contrato']} en esta empresa"
        )

    _validar_fks(
        db, empresa_id,
        data["titular_id"], data.get("pagador_id"), data["suministro_id"],
        data["tarifa_id"], data.get("comercializadora_empresa_id"),
    )
    _validar_periodos_tarifa(db, data["tarifa_id"], potencias)
    _validar_potencias_crecientes(potencias)
    if data.get("estado", "activo") == "activo":
        _validar_potencias_completas(db, data["tarifa_id"], potencias)
        _validar_suministro_unico_activo(db, empresa_id, data["suministro_id"])

    # tipo_punto_medida se calcula automaticamente (RPUM) desde la potencia maxima contratada
    p_max = max((p["potencia_kw"] for p in potencias), default=None)
    data["tipo_punto_medida"] = tipo_punto_medida_rpum(p_max)

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

    # Histórico: v1 = alta (A3), foto del contrato recién creado, sin diff.
    db.flush()  # las potencias ya son consultables para la foto
    db.add(ErpContratoVersion(
        tenant_id=user.tenant_id, empresa_id=empresa_id,
        contrato_id=c.id, suministro_id=c.suministro_id,
        version=1, tipo_atr="A3", motivo=None, referencia=None,
        fecha_alta=ahora.date(), fecha_baja=None, fecha_modificacion=ahora.date(),
        snapshot=_componer_snapshot(db, c), cambios=None,
        created_at=ahora, updated_at=ahora,
    ))

    db.commit()
    db.refresh(c)
    return _contrato_out(db, c)


def actualizar_contrato(
    db: Session, user: User, contrato_id: int, payload: ErpContratoUpdate
) -> ErpContratoOut:
    c = _cargar_contrato_con_acceso(db, user, contrato_id)
    snap_antes = _componer_snapshot(db, c)   # foto ANTES de tocar nada (para el diff)
    data = payload.model_dump(exclude_unset=True)
    potencias = data.pop("potencias", None)  # None = no tocar; lista = reemplazar

    # numero_contrato único por empresa (solo si cambia)
    nuevo_numero = data.get("numero_contrato")
    if nuevo_numero is not None and nuevo_numero != c.numero_contrato:
        existe = (
            db.query(ErpContrato)
            .filter(
                ErpContrato.empresa_id == c.empresa_id,
                ErpContrato.numero_contrato == nuevo_numero,
                ErpContrato.id != c.id,
            )
            .first()
        )
        if existe is not None:
            raise ContratoNumeroDuplicadoError(
                f"Ya existe un contrato con número {nuevo_numero} en esta empresa"
            )

    eff_titular = data.get("titular_id", c.titular_id)
    eff_pagador = data.get("pagador_id", c.pagador_id)
    eff_suministro = data.get("suministro_id", c.suministro_id)
    eff_tarifa = data.get("tarifa_id", c.tarifa_id)
    eff_com = data.get("comercializadora_empresa_id", c.comercializadora_empresa_id)
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

    # tipo_punto_medida automatico (RPUM): recalcular desde la potencia maxima efectiva
    if potencias is not None:
        pots_para_tipo = potencias
    else:
        pots_para_tipo = [
            {"periodo": p.periodo, "potencia_kw": p.potencia_kw}
            for p in db.query(ErpContratoPotencia).filter(ErpContratoPotencia.contrato_id == c.id).all()
        ]
    p_max = max((p["potencia_kw"] for p in pots_para_tipo), default=None)
    data["tipo_punto_medida"] = tipo_punto_medida_rpum(p_max)

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

    # Histórico: si hubo cambios reales, se cierra la versión activa y se crea vN+1 (M1).
    db.flush()  # potencias nuevas consultables para la foto
    snap_despues = _componer_snapshot(db, c)
    diff = _calcular_diff(snap_antes, snap_despues)
    if diff:
        ahora_v = _ahora_madrid_naive()
        hoy = ahora_v.date()
        ultima_v = (
            db.query(ErpContratoVersion)
            .filter(ErpContratoVersion.contrato_id == c.id)
            .order_by(ErpContratoVersion.version.desc())
            .first()
        )
        if ultima_v is None:
            # Contrato sin histórico previo: sembramos la v1 (alta A3) con la foto ANTERIOR.
            db.add(ErpContratoVersion(
                tenant_id=c.tenant_id, empresa_id=c.empresa_id,
                contrato_id=c.id, suministro_id=c.suministro_id,
                version=1, tipo_atr="A3", motivo=None, referencia=None,
                fecha_alta=None, fecha_baja=hoy, fecha_modificacion=hoy,
                snapshot=snap_antes, cambios=None,
                created_at=ahora_v, updated_at=ahora_v,
            ))
            siguiente = 2
        else:
            ultima_v.fecha_baja = hoy
            ultima_v.updated_at = ahora_v
            siguiente = ultima_v.version + 1
        db.add(ErpContratoVersion(
            tenant_id=c.tenant_id, empresa_id=c.empresa_id,
            contrato_id=c.id, suministro_id=c.suministro_id,
            version=siguiente, tipo_atr="M1", motivo=None, referencia=None,
            fecha_alta=hoy, fecha_baja=None, fecha_modificacion=hoy,
            snapshot=snap_despues, cambios=diff,
            created_at=ahora_v, updated_at=ahora_v,
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


# ============================================================
# Histórico — lectura (pestaña "Histórico del contrato")
# ============================================================
def listar_versiones(
    db: Session, user: User, contrato_id: int
) -> list[ErpContratoVersionListItem]:
    c = _cargar_contrato_con_acceso(db, user, contrato_id)
    versiones = (
        db.query(ErpContratoVersion)
        .filter(ErpContratoVersion.contrato_id == c.id)
        .order_by(ErpContratoVersion.version.desc())
        .all()
    )
    return [_version_list_item(v) for v in versiones]


def obtener_version(
    db: Session, user: User, contrato_id: int, version_id: int
) -> ErpContratoVersionOut:
    c = _cargar_contrato_con_acceso(db, user, contrato_id)
    v = (
        db.query(ErpContratoVersion)
        .filter(
            ErpContratoVersion.id == version_id,
            ErpContratoVersion.contrato_id == c.id,
        )
        .first()
    )
    if v is None:
        raise ValueError(f"Versión {version_id} no encontrada para el contrato {contrato_id}")
    return _version_out(v)
