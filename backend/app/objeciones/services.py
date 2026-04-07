# app/objeciones/services.py
# pyright: reportMissingImports=false

from __future__ import annotations

import bz2
import io
import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from sqlalchemy.orm import Session

from app.objeciones.models import ObjecionAGRECL, ObjecionCIL, ObjecionCUPS, ObjecionINCL


# ── Helpers ───────────────────────────────────────────────────────────────────

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
    """Parsea fichero .0 (CSV ';', sin cabeceras). Devuelve lista de listas."""
    text = content.decode("latin-1", errors="replace")
    reader = csv.reader(io.StringIO(text), delimiter=";")
    result = []
    for row in reader:
        if not any(c.strip() for c in row):
            continue
        result.append([c.strip() for c in row])
    return result


def _csv_to_bz2(rows_data: List[List]) -> bytes:
    """CSV ';' sin cabeceras, comprimido bz2, encoding latin-1."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    for row in rows_data:
        writer.writerow(row)
    return bz2.compress(output.getvalue().encode("latin-1", errors="replace"))


def _col(row: List[str], idx: int) -> str:
    return row[idx] if idx < len(row) else ""


# ── Stats de ficheros ─────────────────────────────────────────────────────────

def _stats_ficheros(db: Session, model, *, tenant_id: int, empresa_id: Optional[int]) -> List[dict]:
    q = db.query(model).filter(model.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(model.empresa_id == empresa_id)
    rows = q.order_by(model.created_at.desc()).all()

    ficheros: dict = {}
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


def list_agrecl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None, nombre_fichero: Optional[str] = None) -> List[ObjecionAGRECL]:
    q = db.query(ObjecionAGRECL).filter(ObjecionAGRECL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionAGRECL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionAGRECL.periodo == periodo)
    if nombre_fichero:
        q = q.filter(ObjecionAGRECL.nombre_fichero == nombre_fichero)
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


def generate_reobagrecl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: Optional[str] = None) -> bytes:
    """REOBAGRECL — sin cabeceras, sin ID, bz2."""
    rows = list_agrecl(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    data = [[
        r.distribuidor or "", r.comercializador or "", r.nivel_tension or "",
        r.tarifa_acceso or "", r.disc_horaria or "", r.tipo_punto or "",
        r.provincia or "", r.tipo_demanda or "", r.periodo or "",
        r.motivo or "", r.magnitud or "",
        r.e_publicada if r.e_publicada is not None else "",
        r.e_propuesta if r.e_propuesta is not None else "",
        r.comentario_emisor or "", r.autoobjecion or "",
        r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
    ] for r in rows]
    return _csv_to_bz2(data)


# ── OBJEINCL ──────────────────────────────────────────────────────────────────
# Posiciones reales del fichero (10 columnas):
# 0  CUPS
# 1  Periodo_inicio    ← "20250601 01"
# 2  Periodo_fin       ← "20250701 00"
# 3  Motivo
# 4  AE_publicada
# 5  AE_propuesta
# 6  AS_publicada
# 7  AS_propuesta
# 8  Comentario
# 9  Autoobjecion
# Los campos de respuesta (aceptacion, motivo_no_acept, coment_resp)
# vienen vacíos en la entrada — se rellenan al gestionar.

def import_incl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        inicio = _col(row, 1)
        fin    = _col(row, 2)
        # Guardamos el intervalo completo como "INICIO - FIN"
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


def generate_reobjeincl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: Optional[str] = None) -> bytes:
    """
    REOBJEINCL — sin cabeceras, sin ID, bz2.
    El campo periodo se divide de nuevo en inicio y fin al generar.
    """
    rows = list_incl(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    data = []
    for r in rows:
        # Separar "INICIO - FIN" de vuelta en dos columnas
        periodo_str = r.periodo or ""
        if " - " in periodo_str:
            inicio, fin = periodo_str.split(" - ", 1)
        else:
            inicio, fin = periodo_str, ""
        data.append([
            r.cups or "",
            inicio,
            fin,
            r.motivo or "",
            r.ae_publicada if r.ae_publicada is not None else "",
            r.ae_propuesta if r.ae_propuesta is not None else "",
            r.as_publicada if r.as_publicada is not None else "",
            r.as_propuesta if r.as_propuesta is not None else "",
            r.comentario_emisor or "",
            r.autoobjecion or "",
            r.aceptacion or "",
            r.motivo_no_aceptacion or "",
            r.comentario_respuesta or "",
        ])
    return _csv_to_bz2(data)


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


def generate_reobcups(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: Optional[str] = None) -> bytes:
    """REOBCUPS — sin cabeceras, sin ID, bz2."""
    rows = list_cups(db, tenant_id=tenant_id, empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    data = [[
        r.cups or "", r.periodo or "", r.motivo or "",
        r.e_publicada if r.e_publicada is not None else "",
        r.e_propuesta if r.e_propuesta is not None else "",
        r.comentario_emisor or "", r.autoobjecion or "",
        r.aceptacion or "", r.motivo_no_aceptacion or "", r.comentario_respuesta or "",
        r.magnitud or "",
    ] for r in rows]
    return _csv_to_bz2(data)


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


def generate_reobcil(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: Optional[str] = None) -> bytes:
    """REOBCIL — sin cabeceras, sin ID, bz2."""
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
    return _csv_to_bz2(data)
