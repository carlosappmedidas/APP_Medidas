# app/erp/migraciones/importer.py
"""
Importador de migración por entidad (E-12c).

Para cada fila del Excel: valida con el MISMO schema de pantalla y crea vía el
MISMO servicio (crear_titular, etc.), de modo que la migración y el alta manual
comparten exactamente las mismas reglas. Insert-only: si la clave natural ya
existe, la fila se cuenta como "omitida". Cada fila es independiente (los
servicios hacen commit por fila); un fallo nunca arrastra a las demás.

Corrección de migración (E-12 fase corrección): si la empresa tiene una
migración en estado 'en_curso', en vez de OMITIR un duplicado se ACTUALIZAN sus
campos no vacíos (sin versionar en contratos). Lo controla `correccion`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import assert_empresa_access
from app.erp import schemas, services, services_contrato
from app.erp.migraciones import estado as mig_estado
from app.erp.migraciones.lectura import leer_excel
from app.tenants.models import User


@dataclass
class ErrorFila:
    fila_excel: int
    columna: str | None
    valor: object
    motivo: str


@dataclass
class ResultadoImport:
    entidad: str
    hoja: str
    total: int = 0
    creadas: int = 0
    actualizadas: int = 0
    omitidas: int = 0
    errores: list[ErrorFila] = field(default_factory=list)
    errores_fichero: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "entidad": self.entidad,
            "hoja": self.hoja,
            "total": self.total,
            "creadas": self.creadas,
            "actualizadas": self.actualizadas,
            "omitidas": self.omitidas,
            "fallidas": len(self.errores),
            "errores_fichero": self.errores_fichero,
            "errores": [
                {"fila": e.fila_excel, "columna": e.columna, "valor": e.valor, "motivo": e.motivo}
                for e in self.errores
            ],
        }


def _col_de_error(err: Any) -> str | None:
    loc = err.get("loc") or ()
    return str(loc[0]) if loc else None


class _EnlaceNoResuelto(Exception):
    """Una clave natural de enlace no se pudo resolver (columna + motivo)."""
    def __init__(self, columna: str, valor, motivo: str):
        self.columna = columna
        self.valor = valor
        self.motivo = motivo


def _resolver_comercializadora_global(db: Session, codigo_ree):
    """codigo_ree (clave natural) → id de la comercializadora del catálogo global."""
    if not codigo_ree:
        raise _EnlaceNoResuelto("comercializadora_codigo_ree", codigo_ree,
                                "Falta el código REE de la comercializadora")
    com = (
        db.query(services.ErpComercializadora)
        .filter(services.ErpComercializadora.codigo_ree == str(codigo_ree).strip())
        .first()
    )
    if com is None:
        raise _EnlaceNoResuelto("comercializadora_codigo_ree", codigo_ree,
                                f"No existe comercializadora con código REE {codigo_ree} en el catálogo global")
    return com.id


def _resolver_titular(db: Session, empresa_id: int, identificador, columna: str):
    """identificador (NIF/CIF) → titular_id dentro de la empresa."""
    if not identificador:
        raise _EnlaceNoResuelto(columna, identificador, "Falta el identificador del titular")
    t = (db.query(services.ErpTitular)
         .filter(services.ErpTitular.empresa_id == empresa_id,
                 services.ErpTitular.identificador == str(identificador).strip())
         .first())
    if t is None:
        raise _EnlaceNoResuelto(columna, identificador,
                                f"No existe titular con documento {identificador} en esta empresa")
    return t.id


def _resolver_suministro(db: Session, empresa_id: int, cups):
    """cups → suministro_id dentro de la empresa."""
    if not cups:
        raise _EnlaceNoResuelto("suministro_cups", cups, "Falta el CUPS del suministro")
    s = (db.query(services.ErpSuministro)
         .filter(services.ErpSuministro.empresa_id == empresa_id,
                 services.ErpSuministro.cups == str(cups).strip().upper())
         .first())
    if s is None:
        raise _EnlaceNoResuelto("suministro_cups", cups,
                                f"No existe suministro con CUPS {cups} en esta empresa")
    return s.id


def _resolver_tarifa(db: Session, codigo):
    """codigo de tarifa (2.0TD, 3.0TD…) → tarifa_id (catálogo global)."""
    if not codigo:
        raise _EnlaceNoResuelto("tarifa_codigo", codigo, "Falta el código de tarifa")
    t = (db.query(services.ErpTarifa)
         .filter(services.ErpTarifa.codigo == str(codigo).strip())
         .first())
    if t is None:
        raise _EnlaceNoResuelto("tarifa_codigo", codigo, f"No existe tarifa con código {codigo}")
    return t.id


def _resolver_comercializadora_empresa(db: Session, empresa_id: int, codigo_ree):
    """REE → comercializadora global → relación de ESTA empresa (doble salto)."""
    com_id = _resolver_comercializadora_global(db, codigo_ree)
    rel = (db.query(services.ErpComercializadoraEmpresa)
           .filter(services.ErpComercializadoraEmpresa.empresa_id == empresa_id,
                   services.ErpComercializadoraEmpresa.comercializadora_id == com_id)
           .first())
    if rel is None:
        raise _EnlaceNoResuelto("comercializadora_codigo_ree", codigo_ree,
                                f"La comercializadora REE {codigo_ree} no está dada de alta en esta empresa")
    return rel.id


# ---------------------------------------------------------------------------
# Corrección de migración (estado='en_curso'): actualizar campos no vacíos
# ---------------------------------------------------------------------------
def _update_parcial(db, user, entidad: str, registro_id: int, datos: dict, *, versionar: bool = True):
    if entidad == "titulares":
        services.actualizar_titular(db, user, registro_id, schemas.ErpTitularUpdate(**datos))
    elif entidad == "comercializadoras_empresa":
        services.actualizar_comercializadora_empresa(db, user, registro_id, schemas.ErpComercializadoraEmpresaUpdate(**datos))
    elif entidad == "suministros":
        services.actualizar_suministro(db, user, registro_id, schemas.ErpSuministroUpdate(**datos))
    elif entidad == "contratos":
        services_contrato.actualizar_contrato(db, user, registro_id, schemas.ErpContratoUpdate(**datos), versionar=versionar)


def _existente_titular(db, empresa_id, identificador):
    return (db.query(services.ErpTitular)
            .filter(services.ErpTitular.empresa_id == empresa_id,
                    services.ErpTitular.identificador == str(identificador).strip())
            .first())


def _existente_suministro(db, empresa_id, cups):
    return (db.query(services.ErpSuministro)
            .filter(services.ErpSuministro.empresa_id == empresa_id,
                    services.ErpSuministro.cups == str(cups).strip().upper())
            .first())


def _existente_com_empresa(db, empresa_id, comercializadora_id):
    return (db.query(services.ErpComercializadoraEmpresa)
            .filter(services.ErpComercializadoraEmpresa.empresa_id == empresa_id,
                    services.ErpComercializadoraEmpresa.comercializadora_id == comercializadora_id)
            .first())


def _existente_contrato(db, empresa_id, numero_contrato):
    return (db.query(services_contrato.ErpContrato)
            .filter(services_contrato.ErpContrato.empresa_id == empresa_id,
                    services_contrato.ErpContrato.numero_contrato == str(numero_contrato).strip())
            .first())


# ---------------------------------------------------------------------------
# Handler: TITULARES (sin enlaces a otras entidades)
# ---------------------------------------------------------------------------
def _importar_titulares(db: Session, user: User, empresa_id: int, filas, res: ResultadoImport, correccion: bool = False) -> None:
    for fila in filas:
        res.total += 1
        datos = {k: v for k, v in fila.valores.items() if v is not None}

        try:
            payload = schemas.ErpTitularCreate(**datos)
        except ValidationError as e:
            err = e.errors()[0]
            col = _col_de_error(err)
            res.errores.append(ErrorFila(fila.fila_excel, col, datos.get(col) if col else None,
                                         err.get("msg", "valor inválido")))
            continue

        try:
            services.crear_titular(db, user, empresa_id, payload)
            res.creadas += 1
        except services.DuplicateIdentificadorError:
            if correccion:
                existente = _existente_titular(db, empresa_id, payload.identificador)
                if existente is not None:
                    try:
                        _update_parcial(db, user, "titulares", existente.id, datos)  # type: ignore[arg-type]
                        res.actualizadas += 1
                    except (services.ValidacionError, ValueError) as e:
                        res.errores.append(ErrorFila(fila.fila_excel, "identificador", payload.identificador, str(e)))
                else:
                    res.omitidas += 1
            else:
                res.omitidas += 1
        except ValueError as e:
            res.errores.append(ErrorFila(fila.fila_excel, "identificador", payload.identificador, str(e)))
        except IntegrityError as e:
            db.rollback()
            res.errores.append(ErrorFila(fila.fila_excel, None, payload.identificador,
                                         "Conflicto de integridad en BD: " + str(getattr(e, "orig", e))[:120]))


# ---------------------------------------------------------------------------
# Handler: COMERCIALIZADORAS DE EMPRESA (1 enlace: codigo_ree → comercializadora global)
# ---------------------------------------------------------------------------
def _importar_comercializadoras_empresa(db: Session, user: User, empresa_id: int, filas, res: ResultadoImport, correccion: bool = False) -> None:
    for fila in filas:
        res.total += 1
        datos = {k: v for k, v in fila.valores.items() if v is not None}

        try:
            com_id = _resolver_comercializadora_global(db, datos.pop("comercializadora_codigo_ree", None))
        except _EnlaceNoResuelto as e:
            res.errores.append(ErrorFila(fila.fila_excel, e.columna, e.valor, e.motivo))
            continue
        datos["comercializadora_id"] = com_id

        try:
            payload = schemas.ErpComercializadoraEmpresaCreate(**datos)
        except ValidationError as e:
            err = e.errors()[0]
            col = _col_de_error(err)
            res.errores.append(ErrorFila(fila.fila_excel, col, datos.get(col) if col else None,
                                         err.get("msg", "valor inválido")))
            continue

        try:
            services.crear_comercializadora_empresa(db, user, empresa_id, payload)
            res.creadas += 1
        except services.DuplicateComercializadoraEmpresaError:
            if correccion:
                existente = _existente_com_empresa(db, empresa_id, com_id)
                if existente is not None:
                    try:
                        _update_parcial(db, user, "comercializadoras_empresa", existente.id, datos)  # type: ignore[arg-type]
                        res.actualizadas += 1
                    except ValueError as e:
                        res.errores.append(ErrorFila(fila.fila_excel, "comercializadora_codigo_ree", com_id, str(e)))
                else:
                    res.omitidas += 1
            else:
                res.omitidas += 1
        except ValueError as e:
            res.errores.append(ErrorFila(fila.fila_excel, "comercializadora_codigo_ree", com_id, str(e)))
        except IntegrityError as e:
            db.rollback()
            res.errores.append(ErrorFila(fila.fila_excel, None, com_id,
                                         "Conflicto de integridad en BD: " + str(getattr(e, "orig", e))[:120]))


# ---------------------------------------------------------------------------
# Handler: SUMINISTROS (sin enlaces; titular_id vive en el contrato, no aquí)
# ---------------------------------------------------------------------------
def _importar_suministros(db: Session, user: User, empresa_id: int, filas, res: ResultadoImport, correccion: bool = False) -> None:
    for fila in filas:
        res.total += 1
        datos = {k: v for k, v in fila.valores.items() if v is not None}

        try:
            payload = schemas.ErpSuministroCreate(**datos)
        except ValidationError as e:
            err = e.errors()[0]
            col = _col_de_error(err)
            res.errores.append(ErrorFila(fila.fila_excel, col, datos.get(col) if col else None,
                                         err.get("msg", "valor inválido")))
            continue

        try:
            services.crear_suministro(db, user, empresa_id, payload)
            res.creadas += 1
        except services.DuplicateCupsError:
            if correccion:
                existente = _existente_suministro(db, empresa_id, payload.cups)
                if existente is not None:
                    try:
                        _update_parcial(db, user, "suministros", existente.id, datos)  # type: ignore[arg-type]
                        res.actualizadas += 1
                    except (services.ValidacionError, ValueError) as e:
                        res.errores.append(ErrorFila(fila.fila_excel, "cups", payload.cups, str(e)))
                else:
                    res.omitidas += 1
            else:
                res.omitidas += 1
        except ValueError as e:
            res.errores.append(ErrorFila(fila.fila_excel, "cups", payload.cups, str(e)))
        except IntegrityError as e:
            db.rollback()
            res.errores.append(ErrorFila(fila.fila_excel, None, payload.cups,
                                         "Conflicto de integridad en BD: " + str(getattr(e, "orig", e))[:120]))


# ---------------------------------------------------------------------------
# Handler: CONTRATOS (4 enlaces + potencias P1-P6)
# ---------------------------------------------------------------------------
def _importar_contratos(db: Session, user: User, empresa_id: int, filas, res: ResultadoImport, correccion: bool = False) -> None:
    for fila in filas:
        res.total += 1
        datos = {k: v for k, v in fila.valores.items() if v is not None}

        titular_ident = datos.pop("titular_identificador", None)
        pagador_ident = datos.pop("pagador_identificador", None)
        suministro_cups = datos.pop("suministro_cups", None)
        com_ree = datos.pop("comercializadora_codigo_ree", None)
        tarifa_cod = datos.pop("tarifa_codigo", None)
        datos.pop("tipo_punto_medida", None)
        pots = []
        for periodo in ("P1", "P2", "P3", "P4", "P5", "P6"):
            val = datos.pop(periodo, None)
            if val is not None:
                pots.append({"periodo": periodo, "potencia_kw": val})

        try:
            datos["titular_id"] = _resolver_titular(db, empresa_id, titular_ident, "titular_identificador")
            datos["suministro_id"] = _resolver_suministro(db, empresa_id, suministro_cups)
            datos["tarifa_id"] = _resolver_tarifa(db, tarifa_cod)
            if pagador_ident is not None:
                datos["pagador_id"] = _resolver_titular(db, empresa_id, pagador_ident, "pagador_identificador")
            if com_ree is not None:
                datos["comercializadora_empresa_id"] = _resolver_comercializadora_empresa(db, empresa_id, com_ree)
        except _EnlaceNoResuelto as e:
            res.errores.append(ErrorFila(fila.fila_excel, e.columna, e.valor, e.motivo))
            continue

        datos["potencias"] = pots

        try:
            payload = schemas.ErpContratoCreate(**datos)
        except ValidationError as e:
            err = e.errors()[0]
            col = _col_de_error(err)
            res.errores.append(ErrorFila(fila.fila_excel, col, datos.get(col) if col else None,
                                         err.get("msg", "valor inválido")))
            continue

        try:
            services_contrato.crear_contrato(db, user, empresa_id, payload)
            res.creadas += 1
        except services_contrato.ContratoNumeroDuplicadoError:
            if correccion:
                existente = _existente_contrato(db, empresa_id, payload.numero_contrato)
                if existente is not None:
                    upd = dict(datos)
                    upd["potencias"] = pots
                    try:
                        _update_parcial(db, user, "contratos", existente.id, upd, versionar=False)  # type: ignore[arg-type]
                        res.actualizadas += 1
                    except (services_contrato.ContratoValidacionError,
                            services_contrato.ContratoSuministroActivoError, ValueError) as e:
                        res.errores.append(ErrorFila(fila.fila_excel, "numero_contrato", payload.numero_contrato, str(e)))
                else:
                    res.omitidas += 1
            else:
                res.omitidas += 1
        except (services_contrato.ContratoValidacionError,
                services_contrato.ContratoSuministroActivoError, ValueError) as e:
            res.errores.append(ErrorFila(fila.fila_excel, "numero_contrato", payload.numero_contrato, str(e)))
        except IntegrityError as e:
            db.rollback()
            res.errores.append(ErrorFila(fila.fila_excel, None, payload.numero_contrato,
                                         "Conflicto de integridad en BD: " + str(getattr(e, "orig", e))[:120]))


_HANDLERS = {
    "titulares": _importar_titulares,
    "comercializadoras_empresa": _importar_comercializadoras_empresa,
    "suministros": _importar_suministros,
    "contratos": _importar_contratos,
}


def importar(db: Session, user: User, empresa_id: int, entidad: str, contenido: bytes) -> ResultadoImport:
    """Importa el .xlsx (bytes) de `entidad` a `empresa_id`. Valida acceso antes de nada."""
    assert_empresa_access(db, user, empresa_id)

    lect = leer_excel(contenido)
    res = ResultadoImport(entidad=entidad, hoja=lect.hoja)
    res.errores_fichero = list(lect.errores)
    if lect.errores:
        return res

    handler = _HANDLERS.get(entidad)
    if handler is None:
        res.errores_fichero.append(f"Entidad no soportada todavía en el importador: {entidad}")
        return res

    correccion = mig_estado.en_correccion(db, empresa_id)
    handler(db, user, empresa_id, lect.filas, res, correccion)
    return res
