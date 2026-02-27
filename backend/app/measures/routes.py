from __future__ import annotations

from decimal import Decimal
import math
import re
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth import get_current_user, get_current_active_superuser
from app.measures.models import MedidaGeneral, MedidaPS
from app.empresas.models import Empresa
from app.tenants.models import User

router = APIRouter(prefix="/medidas", tags=["medidas"])


def _sanitize_value(value: Any):
    """
    Convierte NaN / infinitos en 0.0 para que sean JSON-compatibles.
    Deja el resto tal cual.
    """
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return 0.0
        return value

    if isinstance(value, Decimal):
        if value.is_nan() or value in (Decimal("Infinity"), Decimal("-Infinity")):
            return Decimal("0")
        return value

    return value


def _sanitize_medida(medida_obj: Any) -> dict:
    """
    Convierte un objeto MedidaGeneral o MedidaPS a dict, eliminando el estado interno
    de SQLAlchemy y saneando NaN/inf en todos los campos numéricos.
    """
    data = {
        k: v
        for k, v in medida_obj.__dict__.items()
        if not k.startswith("_")
    }

    for k, v in list(data.items()):
        data[k] = _sanitize_value(v)

    return data


def _build_empresa_codigo(empresa: Empresa) -> str | None:
    """
    Construye el código corto tipo 0277 / 0336 a partir de
    codigo_cnmc / codigo_ree / id.
    """
    # ⚠️ SQLAlchemy clásico: Pylance ve atributos como Column[str].
    # Forzamos tipos runtime a Optional[str] para poder operar con str normal.
    codigo_cnmc = cast(Optional[str], getattr(empresa, "codigo_cnmc", None))
    codigo_ree = cast(Optional[str], getattr(empresa, "codigo_ree", None))

    raw: str = codigo_cnmc or codigo_ree or str(getattr(empresa, "id"))

    # buscamos un bloque de 3 o 4 dígitos dentro del string
    m = re.search(r"(\d{3,4})", raw)
    if m:
        codigo_corto = m.group(1)
        # si tiene 3 dígitos, lo rellenamos a 4 con un 0 delante
        if len(codigo_corto) == 3:
            codigo_corto = f"0{codigo_corto}"
        return codigo_corto

    # si no encontramos dígitos, usamos el valor tal cual
    return raw


# ---------- MEDIDAS GENERAL ----------


@router.get("/general/")
def listar_medidas_generales(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve las filas de medidas_general del tenant actual, ordenadas
    del mes más reciente al más antiguo.

    Además:
      - sanea cualquier NaN/Infinity para que el JSON sea válido.
      - añade empresa_codigo (ej. 0277, 0336...) a partir de Empresa.codigo_cnmc/codigo_ree.
    """
    query = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
        .filter(
            MedidaGeneral.tenant_id == current_user.tenant_id,
            Empresa.tenant_id == current_user.tenant_id,
        )
        .order_by(MedidaGeneral.anio.desc(), MedidaGeneral.mes.desc())
    )

    filas = query.all()

    resultado: list[dict] = []
    for mg, empresa in filas:
        item = _sanitize_medida(mg)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.get("/general/all")
def listar_medidas_generales_todos_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Devuelve TODAS las filas de medidas_general de TODOS los tenants.
    Solo puede llamarlo un superusuario de plataforma.

    Aplica el mismo saneado (NaN/Infinity) y el mismo cálculo de empresa_codigo.
    """
    query = (
        db.query(MedidaGeneral, Empresa)
        .join(Empresa, MedidaGeneral.empresa_id == Empresa.id)
        .order_by(
            MedidaGeneral.tenant_id.asc(),
            MedidaGeneral.anio.desc(),
            MedidaGeneral.mes.desc(),
        )
    )

    filas = query.all()

    resultado: list[dict] = []
    for mg, empresa in filas:
        item = _sanitize_medida(mg)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.delete("/general/all")
def borrar_medidas_generales_todos_tenants(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    anio: int | None = None,
    mes: int | None = None,
):
    """
    Borra medidas_general de TODOS los tenants o filtrando por:
      - tenant_id (opcional)
      - empresa_id (opcional)
      - anio (opcional)
      - mes (opcional)

    Si no se pasa ningún filtro, borra TODAS las medidas de la BBDD.
    Solo puede llamarlo un superusuario de plataforma.
    """
    query = db.query(MedidaGeneral)

    if tenant_id is not None:
        query = query.filter(MedidaGeneral.tenant_id == tenant_id)

    if empresa_id is not None:
        query = query.filter(MedidaGeneral.empresa_id == empresa_id)

    if anio is not None:
        query = query.filter(MedidaGeneral.anio == anio)

    if mes is not None:
        query = query.filter(MedidaGeneral.mes == mes)

    deleted_rows = query.delete(synchronize_session=False)
    db.commit()

    return {
        "deleted": deleted_rows,
        "filters": {
            "tenant_id": tenant_id,
            "empresa_id": empresa_id,
            "anio": anio,
            "mes": mes,
        },
    }


# ---------- MEDIDAS PS ----------


@router.get("/ps/")
def listar_medidas_ps(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve las filas de medidas_ps del tenant actual, ordenadas
    del mes más reciente al más antiguo.

    Añade empresa_codigo igual que en medidas_general.
    """
    query = (
        db.query(MedidaPS, Empresa)
        .join(Empresa, MedidaPS.empresa_id == Empresa.id)
        .filter(
            MedidaPS.tenant_id == current_user.tenant_id,
            Empresa.tenant_id == current_user.tenant_id,
        )
        .order_by(MedidaPS.anio.desc(), MedidaPS.mes.desc())
    )

    filas = query.all()

    resultado: list[dict] = []
    for mp, empresa in filas:
        item = _sanitize_medida(mp)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado


@router.get("/ps/all")
def listar_medidas_ps_todos_tenants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    """
    Devuelve TODAS las filas de medidas_ps de TODOS los tenants.
    Solo puede llamarlo un superusuario de plataforma.
    """
    query = (
        db.query(MedidaPS, Empresa)
        .join(Empresa, MedidaPS.empresa_id == Empresa.id)
        .order_by(
            MedidaPS.tenant_id.asc(),
            MedidaPS.anio.desc(),
            MedidaPS.mes.desc(),
        )
    )

    filas = query.all()

    resultado: list[dict] = []
    for mp, empresa in filas:
        item = _sanitize_medida(mp)
        item["empresa_codigo"] = _build_empresa_codigo(empresa)
        resultado.append(item)

    return resultado