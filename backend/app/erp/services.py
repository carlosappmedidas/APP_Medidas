# app/erp/services.py
# pyright: reportArgumentType=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportCallIssue=false, reportAttributeAccessIssue=false, reportAssignmentType=false
"""
Servicios de negocio del módulo ERP.

Paq E-2: CRUD de titular (erp_titular) y suministro (erp_suministro).
Paq E-6a: catálogos compartidos (tarifa, comercializadora).

Patrón multi-tenant idéntico al resto de la app: cada operación de
titular/suministro valida el acceso con assert_empresa_access antes de tocar
datos. Los catálogos son globales (sin empresa).

El campo `nombre` del titular es display autocompuesto (normativa ATR):
  - jurídica -> razon_social
  - física   -> nombre_de_pila + primer_apellido + segundo_apellido
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import assert_empresa_access
from app.erp.models import (
    ErpTitular, ErpSuministro,
    ErpTarifa, ErpTarifaPeriodo, ErpComercializadora,
    ErpCnmcTipoVia, ErpCnmcPiso, ErpCnmcPuerta, ErpCnmcAclaradorFinca,
    ErpComercializadoraEmpresa,
    ErpEquipoMedida, ErpContrato,
    ErpCnmcPropiedadAparato, ErpCnmcTelegestion, ErpCnmcTipoPuntoMedida,
    ErpInstalacion,
    ErpAlmacen,
)
from app.erp.schemas import (
    ErpTitularCreate, ErpTitularUpdate,
    ErpSuministroCreate, ErpSuministroUpdate,
    ErpTarifaOut, ErpTarifaPeriodoOut,
    ErpComercializadoraCreate, ErpComercializadoraUpdate,
    ErpComercializadoraEmpresaCreate, ErpComercializadoraEmpresaUpdate, ErpComercializadoraEmpresaOut,
    ErpEquipoMedidaCreate, ErpEquipoMedidaUpdate, ErpEquipoMedidaOut,
    ErpInstalacionOut, InstalarEquipoPayload, RetirarEquipoPayload,
    ErpAlmacenOut, RecibirAlmacenPayload,
)
from app.tenants.models import User


# ============================================================
# Helpers
# ============================================================
def _ahora_madrid_naive() -> datetime:
    """datetime Madrid sin tzinfo (consistente con el resto del codebase)."""
    return datetime.now(ZoneInfo("Europe/Madrid")).replace(tzinfo=None)


def _componer_nombre(
    tipo_persona: Optional[str],
    razon_social: Optional[str],
    nombre_de_pila: Optional[str],
    primer_apellido: Optional[str],
    segundo_apellido: Optional[str],
) -> Optional[str]:
    """
    Compone el `nombre` de display según normativa ATR:
      - persona física  -> nombre_de_pila + primer_apellido + segundo_apellido
      - persona jurídica -> razon_social
    Devuelve None si no hay datos suficientes.
    """
    if (tipo_persona or "").strip().lower() == "fisica":
        partes = [
            p.strip()
            for p in (nombre_de_pila, primer_apellido, segundo_apellido)
            if p and str(p).strip()
        ]
        return " ".join(partes) or None
    return (razon_social or "").strip() or None


def _cargar_titular_con_acceso(
    db: Session, user: User, titular_id: int
) -> ErpTitular:
    """
    Carga un titular y valida el acceso multi-tenant por su empresa.

    Raises:
        ValueError: titular no encontrado.
        HTTPException 403: assert_empresa_access falla.
    """
    t = (
        db.query(ErpTitular)
        .filter(ErpTitular.id == titular_id)
        .first()
    )
    if t is None:
        raise ValueError(f"Titular {titular_id} no encontrado")
    assert_empresa_access(db, user, t.empresa_id)
    return t


# ============================================================
# Titular
# ============================================================
def listar_titulares(
    db: Session,
    user: User,
    empresa_id: int,
    search: Optional[str] = None,
    solo_activos: bool = False,
) -> list[ErpTitular]:
    """Lista titulares de una empresa. Filtro opcional por texto y por activos."""
    assert_empresa_access(db, user, empresa_id)

    q = db.query(ErpTitular).filter(ErpTitular.empresa_id == empresa_id)

    if solo_activos:
        q = q.filter(ErpTitular.activo.is_(True))

    if search:
        patron = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpTitular.nombre.ilike(patron),
                ErpTitular.identificador.ilike(patron),
                ErpTitular.codigo_interno.ilike(patron),
            )
        )

    return q.order_by(ErpTitular.nombre.asc()).all()


def obtener_titular(db: Session, user: User, titular_id: int) -> ErpTitular:
    """Devuelve un titular validando acceso. Lanza ValueError si no existe."""
    return _cargar_titular_con_acceso(db, user, titular_id)


class DuplicateIdentificadorError(ValueError):
    """Identificador ya existente para esa empresa (mismo NIF/CIF/NIE)."""


def crear_titular(
    db: Session, user: User, empresa_id: int, payload: ErpTitularCreate
) -> ErpTitular:
    """Crea un titular en la empresa indicada. Autocompone `nombre`."""
    assert_empresa_access(db, user, empresa_id)

    # Identificador único por empresa (el schema ya lo ha normalizado a forma canónica)
    if payload.identificador:
        existe = (
            db.query(ErpTitular)
            .filter(
                ErpTitular.empresa_id == empresa_id,
                ErpTitular.identificador == payload.identificador,
            )
            .first()
        )
        if existe is not None:
            raise DuplicateIdentificadorError(
                f"Ya existe un titular con el documento {payload.identificador} en esta empresa"
            )

    # Códigos de dirección contra catálogo CNMC (bloqueante, solo si traen valor).
    # dir_piso/dir_puerta NO se validan: sus catálogos no son exhaustivos (evita falsos rechazos).
    from app.erp.validators import validar_codigos_cnmc
    ok, msg = validar_codigos_cnmc(
        db,
        dir_tipo_via=payload.dir_tipo_via,
        dir_tipo_aclarador=payload.dir_tipo_aclarador,
    )
    if not ok:
        raise ValueError(msg)

    now = _ahora_madrid_naive()
    data = payload.model_dump()

    nombre_calc = _componer_nombre(
        data.get("tipo_persona"),
        data.get("razon_social"),
        data.get("nombre_de_pila"),
        data.get("primer_apellido"),
        data.get("segundo_apellido"),
    )
    data["nombre"] = nombre_calc or data.get("nombre") or data.get("razon_social") or ""

    titular = ErpTitular(
        tenant_id=user.tenant_id,
        empresa_id=empresa_id,
        created_at=now,
        updated_at=now,
        **data,
    )
    db.add(titular)
    db.commit()
    db.refresh(titular)
    return titular


class ValidacionError(ValueError):
    """Validación de identidad fallida en escritura (CUPS/documento) -> 400."""
    pass


def actualizar_titular(
    db: Session, user: User, titular_id: int, payload: ErpTitularUpdate
) -> ErpTitular:
    """Actualiza solo los campos enviados. Recompone `nombre` si no se envía explícito."""
    titular = _cargar_titular_con_acceso(db, user, titular_id)

    data = payload.model_dump(exclude_unset=True)

    # B1: validar el documento SOLO si cambia (no bloquear edición/reactivación de datos heredados)
    cambia_doc = (
        ("tipo_identificador" in data and data["tipo_identificador"] != titular.tipo_identificador)
        or ("identificador" in data and data["identificador"] != titular.identificador)
    )
    if cambia_doc:
        from app.erp.validators import validar_documento
        ok, msg = validar_documento(
            data.get("tipo_identificador", titular.tipo_identificador),
            data.get("identificador", titular.identificador),
        )
        if not ok:
            raise ValidacionError(msg)

    # Códigos de dirección contra catálogo CNMC (solo los que se envían en este update).
    # dir_piso/dir_puerta NO se validan: sus catálogos no son exhaustivos (evita falsos rechazos).
    if any(k in data for k in ("dir_tipo_via", "dir_tipo_aclarador")):
        from app.erp.validators import validar_codigos_cnmc
        ok, msg = validar_codigos_cnmc(
            db,
            dir_tipo_via=data.get("dir_tipo_via"),
            dir_tipo_aclarador=data.get("dir_tipo_aclarador"),
        )
        if not ok:
            raise ValidacionError(msg)

    for campo, valor in data.items():
        setattr(titular, campo, valor)

    # Recomponer el nombre de display salvo que lo hayan enviado explícitamente
    if "nombre" not in data:
        nombre_calc = _componer_nombre(
            titular.tipo_persona,
            titular.razon_social,
            titular.nombre_de_pila,
            titular.primer_apellido,
            titular.segundo_apellido,
        )
        if nombre_calc:
            titular.nombre = nombre_calc

    titular.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(titular)
    return titular


def desactivar_titular(db: Session, user: User, titular_id: int) -> ErpTitular:
    """Baja lógica: marca activo=False (no borra el registro)."""
    titular = _cargar_titular_con_acceso(db, user, titular_id)
    titular.activo = False
    titular.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(titular)
    return titular


# ===========================================================================
# Suministro (CUPS)
# ===========================================================================
class DuplicateCupsError(ValueError):
    """CUPS ya existente para esa empresa (UniqueConstraint empresa_id+cups)."""
    pass


def _cargar_suministro_con_acceso(
    db: Session, user: User, suministro_id: int
) -> ErpSuministro:
    """Carga suministro y valida acceso multi-tenant. ValueError si no existe."""
    s = (
        db.query(ErpSuministro)
        .filter(ErpSuministro.id == suministro_id)
        .first()
    )
    if s is None:
        raise ValueError(f"Suministro {suministro_id} no encontrado")
    assert_empresa_access(db, user, s.empresa_id)
    return s


def listar_suministros(
    db: Session,
    user: User,
    empresa_id: int,
    search: str | None = None,
    solo_activos: bool = False,
):
    assert_empresa_access(db, user, empresa_id)
    q = db.query(ErpSuministro).filter(ErpSuministro.empresa_id == empresa_id)
    if solo_activos:
        q = q.filter(ErpSuministro.activo.is_(True))
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpSuministro.cups.ilike(like),
                ErpSuministro.dir_municipio.ilike(like),
                ErpSuministro.distribuidora.ilike(like),
            )
        )
    return q.order_by(ErpSuministro.cups).all()


def obtener_suministro(db: Session, user: User, suministro_id: int) -> ErpSuministro:
    return _cargar_suministro_con_acceso(db, user, suministro_id)


def crear_suministro(
    db: Session, user: User, empresa_id: int, payload: ErpSuministroCreate
) -> ErpSuministro:
    assert_empresa_access(db, user, empresa_id)

    # CUPS único por empresa (pre-check + constraint como red de seguridad)
    existe = (
        db.query(ErpSuministro)
        .filter(
            ErpSuministro.empresa_id == empresa_id,
            ErpSuministro.cups == payload.cups,
        )
        .first()
    )
    if existe is not None:
        raise DuplicateCupsError(
            f"Ya existe un suministro con CUPS {payload.cups} en esta empresa"
        )

    # Códigos de dirección contra catálogo CNMC (bloqueante, solo si traen valor).
    # dir_piso/dir_puerta NO se validan: sus catálogos no son exhaustivos.
    from app.erp.validators import validar_codigos_cnmc
    ok, msg = validar_codigos_cnmc(
        db,
        dir_tipo_via=payload.dir_tipo_via,
        dir_tipo_aclarador=payload.dir_tipo_aclarador,
    )
    if not ok:
        raise ValueError(msg)

    ahora = _ahora_madrid_naive()
    s = ErpSuministro(
        tenant_id=user.tenant_id,
        empresa_id=empresa_id,
        created_at=ahora,
        updated_at=ahora,
        **payload.model_dump(),
    )
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateCupsError(
            f"Ya existe un suministro con CUPS {payload.cups} en esta empresa"
        )
    db.refresh(s)
    return s


def actualizar_suministro(
    db: Session, user: User, suministro_id: int, payload: ErpSuministroUpdate
) -> ErpSuministro:
    s = _cargar_suministro_con_acceso(db, user, suministro_id)
    datos = payload.model_dump(exclude_unset=True)

    nuevo_cups = datos.get("cups")
    if nuevo_cups is not None and nuevo_cups != s.cups:
        existe = (
            db.query(ErpSuministro)
            .filter(
                ErpSuministro.empresa_id == s.empresa_id,
                ErpSuministro.cups == nuevo_cups,
                ErpSuministro.id != s.id,
            )
            .first()
        )
        if existe is not None:
            raise DuplicateCupsError(
                f"Ya existe un suministro con CUPS {nuevo_cups} en esta empresa"
            )

    # B1: validar las 2 letras de control SOLO si el CUPS cambia (no bloquear reactivación de datos heredados)
    if nuevo_cups is not None and nuevo_cups != s.cups:
        from app.erp.validators import validar_cups_control
        if not validar_cups_control(nuevo_cups):
            raise ValidacionError(
                "CUPS inválido: las 2 letras de control no corresponden a los 16 dígitos."
            )

    # Códigos de dirección contra catálogo CNMC (solo los que se envían en este update)
    if any(k in datos for k in ("dir_tipo_via", "dir_tipo_aclarador")):
        from app.erp.validators import validar_codigos_cnmc
        ok, msg = validar_codigos_cnmc(
            db,
            dir_tipo_via=datos.get("dir_tipo_via"),
            dir_tipo_aclarador=datos.get("dir_tipo_aclarador"),
        )
        if not ok:
            raise ValidacionError(msg)

    for campo, valor in datos.items():
        setattr(s, campo, valor)
    s.updated_at = _ahora_madrid_naive()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateCupsError(
            f"Ya existe un suministro con CUPS {nuevo_cups} en esta empresa"
        )
    db.refresh(s)
    return s


def desactivar_suministro(
    db: Session, user: User, suministro_id: int
) -> ErpSuministro:
    """Baja lógica (activo=False)."""
    s = _cargar_suministro_con_acceso(db, user, suministro_id)
    s.activo = False
    s.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(s)
    return s


# ===========================================================================
# Catálogos compartidos (E-6a) — tarifa / comercializadora
# ===========================================================================
def listar_tarifas(db: Session, solo_activas: bool = False) -> list[ErpTarifaOut]:
    """Lista las tarifas de acceso con sus periodos. Catálogo global (sin empresa)."""
    q = db.query(ErpTarifa)
    if solo_activas:
        q = q.filter(ErpTarifa.activo.is_(True))
    tarifas = q.order_by(ErpTarifa.orden, ErpTarifa.codigo).all()

    out: list[ErpTarifaOut] = []
    for t in tarifas:
        periodos = (
            db.query(ErpTarifaPeriodo)
            .filter(ErpTarifaPeriodo.tarifa_id == t.id)
            .order_by(ErpTarifaPeriodo.tipo, ErpTarifaPeriodo.orden)
            .all()
        )
        out.append(ErpTarifaOut(
            id=t.id, codigo=t.codigo, descripcion=t.descripcion,
            codigo_ree=t.codigo_ree, nivel_tension=t.nivel_tension,
            num_periodos_energia=t.num_periodos_energia,
            num_periodos_potencia=t.num_periodos_potencia,
            referencia_normativa=t.referencia_normativa,
            vigencia_desde=t.vigencia_desde, vigencia_hasta=t.vigencia_hasta,
            orden=t.orden, activo=t.activo, notas=t.notas,
            periodos=[ErpTarifaPeriodoOut.model_validate(p) for p in periodos],
            created_at=t.created_at, updated_at=t.updated_at,
        ))
    return out


class DuplicateComercializadoraError(ValueError):
    """codigo_ree ya existe (UniqueConstraint uq_erp_comercializadora_codigo_ree)."""
    pass


def listar_comercializadoras(
    db: Session, search: str | None = None, solo_activas: bool = False
) -> list[ErpComercializadora]:
    q = db.query(ErpComercializadora)
    if solo_activas:
        q = q.filter(ErpComercializadora.activo.is_(True))
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpComercializadora.nombre.ilike(like),
                ErpComercializadora.cif.ilike(like),
                ErpComercializadora.codigo_ree.ilike(like),
            )
        )
    return q.order_by(ErpComercializadora.nombre).all()


def obtener_comercializadora(db: Session, com_id: int) -> ErpComercializadora:
    c = db.query(ErpComercializadora).filter(ErpComercializadora.id == com_id).first()
    if c is None:
        raise ValueError(f"Comercializadora {com_id} no encontrada")
    return c


def _validar_codigos_unicos_comercializadora(db: Session, codigo_cnmc, codigo_liq, exclude_id=None) -> None:
    """codigo_cnmc y codigo_liquidacion_cnmc únicos a nivel global (catálogo)."""
    for campo, valor, etiqueta in (
        (ErpComercializadora.codigo_cnmc, codigo_cnmc, "código CNMC"),
        (ErpComercializadora.codigo_liquidacion_cnmc, codigo_liq, "código de liquidación CNMC"),
    ):
        if valor is None:
            continue
        q = db.query(ErpComercializadora).filter(campo == valor)
        if exclude_id is not None:
            q = q.filter(ErpComercializadora.id != exclude_id)
        if q.first() is not None:
            raise DuplicateComercializadoraError(
                f"Ya existe una comercializadora con {etiqueta} {valor}"
            )


def crear_comercializadora(db: Session, payload: ErpComercializadoraCreate) -> ErpComercializadora:
    existe = (
        db.query(ErpComercializadora)
        .filter(ErpComercializadora.codigo_ree == payload.codigo_ree)
        .first()
    )
    if existe is not None:
        raise DuplicateComercializadoraError(
            f"Ya existe una comercializadora con código REE {payload.codigo_ree}"
        )
    _validar_codigos_unicos_comercializadora(db, payload.codigo_cnmc, payload.codigo_liquidacion_cnmc)
    ahora = _ahora_madrid_naive()
    c = ErpComercializadora(created_at=ahora, updated_at=ahora, **payload.model_dump())
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateComercializadoraError(
            f"Ya existe una comercializadora con código REE {payload.codigo_ree}"
        )
    db.refresh(c)
    return c


def actualizar_comercializadora(
    db: Session, com_id: int, payload: ErpComercializadoraUpdate
) -> ErpComercializadora:
    c = obtener_comercializadora(db, com_id)
    datos = payload.model_dump(exclude_unset=True)

    nuevo_ree = datos.get("codigo_ree")
    if nuevo_ree is not None and nuevo_ree != c.codigo_ree:
        existe = (
            db.query(ErpComercializadora)
            .filter(
                ErpComercializadora.codigo_ree == nuevo_ree,
                ErpComercializadora.id != c.id,
            )
            .first()
        )
        if existe is not None:
            raise DuplicateComercializadoraError(
                f"Ya existe una comercializadora con código REE {nuevo_ree}"
            )

    nuevo_cnmc = datos.get("codigo_cnmc")
    nuevo_liq = datos.get("codigo_liquidacion_cnmc")
    _validar_codigos_unicos_comercializadora(
        db,
        nuevo_cnmc if (nuevo_cnmc is not None and nuevo_cnmc != c.codigo_cnmc) else None,
        nuevo_liq if (nuevo_liq is not None and nuevo_liq != c.codigo_liquidacion_cnmc) else None,
        exclude_id=c.id,
    )

    for campo, valor in datos.items():
        setattr(c, campo, valor)
    c.updated_at = _ahora_madrid_naive()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateComercializadoraError(
            f"Ya existe una comercializadora con código REE {nuevo_ree}"
        )
    db.refresh(c)
    return c


def desactivar_comercializadora(db: Session, com_id: int) -> ErpComercializadora:
    """Baja lógica (activo=False)."""
    c = obtener_comercializadora(db, com_id)
    c.activo = False
    c.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(c)
    return c

# ---------------------------------------------------------------------------
# Catálogos de normativa CNMC (dirección) — globales, solo lectura
# ---------------------------------------------------------------------------
def listar_cnmc_catalogos(db: Session) -> dict:
    """Códigos activos de los catálogos CNMC de dirección, ordenados por `orden`."""
    def _vivos(Model):
        return (
            db.query(Model)
            .filter(Model.activo.is_(True))
            .order_by(Model.orden, Model.codigo)
            .all()
        )
    return {
        "tipo_via": _vivos(ErpCnmcTipoVia),
        "piso": _vivos(ErpCnmcPiso),
        "puerta": _vivos(ErpCnmcPuerta),
        "aclarador_finca": _vivos(ErpCnmcAclaradorFinca),
        "propiedad_aparato": _vivos(ErpCnmcPropiedadAparato),
        "telegestion": _vivos(ErpCnmcTelegestion),
        "tipo_punto_medida": _vivos(ErpCnmcTipoPuntoMedida),
    }

# ===========================================================================
# Comercializadora por empresa (relación distribuidora ↔ comercializadora)
# ===========================================================================
class DuplicateComercializadoraEmpresaError(ValueError):
    """La comercializadora ya está dada de alta en esa empresa (unique)."""
    pass


def _com_empresa_out(
    rel: ErpComercializadoraEmpresa, com: Optional[ErpComercializadora]
) -> ErpComercializadoraEmpresaOut:
    """Construye el Out con los datos propios + los derivados del catálogo."""
    out = ErpComercializadoraEmpresaOut.model_validate(rel)
    if com is not None:
        out.com_nombre = com.nombre
        out.com_cif = com.cif
        out.com_codigo_ree = com.codigo_ree
        out.com_codigo_cnmc = com.codigo_cnmc
        out.com_codigo_liquidacion_cnmc = com.codigo_liquidacion_cnmc
        out.com_es_cur = com.es_cur
    return out


def _cargar_com_empresa_con_acceso(
    db: Session, user: User, rel_id: int
) -> ErpComercializadoraEmpresa:
    rel = (
        db.query(ErpComercializadoraEmpresa)
        .filter(ErpComercializadoraEmpresa.id == rel_id)
        .first()
    )
    if rel is None:
        raise ValueError(f"Relación de comercializadora {rel_id} no encontrada")
    assert_empresa_access(db, user, rel.empresa_id)
    return rel


def listar_comercializadoras_empresa(
    db: Session, user: User, empresa_id: int,
    search: Optional[str] = None, solo_activas: bool = False,
) -> list[ErpComercializadoraEmpresaOut]:
    assert_empresa_access(db, user, empresa_id)
    q = (
        db.query(ErpComercializadoraEmpresa, ErpComercializadora)
        .join(ErpComercializadora, ErpComercializadora.id == ErpComercializadoraEmpresa.comercializadora_id)
        .filter(ErpComercializadoraEmpresa.empresa_id == empresa_id)
    )
    if solo_activas:
        q = q.filter(ErpComercializadoraEmpresa.activo.is_(True))
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpComercializadora.nombre.ilike(like),
                ErpComercializadora.cif.ilike(like),
                ErpComercializadora.codigo_ree.ilike(like),
            )
        )
    rows = q.order_by(ErpComercializadora.nombre.asc()).all()
    return [_com_empresa_out(rel, com) for rel, com in rows]


def crear_comercializadora_empresa(
    db: Session, user: User, empresa_id: int, payload: ErpComercializadoraEmpresaCreate
) -> ErpComercializadoraEmpresaOut:
    assert_empresa_access(db, user, empresa_id)
    com = (
        db.query(ErpComercializadora)
        .filter(ErpComercializadora.id == payload.comercializadora_id)
        .first()
    )
    if com is None:
        raise ValueError(f"Comercializadora {payload.comercializadora_id} no existe en el catálogo")
    now = _ahora_madrid_naive()
    rel = ErpComercializadoraEmpresa(
        tenant_id=user.tenant_id,
        empresa_id=empresa_id,
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    db.add(rel)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateComercializadoraEmpresaError(
            "Esa comercializadora ya está dada de alta en esta empresa."
        )
    db.refresh(rel)
    return _com_empresa_out(rel, com)


def obtener_comercializadora_empresa(
    db: Session, user: User, rel_id: int
) -> ErpComercializadoraEmpresaOut:
    rel = _cargar_com_empresa_con_acceso(db, user, rel_id)
    com = (
        db.query(ErpComercializadora)
        .filter(ErpComercializadora.id == rel.comercializadora_id)
        .first()
    )
    return _com_empresa_out(rel, com)


def actualizar_comercializadora_empresa(
    db: Session, user: User, rel_id: int, payload: ErpComercializadoraEmpresaUpdate
) -> ErpComercializadoraEmpresaOut:
    rel = _cargar_com_empresa_con_acceso(db, user, rel_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(rel, campo, valor)
    rel.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(rel)
    com = (
        db.query(ErpComercializadora)
        .filter(ErpComercializadora.id == rel.comercializadora_id)
        .first()
    )
    return _com_empresa_out(rel, com)


def desactivar_comercializadora_empresa(
    db: Session, user: User, rel_id: int
) -> ErpComercializadoraEmpresaOut:
    rel = _cargar_com_empresa_con_acceso(db, user, rel_id)
    rel.activo = False
    rel.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(rel)
    com = (
        db.query(ErpComercializadora)
        .filter(ErpComercializadora.id == rel.comercializadora_id)
        .first()
    )
    return _com_empresa_out(rel, com)

# ===========================================================================
# Catálogo de TABLAS auxiliares del ERP (pestaña "Tablas")
# ===========================================================================
def listar_tablas_catalogo(db: Session) -> list[dict]:
    """Resuelve el registro de tablas auxiliares a un árbol con sus valores.

    Lee REGISTRO_TABLAS y, por cada entrada, saca los valores de la fuente real:
      - ("enum", "<LABEL_DICT>")   -> dict de normativa_atr.py  -> filas codigo/descripcion
      - ("tabla", "<NombreModelo>") -> tabla BD (activos)        -> filas codigo/descripcion
    No duplica datos: tira de las fuentes ya existentes.
    """
    from app.erp import normativa_atr
    from app.erp.tablas_catalogo import REGISTRO_TABLAS
    from app.erp.models import (
        ErpCnmcTipoVia, ErpCnmcPiso, ErpCnmcPuerta, ErpCnmcAclaradorFinca,
        ErpCnmcTipoPuntoMedida, ErpCnmcPropiedadAparato, ErpCnmcTelegestion,
    )

    modelos_bd = {
        "ErpCnmcTipoVia": ErpCnmcTipoVia,
        "ErpCnmcPiso": ErpCnmcPiso,
        "ErpCnmcPuerta": ErpCnmcPuerta,
        "ErpCnmcAclaradorFinca": ErpCnmcAclaradorFinca,
        "ErpCnmcTipoPuntoMedida": ErpCnmcTipoPuntoMedida,
        "ErpCnmcPropiedadAparato": ErpCnmcPropiedadAparato,
        "ErpCnmcTelegestion": ErpCnmcTelegestion,
    }

    salida = []
    for entrada in REGISTRO_TABLAS:
        tipo_fuente, ref = entrada["fuente"]
        valores = []
        if tipo_fuente == "enum":
            label_dict = getattr(normativa_atr, ref, {})
            valores = [{"codigo": k, "descripcion": v} for k, v in label_dict.items()]
        elif tipo_fuente == "tabla":
            Model = modelos_bd.get(ref)
            if Model is not None:
                filas = (
                    db.query(Model)
                    .filter(Model.activo.is_(True))
                    .order_by(Model.orden, Model.codigo)
                    .all()
                )
                valores = [{"codigo": f.codigo, "descripcion": f.descripcion} for f in filas]
        salida.append({
            "clave": entrada["clave"],
            "nombre": entrada["nombre"],
            "modulo": entrada["modulo"],
            "seccion": entrada["seccion"],
            "usado_por": entrada.get("usado_por", []),
            "origen": entrada["origen"],
            "normativa": entrada["normativa"],
            "tipo_fuente": tipo_fuente,
            "num_valores": len(valores),
            "valores": valores,
        })
    return salida


# ===========================================================================
# Modulo 2 — Equipo de medida (E-7a): CRUD + derivados via CUPS
# ===========================================================================
class DuplicateNumeroSerieError(ValueError):
    """numero_serie ya existente para esa empresa (UQ empresa_id+numero_serie)."""
    pass


def _equipo_out(db: Session, eq) -> "ErpEquipoMedidaOut":
    """Construye el Out con los derivados via CUPS -> contrato activo.

    PROPIO: columnas del equipo. DERIVADO (no se guarda): cups (del suministro)
    y, del contrato ACTIVO de ese CUPS, numero/titular/tarifa/comercializadora y
    tipo_punto_medida. Si el equipo no esta instalado o el CUPS no tiene contrato
    activo, los derivados quedan a None.
    """
    out = ErpEquipoMedidaOut.model_validate(eq)
    if eq.suministro_id is None:
        return out

    sum_ = db.query(ErpSuministro).filter(ErpSuministro.id == eq.suministro_id).first()
    if sum_ is not None:
        out.cups = sum_.cups

    contrato = (
        db.query(ErpContrato)
        .filter(
            ErpContrato.suministro_id == eq.suministro_id,
            ErpContrato.estado == "activo",
        )
        .order_by(ErpContrato.id.desc())
        .first()
    )
    if contrato is not None:
        out.contrato_numero = contrato.numero_contrato
        out.tipo_punto_medida = (
            str(contrato.tipo_punto_medida) if contrato.tipo_punto_medida is not None else None
        )
        tit = db.query(ErpTitular).filter(ErpTitular.id == contrato.titular_id).first()
        if tit is not None:
            out.contrato_titular = tit.nombre
        tar = db.query(ErpTarifa).filter(ErpTarifa.id == contrato.tarifa_id).first()
        if tar is not None:
            out.contrato_tarifa = tar.codigo
        if contrato.comercializadora_empresa_id is not None:
            rel = (
                db.query(ErpComercializadoraEmpresa)
                .filter(ErpComercializadoraEmpresa.id == contrato.comercializadora_empresa_id)
                .first()
            )
            if rel is not None:
                com = (
                    db.query(ErpComercializadora)
                    .filter(ErpComercializadora.id == rel.comercializadora_id)
                    .first()
                )
                if com is not None:
                    out.contrato_comercializadora = com.nombre
    return out


def _cargar_equipo_con_acceso(db: Session, user: User, equipo_id: int):
    eq = db.query(ErpEquipoMedida).filter(ErpEquipoMedida.id == equipo_id).first()
    if eq is None:
        raise ValueError(f"Equipo de medida {equipo_id} no encontrado")
    assert_empresa_access(db, user, eq.empresa_id)
    return eq


def listar_equipos(
    db: Session,
    user: User,
    empresa_id: int,
    search: str | None = None,
    estado: str | None = None,
    solo_activos: bool = False,
):
    assert_empresa_access(db, user, empresa_id)
    q = db.query(ErpEquipoMedida).filter(ErpEquipoMedida.empresa_id == empresa_id)
    if solo_activos:
        q = q.filter(ErpEquipoMedida.activo.is_(True))
    if estado and estado.strip():
        q = q.filter(ErpEquipoMedida.estado == estado.strip())
    if search and search.strip():
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ErpEquipoMedida.numero_serie.ilike(like),
                ErpEquipoMedida.fabricante.ilike(like),
                ErpEquipoMedida.modelo.ilike(like),
            )
        )
    equipos = q.order_by(ErpEquipoMedida.numero_serie).all()
    return [_equipo_out(db, eq) for eq in equipos]


def obtener_equipo(db: Session, user: User, equipo_id: int) -> "ErpEquipoMedidaOut":
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)
    return _equipo_out(db, eq)


def crear_equipo(
    db: Session, user: User, empresa_id: int, payload: "ErpEquipoMedidaCreate"
) -> "ErpEquipoMedidaOut":
    assert_empresa_access(db, user, empresa_id)

    existe = (
        db.query(ErpEquipoMedida)
        .filter(
            ErpEquipoMedida.empresa_id == empresa_id,
            ErpEquipoMedida.numero_serie == payload.numero_serie,
        )
        .first()
    )
    if existe is not None:
        raise DuplicateNumeroSerieError(
            f"Ya existe un equipo con numero de serie {payload.numero_serie} en esta empresa"
        )

    ahora = _ahora_madrid_naive()

    # Separa los campos del equipo de los de almacen (alm_* + recibir_en_almacen)
    datos = payload.model_dump()
    recibir = datos.pop("recibir_en_almacen", False)
    alm = {
        "ubicacion": datos.pop("alm_ubicacion", None),
        "lote_compra": datos.pop("alm_lote_compra", None),
        "albaran_proveedor": datos.pop("alm_albaran_proveedor", None),
        "proveedor": datos.pop("alm_proveedor", None),
        "estado_equipo_en_almacen": datos.pop("alm_estado_equipo", None) or "nuevo",
        "fecha_garantia": datos.pop("alm_fecha_garantia", None),
        "fecha_entrada": datos.pop("alm_fecha_entrada", None),
        "notas": datos.pop("alm_notas", None),
    }

    # El equipo nace en almacen, sin CUPS: el vinculo se fija solo al Instalar
    eq = ErpEquipoMedida(
        tenant_id=user.tenant_id,
        empresa_id=empresa_id,
        estado="en_almacen",
        suministro_id=None,
        created_at=ahora,
        updated_at=ahora,
        **datos,
    )
    db.add(eq)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise DuplicateNumeroSerieError(
            f"Ya existe un equipo con numero de serie {payload.numero_serie} en esta empresa"
        )

    # Opcion A: si se recibe en almacen al crear, abre la fila erp_almacen
    if recibir:
        alm_row = ErpAlmacen(
            tenant_id=user.tenant_id,
            empresa_id=empresa_id,
            equipo_id=eq.id,
            fecha_salida=None,
            activo=True,
            created_at=ahora,
            updated_at=ahora,
            **alm,
        )
        db.add(alm_row)

    db.commit()
    db.refresh(eq)
    return _equipo_out(db, eq)


def actualizar_equipo(
    db: Session, user: User, equipo_id: int, payload: "ErpEquipoMedidaUpdate"
) -> "ErpEquipoMedidaOut":
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)
    datos = payload.model_dump(exclude_unset=True)

    nuevo_ns = datos.get("numero_serie")
    if nuevo_ns is not None and nuevo_ns != eq.numero_serie:
        existe = (
            db.query(ErpEquipoMedida)
            .filter(
                ErpEquipoMedida.empresa_id == eq.empresa_id,
                ErpEquipoMedida.numero_serie == nuevo_ns,
                ErpEquipoMedida.id != eq.id,
            )
            .first()
        )
        if existe is not None:
            raise DuplicateNumeroSerieError(
                f"Ya existe un equipo con numero de serie {nuevo_ns} en esta empresa"
            )

    for campo, valor in datos.items():
        setattr(eq, campo, valor)
    eq.updated_at = _ahora_madrid_naive()

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DuplicateNumeroSerieError(
            f"Ya existe un equipo con numero de serie {nuevo_ns} en esta empresa"
        )
    db.refresh(eq)
    return _equipo_out(db, eq)


def desactivar_equipo(db: Session, user: User, equipo_id: int) -> "ErpEquipoMedidaOut":
    """Baja logica (activo=False)."""
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)
    eq.activo = False
    eq.updated_at = _ahora_madrid_naive()
    db.commit()
    db.refresh(eq)
    return _equipo_out(db, eq)


# ===========================================================================
# Modulo 2 - Instalaciones (E-7b): acciones instalar / retirar + historico
# ===========================================================================
class InstalacionError(ValueError):
    """Error de negocio en una accion de instalacion/retirada."""
    pass


def _instalacion_out(db: Session, ins: "ErpInstalacion") -> "ErpInstalacionOut":
    """Construye el Out con los derivados (cups del suministro, nº serie del equipo)."""
    out = ErpInstalacionOut.model_validate(ins)
    sum_ = db.query(ErpSuministro).filter(ErpSuministro.id == ins.suministro_id).first()
    if sum_ is not None:
        out.cups = sum_.cups
    eq = db.query(ErpEquipoMedida).filter(ErpEquipoMedida.id == ins.equipo_id).first()
    if eq is not None:
        out.equipo_numero_serie = eq.numero_serie
    return out


def _instalacion_vigente(db: Session, equipo_id: int) -> "Optional[ErpInstalacion]":
    """La fila de instalacion sin cerrar (fecha_baja IS NULL) del equipo, si existe."""
    return (
        db.query(ErpInstalacion)
        .filter(ErpInstalacion.equipo_id == equipo_id, ErpInstalacion.fecha_baja.is_(None))
        .order_by(ErpInstalacion.id.desc())
        .first()
    )


def listar_instalaciones(db: Session, user: User, equipo_id: int) -> "list[ErpInstalacionOut]":
    """Historico de movimientos de un equipo (mas reciente primero)."""
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)
    filas = (
        db.query(ErpInstalacion)
        .filter(ErpInstalacion.equipo_id == eq.id)
        .order_by(ErpInstalacion.fecha_alta.desc().nullslast(), ErpInstalacion.id.desc())
        .all()
    )
    return [_instalacion_out(db, f) for f in filas]


def instalar_equipo(
    db: Session, user: User, equipo_id: int, payload: "InstalarEquipoPayload"
) -> "ErpInstalacionOut":
    """Instala un equipo en un CUPS: crea fila erp_instalacion + sincroniza foto del equipo.

    Transaccional: la tabla historica y la foto rapida del equipo se escriben juntas.
    """
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)

    # El suministro debe existir y ser de la misma empresa que el equipo
    sum_ = (
        db.query(ErpSuministro)
        .filter(ErpSuministro.id == payload.suministro_id)
        .first()
    )
    if sum_ is None:
        raise InstalacionError("El suministro indicado no existe")
    assert_empresa_access(db, user, sum_.empresa_id)
    if sum_.empresa_id != eq.empresa_id:
        raise InstalacionError("El suministro y el equipo son de empresas distintas")

    # No puede instalarse si ya tiene una instalacion vigente sin cerrar
    if _instalacion_vigente(db, eq.id) is not None:
        raise InstalacionError("El equipo ya tiene una instalacion vigente; retiralo antes de reinstalar")

    ahora = _ahora_madrid_naive()
    ins = ErpInstalacion(
        tenant_id=user.tenant_id,
        empresa_id=eq.empresa_id,
        equipo_id=eq.id,
        suministro_id=payload.suministro_id,
        tipo_movimiento=payload.tipo_movimiento or "instalacion",
        equipo_sustituido_id=payload.equipo_sustituido_id,
        fecha_alta=payload.fecha,
        fecha_baja=None,
        lectura_instalacion=payload.lectura,
        lectura_retirada=None,
        tecnico=payload.tecnico,
        precintos=payload.precintos,
        motivo=payload.motivo,
        motivo_baja=None,
        notas=payload.notas,
        activo=True,
        created_at=ahora,
        updated_at=ahora,
    )
    db.add(ins)
    db.flush()  # asegura el INSERT antes de sincronizar la foto del equipo

    # E-7c: al instalar, el equipo sale del almacen (cierra fila vigente si existe)
    _cerrar_almacen_vigente(db, eq.id, payload.fecha, ahora)

    # Sincroniza la foto rapida del equipo
    eq.estado = "instalado"
    eq.suministro_id = payload.suministro_id
    eq.updated_at = ahora

    db.commit()
    db.refresh(ins)
    return _instalacion_out(db, ins)


def retirar_equipo(
    db: Session, user: User, equipo_id: int, payload: "RetirarEquipoPayload"
) -> "ErpInstalacionOut":
    """Retira un equipo: cierra la instalacion vigente + pone el equipo al estado destino.

    estado_destino: en_almacen | averiado | retirado (flexible).
    """
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)

    ins = _instalacion_vigente(db, eq.id)
    if ins is None:
        raise InstalacionError("El equipo no tiene ninguna instalacion vigente que retirar")

    destino = payload.estado_destino or "en_almacen"
    if destino not in ("en_almacen", "averiado", "retirado"):
        raise InstalacionError("estado_destino invalido (en_almacen|averiado|retirado)")

    ahora = _ahora_madrid_naive()
    ins.fecha_baja = payload.fecha
    ins.lectura_retirada = payload.lectura
    ins.motivo_baja = payload.motivo
    ins.updated_at = ahora
    db.flush()

    # Sincroniza la foto rapida del equipo
    eq.estado = destino
    eq.suministro_id = None
    eq.updated_at = ahora

    # E-7c: si vuelve al stock util, abre una fila de almacen nueva
    if destino == "en_almacen":
        _abrir_almacen(db, eq, ahora, fecha=payload.fecha, estado_equipo="reacondicionado")

    db.commit()
    db.refresh(ins)
    return _instalacion_out(db, ins)


# ===========================================================================
# Modulo 2 - Almacen (E-7c): recibir / listar + helpers de sincronizacion
# ===========================================================================
def _almacen_out(db: Session, alm: "ErpAlmacen") -> "ErpAlmacenOut":
    """Out con el derivado equipo_numero_serie."""
    out = ErpAlmacenOut.model_validate(alm)
    eq = db.query(ErpEquipoMedida).filter(ErpEquipoMedida.id == alm.equipo_id).first()
    if eq is not None:
        out.equipo_numero_serie = eq.numero_serie
    return out


def _almacen_vigente(db: Session, equipo_id: int) -> "Optional[ErpAlmacen]":
    """Fila de almacen sin cerrar (fecha_salida IS NULL) del equipo, si existe."""
    return (
        db.query(ErpAlmacen)
        .filter(ErpAlmacen.equipo_id == equipo_id, ErpAlmacen.fecha_salida.is_(None))
        .order_by(ErpAlmacen.id.desc())
        .first()
    )


def _cerrar_almacen_vigente(db: Session, equipo_id: int, fecha, ahora) -> None:
    """Cierra la fila de almacen vigente (si la hay) poniendo fecha_salida.

    Defensivo: si el equipo no tenia fila de almacen, no hace nada.
    No hace commit; lo hace la accion que lo invoca.
    """
    alm = _almacen_vigente(db, equipo_id)
    if alm is not None:
        alm.fecha_salida = fecha
        alm.updated_at = ahora


def _abrir_almacen(db: Session, eq: "ErpEquipoMedida", ahora, fecha=None,
                   estado_equipo: str = "reacondicionado") -> None:
    """Abre una fila de almacen nueva para un equipo que vuelve al stock.

    No hace commit; lo hace la accion que lo invoca.
    """
    alm = ErpAlmacen(
        tenant_id=eq.tenant_id,
        empresa_id=eq.empresa_id,
        equipo_id=eq.id,
        estado_equipo_en_almacen=estado_equipo,
        fecha_entrada=fecha,
        fecha_salida=None,
        activo=True,
        created_at=ahora,
        updated_at=ahora,
    )
    db.add(alm)


def listar_almacen(db: Session, user: User, equipo_id: int) -> "list[ErpAlmacenOut]":
    """Historico de estancias en almacen de un equipo (mas reciente primero)."""
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)
    filas = (
        db.query(ErpAlmacen)
        .filter(ErpAlmacen.equipo_id == eq.id)
        .order_by(ErpAlmacen.fecha_entrada.desc().nullslast(), ErpAlmacen.id.desc())
        .all()
    )
    return [_almacen_out(db, f) for f in filas]


def recibir_en_almacen(
    db: Session, user: User, equipo_id: int, payload: "RecibirAlmacenPayload"
) -> "ErpAlmacenOut":
    """Recibe un equipo en almacen: crea fila erp_almacen + equipo estado=en_almacen.

    No permite recibir si el equipo esta instalado (tiene instalacion vigente).
    """
    eq = _cargar_equipo_con_acceso(db, user, equipo_id)

    if _instalacion_vigente(db, eq.id) is not None:
        raise InstalacionError("El equipo esta instalado; retiralo antes de recibirlo en almacen")
    if _almacen_vigente(db, eq.id) is not None:
        raise InstalacionError("El equipo ya tiene una estancia de almacen vigente")

    ahora = _ahora_madrid_naive()
    alm = ErpAlmacen(
        tenant_id=user.tenant_id,
        empresa_id=eq.empresa_id,
        equipo_id=eq.id,
        ubicacion=payload.ubicacion,
        lote_compra=payload.lote_compra,
        albaran_proveedor=payload.albaran_proveedor,
        proveedor=payload.proveedor,
        estado_equipo_en_almacen=payload.estado_equipo_en_almacen or "nuevo",
        fecha_garantia=payload.fecha_garantia,
        fecha_entrada=payload.fecha_entrada,
        fecha_salida=None,
        notas=payload.notas,
        activo=True,
        created_at=ahora,
        updated_at=ahora,
    )
    db.add(alm)
    db.flush()

    eq.estado = "en_almacen"
    eq.suministro_id = None
    eq.updated_at = ahora

    db.commit()
    db.refresh(alm)
    return _almacen_out(db, alm)
