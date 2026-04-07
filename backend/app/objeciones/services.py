# app/objeciones/services.py
# pyright: reportMissingImports=false

from __future__ import annotations

import bz2
import io
import csv
import zipfile
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.objeciones.models import ObjecionAGRECL, ObjecionCIL, ObjecionCUPS, ObjecionINCL


# ── Helpers generales ─────────────────────────────────────────────────────────

def _dec(value: str) -> Optional[Decimal]:
    v = (value or "").strip().replace(",", ".")
    if not v:
        return None
    try:
        return Decimal(v)
    except InvalidOperation:
        return None


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
    base   = nombre.replace(".0", "").replace(".bz2", "")
    partes = base.split("_")
    dddd   = partes[1] if len(partes) > 1 else "0000"
    aaaamm = partes[2] if len(partes) > 2 else "000000"
    fecha  = partes[3] if len(partes) > 3 else "00000000"
    return dddd, aaaamm, fecha


def _parse_nombre_incl(nombre: str) -> Tuple[str, str, str, str]:
    """OBJEINCL_CCCC_DDDD_AAAAMM_FFFFFFFF.0 → (cccc, dddd, aaaamm, fecha)"""
    base   = nombre.replace(".0", "").replace(".bz2", "")
    partes = base.split("_")
    cccc   = partes[1] if len(partes) > 1 else "0000"
    dddd   = partes[2] if len(partes) > 2 else "0000"
    aaaamm = partes[3] if len(partes) > 3 else "000000"
    fecha  = partes[4] if len(partes) > 4 else "00000000"
    return cccc, dddd, aaaamm, fecha


def _parse_nombre_cups(nombre: str) -> Tuple[str, str, str, str]:
    """AOBCUPS_DDDD_CCCC_AAAAMM_FFFFFFFF.0 → (dddd, cccc, aaaamm, fecha)"""
    base   = nombre.replace(".0", "").replace(".bz2", "")
    partes = base.split("_")
    dddd   = partes[1] if len(partes) > 1 else "0000"
    cccc   = partes[2] if len(partes) > 2 else "0000"
    aaaamm = partes[3] if len(partes) > 3 else "000000"
    fecha  = partes[4] if len(partes) > 4 else "00000000"
    return dddd, cccc, aaaamm, fecha


def _parse_nombre_cil(nombre: str) -> Tuple[str, str, str, str]:
    """AOBCIL_DDDD_CCCC_AAAAMM_FFFFFFFF.0 → (dddd, cccc, aaaamm, fecha)"""
    base   = nombre.replace(".0", "").replace(".bz2", "")
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

# Posición del código de distribuidor (DDDD) en el nombre del fichero
# AOBAGRECL_DDDD_... → pos 1
# OBJEINCL_CCCC_DDDD_... → pos 2  (el distribuidor es el segundo código)
# AOBCUPS_DDDD_... → pos 1
# AOBCIL_DDDD_... → pos 1
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

    # Quitar extensión para trabajar con el nombre base
    nombre_base = nombre
    for ext in (".0.bz2", ".bz2", ".0"):
        if nombre_base.endswith(ext):
            nombre_base = nombre_base[: -len(ext)]
            break

    # 1. Validar prefijo
    if not nombre_base.upper().startswith(prefijo):
        return (
            f"El fichero '{nombre}' no corresponde a este tipo. "
            f"Se esperaba un fichero que empiece por '{prefijo}_'."
        )

    # 2. Validar código de distribuidor contra codigo_ree de la empresa
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


def list_agrecl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None, nombre_fichero: Optional[str] = None, id_objecion: Optional[str] = None) -> List[ObjecionAGRECL]:
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


def update_agrecl_respuesta(db: Session, *, id: int, tenant_id: int, aceptacion: str, motivo_no_aceptacion: Optional[str], comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0) -> ObjecionAGRECL:
    obj = db.query(ObjecionAGRECL).filter(ObjecionAGRECL.id == id, ObjecionAGRECL.tenant_id == tenant_id).first()
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


def delete_agrecl(db: Session, *, ids: List[int], tenant_id: int) -> int:
    deleted = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.id.in_(ids), ObjecionAGRECL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_agrecl_fichero(db: Session, *, nombre_fichero: str, tenant_id: int) -> int:
    deleted = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.nombre_fichero == nombre_fichero,
        ObjecionAGRECL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def _agrecl_row_to_list(r: ObjecionAGRECL) -> List:
    return [
        r.distribuidor or "", r.comercializador or "", r.nivel_tension or "",
        r.tarifa_acceso or "", r.disc_horaria or "", r.tipo_punto or "",
        r.provincia or "", r.tipo_demanda or "", r.periodo or "",
        r.motivo or "", r.magnitud or "",
        r.e_publicada if r.e_publicada is not None else "",
        r.e_propuesta if r.e_propuesta is not None else "",
        r.comentario_emisor or "", r.autoobjecion or "",
        r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
    ]


def generate_reobagrecl_zip(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """ZIP con un .bz2 por ID de objeción que tenga respuesta S o N."""
    dddd, aaaamm, fecha = _parse_nombre_agrecl(nombre_fichero)
    rows = list_agrecl(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    rows_con_respuesta = [r for r in rows if r.aceptacion in ("S", "N")]

    por_id: Dict[str, List[ObjecionAGRECL]] = {}
    for r in rows_con_respuesta:
        id_obj = r.id_objecion or "SIN_ID"
        if id_obj not in por_id:
            por_id[id_obj] = []
        por_id[id_obj].append(r)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for id_obj, filas in por_id.items():
            cccc = _cccc_from_id_objecion(id_obj)
            nombre_bz2 = f"REOBAGRECL_{dddd}_{cccc}_9999_{aaaamm}_{fecha}.0.bz2"
            data = [_agrecl_row_to_list(r) for r in filas]
            zf.writestr(nombre_bz2, _csv_to_bz2(data))

    nombre_zip = f"REOBAGRECL_{dddd}_{aaaamm}_{fecha}.zip"
    return zip_buffer.getvalue(), nombre_zip


def generate_reobagrecl_one(db: Session, *, tenant_id: int, objecion_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """Un .bz2 para una sola objeción."""
    dddd, aaaamm, fecha = _parse_nombre_agrecl(nombre_fichero)
    obj = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.id == objecion_id,
        ObjecionAGRECL.tenant_id == tenant_id,
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


def list_incl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None, nombre_fichero: Optional[str] = None) -> List[ObjecionINCL]:
    q = db.query(ObjecionINCL).filter(ObjecionINCL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionINCL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionINCL.periodo.ilike(f"%{periodo}%"))
    if nombre_fichero:
        q = q.filter(ObjecionINCL.nombre_fichero == nombre_fichero)
    return q.order_by(ObjecionINCL.id.desc()).all()


def ficheros_incl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None) -> List[dict]:
    return _stats_ficheros(db, ObjecionINCL, tenant_id=tenant_id, empresa_id=empresa_id)


def update_incl_respuesta(db: Session, *, id: int, tenant_id: int, aceptacion: str, motivo_no_aceptacion: Optional[str], comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0) -> ObjecionINCL:
    obj = db.query(ObjecionINCL).filter(ObjecionINCL.id == id, ObjecionINCL.tenant_id == tenant_id).first()
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


def delete_incl(db: Session, *, ids: List[int], tenant_id: int) -> int:
    deleted = db.query(ObjecionINCL).filter(
        ObjecionINCL.id.in_(ids), ObjecionINCL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_incl_fichero(db: Session, *, nombre_fichero: str, tenant_id: int) -> int:
    deleted = db.query(ObjecionINCL).filter(
        ObjecionINCL.nombre_fichero == nombre_fichero,
        ObjecionINCL.tenant_id == tenant_id,
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
            r.ae_publicada if r.ae_publicada is not None else "",
            r.ae_propuesta if r.ae_propuesta is not None else "",
            r.as_publicada if r.as_publicada is not None else "",
            r.as_propuesta if r.as_propuesta is not None else "",
            r.comentario_emisor or "", r.autoobjecion or "",
            r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
        ])
    nombre_bz2 = f"REOBJEINCL_{dddd}_{cccc}_9999_{aaaamm}_{fecha}.0.bz2"
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


def list_cups(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None, nombre_fichero: Optional[str] = None) -> List[ObjecionCUPS]:
    q = db.query(ObjecionCUPS).filter(ObjecionCUPS.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCUPS.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCUPS.periodo == periodo)
    if nombre_fichero:
        q = q.filter(ObjecionCUPS.nombre_fichero == nombre_fichero)
    return q.order_by(ObjecionCUPS.id.desc()).all()


def ficheros_cups(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None) -> List[dict]:
    return _stats_ficheros(db, ObjecionCUPS, tenant_id=tenant_id, empresa_id=empresa_id)


def update_cups_respuesta(db: Session, *, id: int, tenant_id: int, aceptacion: str, motivo_no_aceptacion: Optional[str], comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0) -> ObjecionCUPS:
    obj = db.query(ObjecionCUPS).filter(ObjecionCUPS.id == id, ObjecionCUPS.tenant_id == tenant_id).first()
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


def delete_cups(db: Session, *, ids: List[int], tenant_id: int) -> int:
    deleted = db.query(ObjecionCUPS).filter(
        ObjecionCUPS.id.in_(ids), ObjecionCUPS.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_cups_fichero(db: Session, *, nombre_fichero: str, tenant_id: int) -> int:
    deleted = db.query(ObjecionCUPS).filter(
        ObjecionCUPS.nombre_fichero == nombre_fichero,
        ObjecionCUPS.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def generate_reobcups(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """REOBCUPS — sin cabeceras, sin ID, bz2."""
    dddd, cccc, aaaamm, fecha = _parse_nombre_cups(nombre_fichero)
    rows = list_cups(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    data = [[
        r.cups or "", r.periodo or "", r.motivo or "",
        r.e_publicada if r.e_publicada is not None else "",
        r.e_propuesta if r.e_propuesta is not None else "",
        r.comentario_emisor or "", r.autoobjecion or "",
        r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
        r.magnitud or "",
    ] for r in rows]
    nombre_bz2 = f"REOBCUPS_{dddd}_{cccc}_9999_{aaaamm}_{fecha}.0.bz2"
    return _csv_to_bz2(data), nombre_bz2


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


def list_cil(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None, nombre_fichero: Optional[str] = None) -> List[ObjecionCIL]:
    q = db.query(ObjecionCIL).filter(ObjecionCIL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCIL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCIL.periodo == periodo)
    if nombre_fichero:
        q = q.filter(ObjecionCIL.nombre_fichero == nombre_fichero)
    return q.order_by(ObjecionCIL.id.desc()).all()


def ficheros_cil(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None) -> List[dict]:
    return _stats_ficheros(db, ObjecionCIL, tenant_id=tenant_id, empresa_id=empresa_id)


def update_cil_respuesta(db: Session, *, id: int, tenant_id: int, aceptacion: str, motivo_no_aceptacion: Optional[str], comentario_respuesta: Optional[str], respuesta_publicada: Optional[int] = 0) -> ObjecionCIL:
    obj = db.query(ObjecionCIL).filter(ObjecionCIL.id == id, ObjecionCIL.tenant_id == tenant_id).first()
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


def delete_cil(db: Session, *, ids: List[int], tenant_id: int) -> int:
    deleted = db.query(ObjecionCIL).filter(
        ObjecionCIL.id.in_(ids), ObjecionCIL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def delete_cil_fichero(db: Session, *, nombre_fichero: str, tenant_id: int) -> int:
    deleted = db.query(ObjecionCIL).filter(
        ObjecionCIL.nombre_fichero == nombre_fichero,
        ObjecionCIL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def generate_reobcil(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str) -> Tuple[bytes, str]:
    """REOBCIL — sin cabeceras, sin ID, bz2."""
    dddd, cccc, aaaamm, fecha = _parse_nombre_cil(nombre_fichero)
    rows = list_cil(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    data = [[
        r.cil or "", r.periodo or "", r.motivo or "",
        r.eas_publicada if r.eas_publicada is not None else "",
        r.eas_propuesta if r.eas_propuesta is not None else "",
        r.eq2_publicada if r.eq2_publicada is not None else "",
        r.eq2_propuesta if r.eq2_propuesta is not None else "",
        r.eq3_publicada if r.eq3_publicada is not None else "",
        r.eq3_propuesta if r.eq3_propuesta is not None else "",
        r.comentario_emisor or "", r.autoobjecion or "",
        r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
    ] for r in rows]
    nombre_bz2 = f"REOBCIL_{dddd}_{cccc}_9999_{aaaamm}_{fecha}.0.bz2"
    return _csv_to_bz2(data), nombre_bz2
