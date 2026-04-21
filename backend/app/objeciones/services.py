# app/objeciones/services.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false

from __future__ import annotations

import bz2
import io
import csv
import zipfile
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.objeciones.models import ObjecionAGRECL, ObjecionCIL, ObjecionCUPS, ObjecionINCL, ReobGenerado


# ── Helpers generales ─────────────────────────────────────────────────────────

def _dec(value: str) -> Optional[Decimal]:
    v = (value or "").strip().replace(",", ".")
    if not v:
        return None
    try:
        return Decimal(v)
    except InvalidOperation:
        return None


def _num(value) -> str:
    """Convierte Decimal a entero si no tiene decimales, o string vacío si es None."""
    if value is None:
        return ""
    from decimal import Decimal
    d = Decimal(str(value))
    if d == d.to_integral_value():
        return str(int(d))
    return str(d)

def _str(value: str) -> Optional[str]:
    v = (value or "").strip()
    return v if v else None


def _parse_rows(content: bytes) -> List[List[str]]:
    """Parsea fichero .0 (CSV ';', sin cabeceras)."""
    text = content.decode("latin-1", errors="replace")
    reader = csv.reader(io.StringIO(text), delimiter=";")
    return [[c.strip() for c in row] for row in reader if any(c.strip() for c in row)]


def _col(row: List[str], idx: int) -> str:
    return row[idx] if idx < len(row) else ""


def _csv_to_bz2(rows_data: List[List]) -> bytes:
    """CSV ';' sin cabeceras, comprimido bz2, encoding latin-1."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    for row in rows_data:
        writer.writerow(row)
    return bz2.compress(output.getvalue().encode("latin-1", errors="replace"))


# ── Helpers de nombres de fichero ─────────────────────────────────────────────

def _parse_nombre_agrecl(nombre: str) -> Tuple[str, str, str]:
    """AOBAGRECL_DDDD_AAAAMM_FFFFFFFF.0 → (dddd, aaaamm, fecha)"""
    import re as _re
    base = _re.sub(r'\.\d+(\.bz2)?$', '', nombre).replace(".bz2", "")
    partes = base.split("_")
    dddd   = partes[1] if len(partes) > 1 else "0000"
    aaaamm = partes[2] if len(partes) > 2 else "000000"
    fecha  = partes[3] if len(partes) > 3 else "00000000"
    return dddd, aaaamm, fecha


def _parse_nombre_incl(nombre: str) -> Tuple[str, str, str, str]:
    """OBJEINCL_CCCC_DDDD_AAAAMM_FFFFFFFF.0 → (cccc, dddd, aaaamm, fecha)"""
    import re as _re
    base = _re.sub(r'\.\d+(\.bz2)?$', '', nombre).replace(".bz2", "")
    partes = base.split("_")
    cccc   = partes[1] if len(partes) > 1 else "0000"
    dddd   = partes[2] if len(partes) > 2 else "0000"
    aaaamm = partes[3] if len(partes) > 3 else "000000"
    fecha  = partes[4] if len(partes) > 4 else "00000000"
    return cccc, dddd, aaaamm, fecha


def _parse_nombre_cups(nombre: str) -> Tuple[str, str, str, str]:
    """AOBCUPS_DDDD_CCCC_AAAAMM_FFFFFFFF.0 → (dddd, cccc, aaaamm, fecha)"""
    import re as _re
    base = _re.sub(r'\.\d+(\.bz2)?$', '', nombre).replace(".bz2", "")
    partes = base.split("_")
    dddd   = partes[1] if len(partes) > 1 else "0000"
    cccc   = partes[2] if len(partes) > 2 else "0000"
    aaaamm = partes[3] if len(partes) > 3 else "000000"
    fecha  = partes[4] if len(partes) > 4 else "00000000"
    return dddd, cccc, aaaamm, fecha


def _parse_nombre_cil(nombre: str) -> Tuple[str, str, str, str]:
    """AOBCIL_DDDD_CCCC_AAAAMM_FFFFFFFF.0 → (dddd, cccc, aaaamm, fecha)"""
    import re as _re
    base = _re.sub(r'\.\d+(\.bz2)?$', '', nombre).replace(".bz2", "")
    partes = base.split("_")
    dddd   = partes[1] if len(partes) > 1 else "0000"
    cccc   = partes[2] if len(partes) > 2 else "0000"
    aaaamm = partes[3] if len(partes) > 3 else "000000"
    fecha  = partes[4] if len(partes) > 4 else "00000000"
    return dddd, cccc, aaaamm, fecha


def _cccc_from_id_objecion(id_objecion: Optional[str]) -> str:
    """AG_0921_0277_202506_C05E → 0921"""
    if not id_objecion:
        return "0000"
    partes = id_objecion.split("_")
    return partes[1] if len(partes) > 1 else "0000"


# ── Validación de nombre de fichero ───────────────────────────────────────────

PREFIJOS_VALIDOS: Dict[str, str] = {
    "agrecl": "AOBAGRECL",
    "incl":   "OBJEINCL",
    "cups":   "AOBCUPS",
    "cil":    "AOBCIL",
}

_DDDD_POSICION: Dict[str, int] = {
    "agrecl": 1,
    "incl":   2,
    "cups":   1,
    "cil":    1,
}


def validar_nombre_fichero(
    nombre: str,
    tipo_ruta: str,
    codigo_ree: Optional[str] = None,
) -> Optional[str]:
    """
    Valida que:
    1. El nombre del fichero empieza por el prefijo correcto del tipo.
    2. El código de distribuidor del nombre coincide con el codigo_ree de la empresa.
    Devuelve mensaje de error o None si todo es correcto.
    """
    prefijo = PREFIJOS_VALIDOS.get(tipo_ruta, "")
    nombre_base = nombre
    import re as _re
    nombre_base = _re.sub(r'\.\d+(\.bz2)?$', '', nombre_base)
    nombre_base = nombre_base.replace(".bz2", "")

    if not nombre_base.upper().startswith(prefijo):
        return (
            f"El fichero '{nombre}' no corresponde a este tipo. "
            f"Se esperaba un fichero que empiece por '{prefijo}_'."
        )

    if codigo_ree and codigo_ree.strip():
        partes = nombre_base.split("_")
        pos = _DDDD_POSICION.get(tipo_ruta, 1)
        dddd_fichero = partes[pos] if len(partes) > pos else ""
        if dddd_fichero and dddd_fichero != codigo_ree.strip():
            return (
                f"El fichero '{nombre}' pertenece al distribuidor '{dddd_fichero}', "
                f"pero la empresa seleccionada tiene código REE '{codigo_ree.strip()}'. "
                f"Selecciona la empresa correcta o sube el fichero que corresponde."
            )

    return None


# ── Stats de ficheros ─────────────────────────────────────────────────────────

def _stats_ficheros(db: Session, model, *, tenant_id: int, empresa_id: Optional[int]) -> List[dict]:
    q = db.query(model).filter(model.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(model.empresa_id == empresa_id)
    rows = q.order_by(model.created_at.desc()).all()

    ficheros: Dict[str, dict] = {}
    for r in rows:
        nombre = getattr(r, "nombre_fichero") or "desconocido"
        if nombre not in ficheros:
            ficheros[nombre] = {
                "nombre_fichero": nombre,
                "created_at": getattr(r, "created_at"),
                "total": 0,
                "pendientes": 0,
                "aceptadas": 0,
                "rechazadas": 0,
                "enviado_sftp_at": None,
            }
        f = ficheros[nombre]
        f["total"] += 1
        aceptacion = getattr(r, "aceptacion") or ""
        if aceptacion == "S":
            f["aceptadas"] += 1
        elif aceptacion == "N":
            f["rechazadas"] += 1
        else:
            f["pendientes"] += 1
        row_created = getattr(r, "created_at")
        if row_created and (f["created_at"] is None or row_created > f["created_at"]):
            f["created_at"] = row_created
        enviado = getattr(r, "enviado_sftp_at", None)
        if enviado and (f["enviado_sftp_at"] is None or enviado > f["enviado_sftp_at"]):
            f["enviado_sftp_at"] = enviado

    return list(ficheros.values())


# ── AOBAGRECL ─────────────────────────────────────────────────────────────────
# Posiciones: 0=ID 1=Distrib 2=Comer 3=NivTen 4=Tarifa 5=Disc 6=TipPunto
#             7=Prov 8=TipDem 9=Periodo 10=Motivo 11=Magnitud
#             12=E_pub 13=E_prop 14=Comentario 15=Autoobj
#             16=Aceptacion 17=MotivoNoAcept 18=ComentResp

def import_agrecl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionAGRECL(
            tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero,
            id_objecion=_str(_col(row, 0)),
            distribuidor=_str(_col(row, 1)),
            comercializador=_str(_col(row, 2)),
            nivel_tension=_str(_col(row, 3)),
            tarifa_acceso=_str(_col(row, 4)),
            disc_horaria=_str(_col(row, 5)),
            tipo_punto=_str(_col(row, 6)),
            provincia=_str(_col(row, 7)),
            tipo_demanda=_str(_col(row, 8)),
            periodo=_str(_col(row, 9)),
            motivo=_str(_col(row, 10)),
            magnitud=_str(_col(row, 11)),
            e_publicada=_dec(_col(row, 12)),
            e_propuesta=_dec(_col(row, 13)),
            comentario_emisor=_str(_col(row, 14)),
            autoobjecion=_str(_col(row, 15)),
            aceptacion=_str(_col(row, 16)),
            motivo_no_aceptacion=_str(_col(row, 17)),
            comentario_respuesta=_str(_col(row, 18)),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_agrecl(
    db: Session, *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
    nombre_fichero: Optional[str] = None,
    id_objecion: Optional[str] = None,
) -> List[ObjecionAGRECL]:
    q = db.query(ObjecionAGRECL).filter(ObjecionAGRECL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionAGRECL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionAGRECL.periodo == periodo)
    if nombre_fichero:
        q = q.filter(ObjecionAGRECL.nombre_fichero == nombre_fichero)
    if id_objecion:
        q = q.filter(ObjecionAGRECL.id_objecion == id_objecion)
    return q.order_by(ObjecionAGRECL.id.desc()).all()


def ficheros_agrecl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None) -> List[dict]:
    return _stats_ficheros(db, ObjecionAGRECL, tenant_id=tenant_id, empresa_id=empresa_id)


def update_agrecl_respuesta(
    db: Session, *, id: int, tenant_id: int, empresa_id: int,
    aceptacion: str, motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0,
) -> ObjecionAGRECL:
    obj = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.id == id,
        ObjecionAGRECL.tenant_id == tenant_id,
        ObjecionAGRECL.empresa_id == empresa_id,
    ).first()
    if obj is None:
        raise ValueError(f"ObjecionAGRECL id={id} no encontrada")
    obj.aceptacion = aceptacion  # type: ignore
    obj.motivo_no_aceptacion = motivo_no_aceptacion  # type: ignore
    obj.comentario_respuesta = comentario_respuesta  # type: ignore
    obj.respuesta_publicada = respuesta_publicada  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return obj


def delete_agrecl(db: Session, *, ids: List[int], tenant_id: int, empresa_id: int) -> int:
    """Borra objeciones por IDs — verifica tenant_id Y empresa_id."""
    deleted = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.id.in_(ids),
        ObjecionAGRECL.tenant_id == tenant_id,
        ObjecionAGRECL.empresa_id == empresa_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_agrecl_fichero(
    db: Session, *,
    nombre_fichero: str,
    tenant_id: int,
    empresa_id: int,
    delete_reob_asociado: bool = False,
) -> int:
    """Borra todas las objeciones de un fichero — verifica tenant_id Y empresa_id.

    Si delete_reob_asociado=True, también borra los REOB generados a partir
    de este AOB (filas en objeciones_reob_generados donde nombre_fichero_aob
    coincida + mismo tenant+empresa).
    Devuelve el total de filas borradas (objeciones + REOBs).
    """
    deleted = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.nombre_fichero == nombre_fichero,
        ObjecionAGRECL.tenant_id == tenant_id,
        ObjecionAGRECL.empresa_id == empresa_id,
    ).delete(synchronize_session=False)

    if delete_reob_asociado:
        deleted += db.query(ReobGenerado).filter(
            ReobGenerado.tenant_id == tenant_id,
            ReobGenerado.empresa_id == empresa_id,
            ReobGenerado.nombre_fichero_aob == nombre_fichero,
        ).delete(synchronize_session=False)

    db.commit()
    return deleted


def _agrecl_row_to_list(r: ObjecionAGRECL) -> List:
    return [
        r.distribuidor or "", r.comercializador or "", r.nivel_tension or "",
        r.tarifa_acceso or "", r.disc_horaria or "", r.tipo_punto or "",
        r.provincia or "", r.tipo_demanda or "", r.periodo or "",
        r.motivo or "", r.magnitud or "",
        _num(r.e_publicada),
        _num(r.e_propuesta),
        r.comentario_emisor or "", r.autoobjecion or "",
        r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
    ]


def generate_reobagrecl_zip(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """ZIP con un .bz2 por ID de objeción que tenga respuesta S o N."""
    dddd, aaaamm, fecha = _parse_nombre_agrecl(nombre_fichero)
    rows = list_agrecl(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    rows_con_respuesta = [r for r in rows if r.aceptacion in ("S", "N")]

    fecha_hoy = datetime.utcnow().strftime("%Y%m%d")
    por_cccc: Dict[str, List[ObjecionAGRECL]] = {}
    for r in rows_con_respuesta:
        cccc = _cccc_from_id_objecion(r.id_objecion)
        if cccc not in por_cccc:
            por_cccc[cccc] = []
        por_cccc[cccc].append(r)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for cccc, filas in por_cccc.items():
            nombre_bz2 = f"REOBAGRECL_{dddd}_{cccc}_9999_{aaaamm}_{fecha_hoy}.0.bz2"
            data = [_agrecl_row_to_list(r) for r in filas]
            zf.writestr(nombre_bz2, _csv_to_bz2(data))

    nombre_zip = f"REOBAGRECL_{dddd}_{aaaamm}_{fecha_hoy}.zip"
    return zip_buffer.getvalue(), nombre_zip


def generate_reobagrecl_one(db: Session, *, tenant_id: int, empresa_id: int, objecion_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """Un .bz2 para una sola objeción — verifica tenant_id Y empresa_id."""
    dddd, aaaamm, fecha = _parse_nombre_agrecl(nombre_fichero)
    obj = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.id == objecion_id,
        ObjecionAGRECL.tenant_id == tenant_id,
        ObjecionAGRECL.empresa_id == empresa_id,
    ).first()
    if obj is None:
        raise ValueError(f"ObjecionAGRECL id={objecion_id} no encontrada")
    cccc = _cccc_from_id_objecion(obj.id_objecion)
    nombre_bz2 = f"REOBAGRECL_{dddd}_{cccc}_9999_{aaaamm}_{fecha}.0.bz2"
    return _csv_to_bz2([_agrecl_row_to_list(obj)]), nombre_bz2


# ── OBJEINCL ──────────────────────────────────────────────────────────────────
# Posiciones reales (10 columnas):
# 0=CUPS 1=Periodo_inicio 2=Periodo_fin 3=Motivo
# 4=AE_pub 5=AE_prop 6=AS_pub 7=AS_prop 8=Comentario 9=Autoobj

def import_incl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        inicio = _col(row, 1)
        fin    = _col(row, 2)
        periodo = f"{inicio} - {fin}" if inicio else None
        obj = ObjecionINCL(
            tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero,
            cups=_str(_col(row, 0)),
            periodo=periodo,
            motivo=_str(_col(row, 3)),
            ae_publicada=_dec(_col(row, 4)),
            ae_propuesta=_dec(_col(row, 5)),
            as_publicada=_dec(_col(row, 6)),
            as_propuesta=_dec(_col(row, 7)),
            comentario_emisor=_str(_col(row, 8)),
            autoobjecion=_str(_col(row, 9)),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_incl(
    db: Session, *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
    nombre_fichero: Optional[str] = None,
) -> List[ObjecionINCL]:
    q = db.query(ObjecionINCL).filter(ObjecionINCL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionINCL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionINCL.periodo.ilike(f"%{periodo}%"))
    if nombre_fichero:
        q = q.filter(ObjecionINCL.nombre_fichero == nombre_fichero)
    return q.order_by(ObjecionINCL.cups.asc(), ObjecionINCL.id.asc()).all()

def ficheros_incl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None) -> List[dict]:
    return _stats_ficheros(db, ObjecionINCL, tenant_id=tenant_id, empresa_id=empresa_id)


def update_incl_respuesta(
    db: Session, *, id: int, tenant_id: int, empresa_id: int,
    aceptacion: str, motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0,
) -> ObjecionINCL:
    obj = db.query(ObjecionINCL).filter(
        ObjecionINCL.id == id,
        ObjecionINCL.tenant_id == tenant_id,
        ObjecionINCL.empresa_id == empresa_id,
    ).first()
    if obj is None:
        raise ValueError(f"ObjecionINCL id={id} no encontrada")
    obj.aceptacion = aceptacion  # type: ignore
    obj.motivo_no_aceptacion = motivo_no_aceptacion  # type: ignore
    obj.comentario_respuesta = comentario_respuesta  # type: ignore
    obj.respuesta_publicada = respuesta_publicada  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return obj


def delete_incl(db: Session, *, ids: List[int], tenant_id: int, empresa_id: int) -> int:
    """Borra objeciones por IDs — verifica tenant_id Y empresa_id."""
    deleted = db.query(ObjecionINCL).filter(
        ObjecionINCL.id.in_(ids),
        ObjecionINCL.tenant_id == tenant_id,
        ObjecionINCL.empresa_id == empresa_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_incl_fichero(
    db: Session, *,
    nombre_fichero: str,
    tenant_id: int,
    empresa_id: int,
    delete_reob_asociado: bool = False,
) -> int:
    """Borra todas las objeciones de un fichero — verifica tenant_id Y empresa_id.

    Si delete_reob_asociado=True, también borra los REOB generados del AOB.
    """
    deleted = db.query(ObjecionINCL).filter(
        ObjecionINCL.nombre_fichero == nombre_fichero,
        ObjecionINCL.tenant_id == tenant_id,
        ObjecionINCL.empresa_id == empresa_id,
    ).delete(synchronize_session=False)

    if delete_reob_asociado:
        deleted += db.query(ReobGenerado).filter(
            ReobGenerado.tenant_id == tenant_id,
            ReobGenerado.empresa_id == empresa_id,
            ReobGenerado.nombre_fichero_aob == nombre_fichero,
        ).delete(synchronize_session=False)

    db.commit()
    return deleted


def generate_reobjeincl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """REOBJEINCL — sin cabeceras, sin ID, bz2. Periodo se divide en inicio y fin."""
    cccc, dddd, aaaamm, fecha = _parse_nombre_incl(nombre_fichero)
    rows = list_incl(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    data = []
    for r in rows:
        periodo_str = r.periodo or ""
        if " - " in periodo_str:
            inicio, fin = periodo_str.split(" - ", 1)
        else:
            inicio, fin = periodo_str, ""
        data.append([
            r.cups or "", inicio, fin, r.motivo or "",
            _num(r.ae_publicada),
            _num(r.ae_propuesta),
            _num(r.as_publicada),
            _num(r.as_propuesta),
            r.comentario_emisor or "", r.autoobjecion or "",
            r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
        ])
    fecha_hoy = datetime.utcnow().strftime("%Y%m%d")
    nombre_bz2 = f"REOBJEINCL_{dddd}_{cccc}_9999_{aaaamm}_{fecha_hoy}.0.bz2"
    return _csv_to_bz2(data), nombre_bz2


# ── AOBCUPS ───────────────────────────────────────────────────────────────────
# Posiciones: 0=ID 1=CUPS 2=Periodo 3=Motivo 4=E_pub 5=E_prop
#             6=Comentario 7=Autoobj 8=Aceptacion 9=MotivoNoAcept
#             10=ComentResp 11=Magnitud

def import_cups(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionCUPS(
            tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero,
            id_objecion=_str(_col(row, 0)),
            cups=_str(_col(row, 1)),
            periodo=_str(_col(row, 2)),
            motivo=_str(_col(row, 3)),
            e_publicada=_dec(_col(row, 4)),
            e_propuesta=_dec(_col(row, 5)),
            comentario_emisor=_str(_col(row, 6)),
            autoobjecion=_str(_col(row, 7)),
            aceptacion=_str(_col(row, 8)),
            motivo_no_aceptacion=_str(_col(row, 9)),
            comentario_respuesta=_str(_col(row, 10)),
            magnitud=_str(_col(row, 11)),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_cups(
    db: Session, *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
    nombre_fichero: Optional[str] = None,
) -> List[ObjecionCUPS]:
    q = db.query(ObjecionCUPS).filter(ObjecionCUPS.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCUPS.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCUPS.periodo == periodo)
    if nombre_fichero:
        q = q.filter(ObjecionCUPS.nombre_fichero == nombre_fichero)
    return q.order_by(ObjecionCUPS.id_objecion.asc(), ObjecionCUPS.id.asc()).all()


def ficheros_cups(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None) -> List[dict]:
    return _stats_ficheros(db, ObjecionCUPS, tenant_id=tenant_id, empresa_id=empresa_id)


def update_cups_respuesta(
    db: Session, *, id: int, tenant_id: int, empresa_id: int,
    aceptacion: str, motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0,
) -> ObjecionCUPS:
    obj = db.query(ObjecionCUPS).filter(
        ObjecionCUPS.id == id,
        ObjecionCUPS.tenant_id == tenant_id,
        ObjecionCUPS.empresa_id == empresa_id,
    ).first()
    if obj is None:
        raise ValueError(f"ObjecionCUPS id={id} no encontrada")
    obj.aceptacion = aceptacion  # type: ignore
    obj.motivo_no_aceptacion = motivo_no_aceptacion  # type: ignore
    obj.comentario_respuesta = comentario_respuesta  # type: ignore
    obj.respuesta_publicada = respuesta_publicada  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return obj


def delete_cups(db: Session, *, ids: List[int], tenant_id: int, empresa_id: int) -> int:
    """Borra objeciones por IDs — verifica tenant_id Y empresa_id."""
    deleted = db.query(ObjecionCUPS).filter(
        ObjecionCUPS.id.in_(ids),
        ObjecionCUPS.tenant_id == tenant_id,
        ObjecionCUPS.empresa_id == empresa_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_cups_fichero(
    db: Session, *,
    nombre_fichero: str,
    tenant_id: int,
    empresa_id: int,
    delete_reob_asociado: bool = False,
) -> int:
    """Borra todas las objeciones de un fichero — verifica tenant_id Y empresa_id.

    Si delete_reob_asociado=True, también borra los REOB generados del AOB.
    """
    deleted = db.query(ObjecionCUPS).filter(
        ObjecionCUPS.nombre_fichero == nombre_fichero,
        ObjecionCUPS.tenant_id == tenant_id,
        ObjecionCUPS.empresa_id == empresa_id,
    ).delete(synchronize_session=False)

    if delete_reob_asociado:
        deleted += db.query(ReobGenerado).filter(
            ReobGenerado.tenant_id == tenant_id,
            ReobGenerado.empresa_id == empresa_id,
            ReobGenerado.nombre_fichero_aob == nombre_fichero,
        ).delete(synchronize_session=False)

    db.commit()
    return deleted


def _cccc_from_id_cups(id_objecion: Optional[str]) -> str:
    """CU_0750_0336_202507_1044 → 0750"""
    if not id_objecion:
        return "0000"
    partes = id_objecion.split("_")
    return partes[1] if len(partes) > 1 else "0000"


def generate_reobcups(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """ZIP con un .bz2 por comercializadora, con fecha de generación hoy."""
    dddd, cccc, aaaamm, _ = _parse_nombre_cups(nombre_fichero)
    fecha_hoy = datetime.utcnow().strftime("%Y%m%d")
    rows = list_cups(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    rows = [r for r in rows if r.aceptacion in ("S", "N")]

    por_cccc: Dict[str, list] = {}
    for r in rows:
        comercializadora = _cccc_from_id_cups(r.id_objecion)
        if comercializadora not in por_cccc:
            por_cccc[comercializadora] = []
        por_cccc[comercializadora].append([
            r.cups or "", r.periodo or "", r.motivo or "",
            _num(r.e_publicada),
            _num(r.e_propuesta),
            r.comentario_emisor or "", r.autoobjecion or "",
            r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
            r.magnitud or "",
        ])

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for comercializadora, data in por_cccc.items():
            nombre_bz2 = f"REOBCUPS_{dddd}_{comercializadora}_9999_{aaaamm}_{fecha_hoy}.0.bz2"
            zf.writestr(nombre_bz2, _csv_to_bz2(data))

    nombre_zip = f"REOBCUPS_{dddd}_{aaaamm}_{fecha_hoy}.zip"
    return zip_buffer.getvalue(), nombre_zip


# ── AOBCIL ────────────────────────────────────────────────────────────────────
# Posiciones: 0=ID 1=CIL 2=Periodo 3=Motivo 4=EAS_pub 5=EAS_prop
#             6=EQ2_pub 7=EQ2_prop 8=EQ3_pub 9=EQ3_prop
#             10=Comentario 11=Autoobj

def import_cil(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionCIL(
            tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero,
            id_objecion=_str(_col(row, 0)),
            cil=_str(_col(row, 1)),
            periodo=_str(_col(row, 2)),
            motivo=_str(_col(row, 3)),
            eas_publicada=_dec(_col(row, 4)),
            eas_propuesta=_dec(_col(row, 5)),
            eq2_publicada=_dec(_col(row, 6)),
            eq2_propuesta=_dec(_col(row, 7)),
            eq3_publicada=_dec(_col(row, 8)),
            eq3_propuesta=_dec(_col(row, 9)),
            comentario_emisor=_str(_col(row, 10)),
            autoobjecion=_str(_col(row, 11)),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_cil(
    db: Session, *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
    nombre_fichero: Optional[str] = None,
) -> List[ObjecionCIL]:
    q = db.query(ObjecionCIL).filter(ObjecionCIL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCIL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCIL.periodo == periodo)
    if nombre_fichero:
        q = q.filter(ObjecionCIL.nombre_fichero == nombre_fichero)
    return q.order_by(ObjecionCIL.id_objecion.asc(), ObjecionCIL.id.asc()).all()


def ficheros_cil(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None) -> List[dict]:
    return _stats_ficheros(db, ObjecionCIL, tenant_id=tenant_id, empresa_id=empresa_id)


def update_cil_respuesta(
    db: Session, *, id: int, tenant_id: int, empresa_id: int,
    aceptacion: str, motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0,
) -> ObjecionCIL:
    obj = db.query(ObjecionCIL).filter(
        ObjecionCIL.id == id,
        ObjecionCIL.tenant_id == tenant_id,
        ObjecionCIL.empresa_id == empresa_id,
    ).first()
    if obj is None:
        raise ValueError(f"ObjecionCIL id={id} no encontrada")
    obj.aceptacion = aceptacion  # type: ignore
    obj.motivo_no_aceptacion = motivo_no_aceptacion  # type: ignore
    obj.comentario_respuesta = comentario_respuesta  # type: ignore
    obj.respuesta_publicada = respuesta_publicada  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return obj


def delete_cil(db: Session, *, ids: List[int], tenant_id: int, empresa_id: int) -> int:
    """Borra objeciones por IDs — verifica tenant_id Y empresa_id."""
    deleted = db.query(ObjecionCIL).filter(
        ObjecionCIL.id.in_(ids),
        ObjecionCIL.tenant_id == tenant_id,
        ObjecionCIL.empresa_id == empresa_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_cil_fichero(
    db: Session, *,
    nombre_fichero: str,
    tenant_id: int,
    empresa_id: int,
    delete_reob_asociado: bool = False,
) -> int:
    """Borra todas las objeciones de un fichero — verifica tenant_id Y empresa_id.

    Si delete_reob_asociado=True, también borra los REOB generados del AOB.
    """
    deleted = db.query(ObjecionCIL).filter(
        ObjecionCIL.nombre_fichero == nombre_fichero,
        ObjecionCIL.tenant_id == tenant_id,
        ObjecionCIL.empresa_id == empresa_id,
    ).delete(synchronize_session=False)

    if delete_reob_asociado:
        deleted += db.query(ReobGenerado).filter(
            ReobGenerado.tenant_id == tenant_id,
            ReobGenerado.empresa_id == empresa_id,
            ReobGenerado.nombre_fichero_aob == nombre_fichero,
        ).delete(synchronize_session=False)

    db.commit()
    return deleted


def generate_reobcil(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """REOBCIL — sin cabeceras, sin ID, bz2."""
    dddd, cccc, aaaamm, fecha = _parse_nombre_cil(nombre_fichero)
    rows = list_cil(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    data = [[
        r.cil or "", r.periodo or "", r.motivo or "",
        _num(r.eas_publicada),
        _num(r.eas_propuesta),
        _num(r.eq2_publicada),
        _num(r.eq2_propuesta),
        _num(r.eq3_publicada),
        _num(r.eq3_propuesta),
        r.comentario_emisor or "", r.autoobjecion or "",
        r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
    ] for r in rows]
    fecha_hoy = datetime.utcnow().strftime("%Y%m%d")
    nombre_bz2 = f"REOBCIL_{dddd}_{cccc}_9999_{aaaamm}_{fecha_hoy}.0.bz2"
    return _csv_to_bz2(data), nombre_bz2

def _parse_nombre_reob(nombre_bz2: str) -> tuple:
    """REOBAGRECL_DDDD_CCCC_9999_AAAAMM_FECHA.0.bz2 → (cccc, aaaamm)"""
    import re as _re
    base = _re.sub(r'\.\d+(\.bz2)?$', '', nombre_bz2).replace(".bz2", "")
    partes = base.split("_")
    cccc   = partes[2] if len(partes) > 2 else None
    aaaamm = partes[4] if len(partes) > 4 else None
    return cccc, aaaamm


# ── Envío SFTP ─────────────────────────────────────────────────────────────────

def registrar_reob_enviado(
    db: Session, *,
    tenant_id: int,
    empresa_id: int,
    tipo: str,
    nombre_fichero_aob: str,
    nombre_fichero_reob: str,
    comercializadora: Optional[str],
    aaaamm: Optional[str],
    num_registros: int,
    config_id: int,
) -> None:
    """Registra un fichero REOB enviado por SFTP en la tabla objeciones_reob_generados."""
    ahora = datetime.utcnow()
    obj = ReobGenerado(
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        nombre_fichero_aob=nombre_fichero_aob,
        nombre_fichero_reob=nombre_fichero_reob,
        comercializadora=comercializadora,
        aaaamm=aaaamm,
        num_registros=num_registros,
        generado_at=ahora,
        enviado_sftp_at=ahora,
        config_sftp_id=config_id,
        created_at=ahora,
        updated_at=ahora,
    )
    db.add(obj)
    db.commit()


def toggle_enviado_sftp(

    db: Session, *,
    tipo: str,
    tenant_id: int,
    empresa_id: int,
    nombre_fichero: str,
) -> Optional[datetime]:
    """Alterna enviado_sftp_at: si tiene valor lo quita, si no tiene pone ahora."""
    MODELO_MAP = {
        "agrecl": ObjecionAGRECL,
        "incl":   ObjecionINCL,
        "cups":   ObjecionCUPS,
        "cil":    ObjecionCIL,
    }
    model = MODELO_MAP.get(tipo)
    if model is None:
        raise ValueError(f"Tipo desconocido: {tipo}")

    rows = db.query(model).filter(
        model.tenant_id == tenant_id,
        model.empresa_id == empresa_id,
        model.nombre_fichero == nombre_fichero,
    ).all()

    if not rows:
        raise ValueError(f"Fichero {nombre_fichero} no encontrado")

    # Si alguno tiene enviado_sftp_at, se considera enviado → limpiar
    ya_enviado = any(getattr(r, "enviado_sftp_at", None) for r in rows)
    nuevo_valor = None if ya_enviado else datetime.utcnow()

    db.query(model).filter(
        model.tenant_id == tenant_id,
        model.empresa_id == empresa_id,
        model.nombre_fichero == nombre_fichero,
    ).update({"enviado_sftp_at": nuevo_valor}, synchronize_session=False)
    db.commit()
    return nuevo_valor


def enviar_al_sftp(
    db: Session, *,
    tipo: str,
    tenant_id: int,
    empresa_id: int,
    nombre_fichero: str,
    config_id: int,
    directorio_destino: str,
) -> str:
    from app.comunicaciones.services import _get_config_by_id_activa, _conectar_en_path
    import io as _io
    import zipfile as _zipfile

    config = _get_config_by_id_activa(db, config_id=config_id, tenant_id=tenant_id)
    ahora = datetime.utcnow()

    if tipo == "agrecl":
        # agrecl genera un ZIP con un .bz2 por ID — subimos cada .bz2 por separado
        zip_content, _ = generate_reobagrecl_zip(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
        ftp = _conectar_en_path(config, directorio_destino)
        ficheros_subidos = []
        try:
            with _zipfile.ZipFile(_io.BytesIO(zip_content)) as zf:
                for nombre_bz2 in zf.namelist():
                    datos_bz2 = zf.read(nombre_bz2)
                    ftp.storbinary(f"STOR {nombre_bz2}", _io.BytesIO(datos_bz2))
                    ficheros_subidos.append(nombre_bz2)
        finally:
            try:
                ftp.quit()
            except Exception:
                pass
        db.query(ObjecionAGRECL).filter(
            ObjecionAGRECL.tenant_id == tenant_id,
            ObjecionAGRECL.empresa_id == empresa_id,
            ObjecionAGRECL.nombre_fichero == nombre_fichero,
        ).update({"enviado_sftp_at": ahora, "enviado_sftp_config_id": config_id}, synchronize_session=False)
        db.commit()
        # Registrar cada bz2 enviado
        for nombre_bz2 in ficheros_subidos:
            cccc, aaaamm = _parse_nombre_reob(nombre_bz2)
            num = sum(1 for r in list_agrecl(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
                      if r.aceptacion in ("S", "N") and _cccc_from_id_objecion(r.id_objecion) == cccc)
            registrar_reob_enviado(db, tenant_id=tenant_id, empresa_id=empresa_id, tipo="agrecl",
                nombre_fichero_aob=nombre_fichero, nombre_fichero_reob=nombre_bz2,
                comercializadora=cccc, aaaamm=aaaamm, num_registros=num, config_id=config_id)
        return ", ".join(ficheros_subidos) if ficheros_subidos else "sin ficheros"

    elif tipo == "cups":
        zip_content, _ = generate_reobcups(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
        ftp = _conectar_en_path(config, directorio_destino)
        ficheros_subidos = []
        try:
            with _zipfile.ZipFile(_io.BytesIO(zip_content)) as zf:
                for nombre_bz2 in zf.namelist():
                    datos_bz2 = zf.read(nombre_bz2)
                    ftp.storbinary(f"STOR {nombre_bz2}", _io.BytesIO(datos_bz2))
                    ficheros_subidos.append(nombre_bz2)
        finally:
            try:
                ftp.quit()
            except Exception:
                pass
        db.query(ObjecionCUPS).filter(
            ObjecionCUPS.tenant_id == tenant_id,
            ObjecionCUPS.empresa_id == empresa_id,
            ObjecionCUPS.nombre_fichero == nombre_fichero,
        ).update({"enviado_sftp_at": ahora, "enviado_sftp_config_id": config_id}, synchronize_session=False)
        db.commit()
        for nombre_bz2 in ficheros_subidos:
            cccc, aaaamm = _parse_nombre_reob(nombre_bz2)
            num = sum(1 for r in list_cups(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
                      if r.aceptacion in ("S", "N") and _cccc_from_id_cups(r.id_objecion) == cccc)
            registrar_reob_enviado(db, tenant_id=tenant_id, empresa_id=empresa_id, tipo="cups",
                nombre_fichero_aob=nombre_fichero, nombre_fichero_reob=nombre_bz2,
                comercializadora=cccc, aaaamm=aaaamm, num_registros=num, config_id=config_id)
        return ", ".join(ficheros_subidos) if ficheros_subidos else "sin ficheros"

    else:
        if tipo == "incl":
            content, filename = generate_reobjeincl(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
            model = ObjecionINCL
        elif tipo == "cil":
            content, filename = generate_reobcil(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
            model = ObjecionCIL
        else:
            raise ValueError(f"Tipo desconocido: {tipo}")

        ftp = _conectar_en_path(config, directorio_destino)
        try:
            ftp.storbinary(f"STOR {filename}", _io.BytesIO(content))
        finally:
            try:
                ftp.quit()
            except Exception:
                pass
        db.query(model).filter(
            model.tenant_id == tenant_id,
            model.empresa_id == empresa_id,
            model.nombre_fichero == nombre_fichero,
        ).update({"enviado_sftp_at": ahora, "enviado_sftp_config_id": config_id}, synchronize_session=False)
        db.commit()
        cccc, aaaamm = _parse_nombre_reob(filename)
        rows_tipo = (list_incl if tipo == "incl" else list_cil)(
            db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
        num = sum(1 for r in rows_tipo if r.aceptacion in ("S", "N"))
        registrar_reob_enviado(db, tenant_id=tenant_id, empresa_id=empresa_id, tipo=tipo,
            nombre_fichero_aob=nombre_fichero, nombre_fichero_reob=filename,
            comercializadora=cccc, aaaamm=aaaamm, num_registros=num, config_id=config_id)
        return filename


# ── Borrar sólo un REOB generado (deja AOB y objeciones intactas) ────────────

def delete_reob_solo(
    db: Session, *,
    reob_id: int,
    tenant_id: int,
) -> bool:
    """Borra una única fila de objeciones_reob_generados.

    Se valida por tenant_id; la verificación de empresa_id la hace el router
    antes de llamar aquí (usando _get_empresa_id_verificado con el empresa_id
    del propio REOB).

    Devuelve True si se borró, False si no se encontró.
    """
    reob = db.query(ReobGenerado).filter(
        ReobGenerado.id == reob_id,
        ReobGenerado.tenant_id == tenant_id,
    ).first()
    if reob is None:
        return False
    db.delete(reob)
    db.commit()
    return True