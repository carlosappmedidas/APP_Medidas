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
    """
    Parsea el contenido de un fichero .0 (CSV con separador ';', sin cabeceras).
    Devuelve lista de listas de strings, saltando líneas vacías.
    """
    text = content.decode("latin-1", errors="replace")
    reader = csv.reader(io.StringIO(text), delimiter=";")
    result = []
    for row in reader:
        # Saltar líneas completamente vacías
        if not any(c.strip() for c in row):
            continue
        result.append([c.strip() for c in row])
    return result


def _csv_to_bz2(rows_data: List[List]) -> bytes:
    """CSV con separador ';', sin cabeceras, comprimido en bz2, encoding latin-1."""
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    for row in rows_data:
        writer.writerow(row)
    csv_bytes = output.getvalue().encode("latin-1", errors="replace")
    return bz2.compress(csv_bytes)


def _col(row: List[str], idx: int) -> str:
    """Devuelve la columna en la posición idx o '' si no existe."""
    return row[idx] if idx < len(row) else ""


# ── AOBAGRECL ─────────────────────────────────────────────────────────────────
# Columnas por posición (sin cabeceras):
# 0  ID_objecion
# 1  Distribuidor
# 2  Comercializador
# 3  Nivel_tension
# 4  Tarifa_acceso
# 5  Discriminacion_horaria
# 6  Tipo_punto_medida
# 7  Provincia
# 8  Tipo_demanda
# 9  Periodo_cierre_objetado
# 10 Motivo_objecion
# 11 Magnitud
# 12 Valor_energia_publicado_kWh
# 13 Valor_energia_propuesto_kWh
# 14 Comentario_emisor
# 15 Objecion_autoobjecion
# 16 Aceptacion          (vacío en la entrada)
# 17 Motivo_no_aceptacion (vacío en la entrada)
# 18 Comentario_respuesta (vacío en la entrada)

def import_agrecl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionAGRECL(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
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
            # campos de respuesta — pueden venir vacíos en la entrada
            aceptacion=_str(_col(row, 16)),
            motivo_no_aceptacion=_str(_col(row, 17)),
            comentario_respuesta=_str(_col(row, 18)),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_agrecl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None) -> List[ObjecionAGRECL]:
    q = db.query(ObjecionAGRECL).filter(ObjecionAGRECL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionAGRECL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionAGRECL.periodo == periodo)
    return q.order_by(ObjecionAGRECL.id.desc()).all()


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
        ObjecionAGRECL.id.in_(ids),
        ObjecionAGRECL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def generate_reobagrecl(db: Session, *, tenant_id: int, empresa_id: int, periodo: Optional[str] = None) -> bytes:
    """REOBAGRECL — sin cabeceras, sin ID de objeción, bz2."""
    rows = list_agrecl(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)
    data = [[
        r.distribuidor or "",
        r.comercializador or "",
        r.nivel_tension or "",
        r.tarifa_acceso or "",
        r.disc_horaria or "",
        r.tipo_punto or "",
        r.provincia or "",
        r.tipo_demanda or "",
        r.periodo or "",
        r.motivo or "",
        r.magnitud or "",
        r.e_publicada if r.e_publicada is not None else "",
        r.e_propuesta if r.e_propuesta is not None else "",
        r.comentario_emisor or "",
        r.autoobjecion or "",
        r.aceptacion or "",
        r.motivo_no_aceptacion or "",
        r.comentario_respuesta or "",
    ] for r in rows]
    return _csv_to_bz2(data)


# ── OBJEINCL ──────────────────────────────────────────────────────────────────
# Columnas por posición:
# 0  CUPS
# 1  Periodo_inicio (o Periodo de la objeción)
# 2  Motivo
# 3  AE_publicada
# 4  AE_propuesta
# 5  AS_publicada
# 6  AS_propuesta
# 7  Comentario
# 8  Autoobjecion

def import_incl(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionINCL(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
            cups=_str(_col(row, 0)),
            periodo=_str(_col(row, 1)),
            motivo=_str(_col(row, 2)),
            ae_publicada=_dec(_col(row, 3)),
            ae_propuesta=_dec(_col(row, 4)),
            as_publicada=_dec(_col(row, 5)),
            as_propuesta=_dec(_col(row, 6)),
            comentario_emisor=_str(_col(row, 7)),
            autoobjecion=_str(_col(row, 8)),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_incl(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None) -> List[ObjecionINCL]:
    q = db.query(ObjecionINCL).filter(ObjecionINCL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionINCL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionINCL.periodo.ilike(f"%{periodo}%"))
    return q.order_by(ObjecionINCL.id.desc()).all()


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
        ObjecionINCL.id.in_(ids),
        ObjecionINCL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def generate_reobjeincl(db: Session, *, tenant_id: int, empresa_id: int, periodo: Optional[str] = None) -> bytes:
    """REOBJEINCL — sin cabeceras, sin ID, bz2."""
    rows = list_incl(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)
    data = [[
        r.cups or "",
        r.periodo or "",
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
    ] for r in rows]
    return _csv_to_bz2(data)


# ── AOBCUPS ───────────────────────────────────────────────────────────────────
# Columnas por posición:
# 0  ID_objecion
# 1  CUPS
# 2  Periodo_cierre_objetado
# 3  Motivo
# 4  E_publicada
# 5  E_propuesta
# 6  Comentario_emisor
# 7  Autoobjecion (S/N)
# 8  Aceptacion (S/N)
# 9  Motivo_no_aceptacion
# 10 Comentario_respuesta
# 11 Magnitud

def import_cups(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionCUPS(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
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


def list_cups(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None) -> List[ObjecionCUPS]:
    q = db.query(ObjecionCUPS).filter(ObjecionCUPS.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCUPS.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCUPS.periodo == periodo)
    return q.order_by(ObjecionCUPS.id.desc()).all()


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
        ObjecionCUPS.id.in_(ids),
        ObjecionCUPS.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def generate_reobcups(db: Session, *, tenant_id: int, empresa_id: int, periodo: Optional[str] = None) -> bytes:
    """REOBCUPS — sin cabeceras, sin ID, bz2."""
    rows = list_cups(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)
    data = [[
        r.cups or "",
        r.periodo or "",
        r.motivo or "",
        r.e_publicada if r.e_publicada is not None else "",
        r.e_propuesta if r.e_propuesta is not None else "",
        r.comentario_emisor or "",
        r.autoobjecion or "",
        r.aceptacion or "",
        r.motivo_no_aceptacion or "",
        r.comentario_respuesta or "",
        r.magnitud or "",
    ] for r in rows]
    return _csv_to_bz2(data)


# ── AOBCIL ────────────────────────────────────────────────────────────────────
# Columnas por posición:
# 0  ID_objecion
# 1  CIL
# 2  Periodo
# 3  Motivo
# 4  EAS_publicada
# 5  EAS_propuesta
# 6  EQ2_publicada
# 7  EQ2_propuesta
# 8  EQ3_publicada
# 9  EQ3_propuesta
# 10 Comentario_emisor
# 11 Autoobjecion

def import_cil(db: Session, *, tenant_id: int, empresa_id: int, nombre_fichero: str, content: bytes) -> int:
    rows = _parse_rows(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionCIL(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
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


def list_cil(db: Session, *, tenant_id: int, empresa_id: Optional[int] = None, periodo: Optional[str] = None) -> List[ObjecionCIL]:
    q = db.query(ObjecionCIL).filter(ObjecionCIL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCIL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCIL.periodo == periodo)
    return q.order_by(ObjecionCIL.id.desc()).all()


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
        ObjecionCIL.id.in_(ids),
        ObjecionCIL.tenant_id == tenant_id,
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def generate_reobcil(db: Session, *, tenant_id: int, empresa_id: int, periodo: Optional[str] = None) -> bytes:
    """REOBCIL — sin cabeceras, sin ID, bz2."""
    rows = list_cil(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)
    data = [[
        r.cil or "",
        r.periodo or "",
        r.motivo or "",
        r.eas_publicada if r.eas_publicada is not None else "",
        r.eas_propuesta if r.eas_propuesta is not None else "",
        r.eq2_publicada if r.eq2_publicada is not None else "",
        r.eq2_propuesta if r.eq2_propuesta is not None else "",
        r.eq3_publicada if r.eq3_publicada is not None else "",
        r.eq3_propuesta if r.eq3_propuesta is not None else "",
        r.comentario_emisor or "",
        r.autoobjecion or "",
        r.aceptacion or "",
        r.motivo_no_aceptacion or "",
        r.comentario_respuesta or "",
    ] for r in rows]
    return _csv_to_bz2(data)
