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
)
from app.erp.schemas import (
    ErpTitularCreate, ErpTitularUpdate,
    ErpSuministroCreate, ErpSuministroUpdate,
    ErpTarifaOut, ErpTarifaPeriodoOut,
    ErpComercializadoraCreate, ErpComercializadoraUpdate,
    ErpComercializadoraEmpresaCreate, ErpComercializadoraEmpresaUpdate, ErpComercializadoraEmpresaOut,
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
    )

    modelos_bd = {
        "ErpCnmcTipoVia": ErpCnmcTipoVia,
        "ErpCnmcPiso": ErpCnmcPiso,
        "ErpCnmcPuerta": ErpCnmcPuerta,
        "ErpCnmcAclaradorFinca": ErpCnmcAclaradorFinca,
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
