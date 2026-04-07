# app/objeciones/services.py
# pyright: reportMissingImports=false

from __future__ import annotations

import io
import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from sqlalchemy.orm import Session

from app.objeciones.models import ObjecionAGRECL, ObjecionCIL, ObjecionCUPS, ObjecionINCL


# ── Helpers ───────────────────────────────────────────────────────────────────

def _dec(value: str) -> Optional[Decimal]:
    """Convierte string a Decimal, devuelve None si vacío o inválido."""
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


def _parse_csv_bytes(content: bytes) -> List[dict]:
    """
    Parsea el contenido de un fichero .0 (CSV con separador ';').
    Salta líneas vacías y la primera línea si es el nombre del fichero
    (no contiene ';' o todos los campos son vacíos).
    Devuelve lista de dicts con las cabeceras de la primera fila válida.
    """
    text = content.decode("latin-1", errors="replace")
    reader = csv.reader(io.StringIO(text), delimiter=";")
    rows = list(reader)

    # Buscar la fila de cabeceras — primera que tenga más de 1 columna con datos
    header_idx = None
    for i, row in enumerate(rows):
        non_empty = [c for c in row if c.strip()]
        if len(non_empty) > 2:
            header_idx = i
            break

    if header_idx is None:
        return []

    headers = [h.strip() for h in rows[header_idx]]
    result = []
    for row in rows[header_idx + 1:]:
        if not any(c.strip() for c in row):
            continue
        record = {}
        for i, h in enumerate(headers):
            record[h] = row[i].strip() if i < len(row) else ""
        result.append(record)

    return result


# ── AOBAGRECL ─────────────────────────────────────────────────────────────────

# Cabeceras exactas del fichero AOBAGRECL (según Excel de referencia)
_AGRECL_MAP = {
    "ID de la objeción":                              "id_objecion",
    "Distribuidor":                                   "distribuidor",
    "Comercializador o consumidor directo a mercado": "comercializador",
    "Nivel de tensión":                               "nivel_tension",
    "Tarifa de acceso":                               "tarifa_acceso",
    "Discriminación horaria":                         "disc_horaria",
    "Tipo de punto de medida":                        "tipo_punto",
    "Provincia o subsistema":                         "provincia",
    "Tipo de demanda":                                "tipo_demanda",
    "Periodo del cierre objetado":                    "periodo",
    "Motivo de objeción":                             "motivo",
    "Magnitud":                                       "magnitud",
    "Valor de energía activa entrante publicado (kWh)": "e_publicada",
    "Valor de energía activa entrante propuesto (kWh)": "e_propuesta",
    "Comentario del emisor de la objeción":           "comentario_emisor",
    "Objeción a autobjeción":                         "autoobjecion",
}


def import_agrecl(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    nombre_fichero: str,
    content: bytes,
) -> int:
    rows = _parse_csv_bytes(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionAGRECL(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
            id_objecion=_str(row.get("ID de la objeción", "")),
            distribuidor=_str(row.get("Distribuidor", "")),
            comercializador=_str(row.get("Comercializador o consumidor directo a mercado", "")),
            nivel_tension=_str(row.get("Nivel de tensión", "")),
            tarifa_acceso=_str(row.get("Tarifa de acceso", "")),
            disc_horaria=_str(row.get("Discriminación horaria", "")),
            tipo_punto=_str(row.get("Tipo de punto de medida", "")),
            provincia=_str(row.get("Provincia o subsistema", "")),
            tipo_demanda=_str(row.get("Tipo de demanda", "")),
            periodo=_str(row.get("Periodo del cierre objetado", "")),
            motivo=_str(row.get("Motivo de objeción", "")),
            magnitud=_str(row.get("Magnitud", "")),
            e_publicada=_dec(row.get("Valor de energía activa entrante publicado (kWh)", "")),
            e_propuesta=_dec(row.get("Valor de energía activa entrante propuesto (kWh)", "")),
            comentario_emisor=_str(row.get("Comentario del emisor de la objeción", "")),
            autoobjecion=_str(row.get("Objeción a autobjeción", "")),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_agrecl(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
) -> List[ObjecionAGRECL]:
    q = db.query(ObjecionAGRECL).filter(ObjecionAGRECL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionAGRECL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionAGRECL.periodo == periodo)
    return q.order_by(ObjecionAGRECL.id.desc()).all()


def update_agrecl_respuesta(
    db: Session,
    *,
    id: int,
    tenant_id: int,
    aceptacion: str,
    motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str],
    respuesta_publicada: Optional[int] = 0,
) -> ObjecionAGRECL:
    obj = db.query(ObjecionAGRECL).filter(
        ObjecionAGRECL.id == id,
        ObjecionAGRECL.tenant_id == tenant_id,
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


def generate_reobagrecl(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    periodo: Optional[str] = None,
) -> bytes:
    """
    Genera el fichero REOBAGRECL en formato CSV con separador ';'.
    Cabeceras exactas según Excel de referencia — SIN ID de objeción.
    """
    rows = list_agrecl(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)

    cabeceras = [
        "Distribuidor",
        "Comercializador o consumidor directo a mercado",
        "Nivel de tensión",
        "Tarifa de acceso",
        "Discriminación horaria",
        "Tipo de punto de medida",
        "Provincia o subsistema",
        "Tipo de demanda",
        "Periodo del cierre objetado",
        "Motivo de objeción",
        "Magnitud",
        "Valor de energía activa entrante publicado (kWh)",
        "Valor de energía activa entrante propuesto (kWh)",
        "Comentario del emisor de la objeción",
        "Objeción a autobjeción (S/N)",
        "Aceptación",
        "Motivo de no aceptación",
        "Comentario del emisor de la respuesta",
    ]

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    writer.writerow(cabeceras)
    for r in rows:
        writer.writerow([
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
            r.e_publicada or "",
            r.e_propuesta or "",
            r.comentario_emisor or "",
            r.autoobjecion or "",
            r.aceptacion or "",
            r.motivo_no_aceptacion or "",
            r.comentario_respuesta or "",
        ])
    return output.getvalue().encode("latin-1", errors="replace")


# ── OBJEINCL ──────────────────────────────────────────────────────────────────

def import_incl(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    nombre_fichero: str,
    content: bytes,
) -> int:
    rows = _parse_csv_bytes(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionINCL(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
            cups=_str(row.get("CUPS", "")),
            periodo=_str(row.get("Periodo de la objeción", "")),
            motivo=_str(row.get("Motivo de la objeción", "")),
            ae_publicada=_dec(row.get("Valor de energía activa entrante publicado (kWh)", "")),
            ae_propuesta=_dec(row.get("Valor de energía activa entrante propuesto (kWh)", "")),
            as_publicada=_dec(row.get("Valor de energía activa saliente publicado (kWh)", "")),
            as_propuesta=_dec(row.get("Valor de energía saliente entrante propuesto (kWh)", "")),
            comentario_emisor=_str(row.get("Comentario", "")),
            autoobjecion=_str(row.get("Objeción a autobjeción", "")),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_incl(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
) -> List[ObjecionINCL]:
    q = db.query(ObjecionINCL).filter(ObjecionINCL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionINCL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionINCL.periodo.ilike(f"%{periodo}%"))
    return q.order_by(ObjecionINCL.id.desc()).all()


def update_incl_respuesta(
    db: Session,
    *,
    id: int,
    tenant_id: int,
    aceptacion: str,
    motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str],
    respuesta_publicada: Optional[int] = 0,
) -> ObjecionINCL:
    obj = db.query(ObjecionINCL).filter(
        ObjecionINCL.id == id,
        ObjecionINCL.tenant_id == tenant_id,
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


def generate_reobjeincl(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    periodo: Optional[str] = None,
) -> bytes:
    """Genera REOBJEINCL — SIN ID de objeción."""
    rows = list_incl(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)

    cabeceras = [
        "CUPS",
        "Periodo de la objeción",
        "Motivo de la objeción",
        "Valor de energía activa entrante publicado (kWh)",
        "Valor de energía activa entrante propuesto (kWh)",
        "Valor de energía activa saliente publicado (kWh)",
        "Valor de energía saliente entrante propuesto (kWh)",
        "Comentario",
        "Objeción a autobjeción",
        "Aceptación",
        "Motivo de no aceptación",
        "Comentario del emisor de la respuesta",
    ]

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    writer.writerow(cabeceras)
    for r in rows:
        writer.writerow([
            r.cups or "",
            r.periodo or "",
            r.motivo or "",
            r.ae_publicada or "",
            r.ae_propuesta or "",
            r.as_publicada or "",
            r.as_propuesta or "",
            r.comentario_emisor or "",
            r.autoobjecion or "",
            r.aceptacion or "",
            r.motivo_no_aceptacion or "",
            r.comentario_respuesta or "",
        ])
    return output.getvalue().encode("latin-1", errors="replace")


# ── AOBCUPS ───────────────────────────────────────────────────────────────────

def import_cups(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    nombre_fichero: str,
    content: bytes,
) -> int:
    rows = _parse_csv_bytes(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionCUPS(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
            id_objecion=_str(row.get("ID de la objeción", "")),
            cups=_str(row.get("CUPS", "")),
            periodo=_str(row.get("Periodo de cierre objetado", "")),
            motivo=_str(row.get("Motivo de objeción", "")),
            e_publicada=_dec(row.get("Valor de energía activa entrante publicado (kWh)", "")),
            e_propuesta=_dec(row.get("Valor de energía activa entrante propuesto (kWh)", "")),
            comentario_emisor=_str(row.get("Comentario del emisor de la objeción", "")),
            autoobjecion=_str(row.get("Objeción a autobjeción (S/N)", "")),
            aceptacion=_str(row.get("Aceptación (S/N)", "")),
            motivo_no_aceptacion=_str(row.get("Motivo de no aceptación", "")),
            comentario_respuesta=_str(row.get("Comentario del emisor de la respuesta", "")),
            magnitud=_str(row.get("Magnitud", "")),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_cups(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
) -> List[ObjecionCUPS]:
    q = db.query(ObjecionCUPS).filter(ObjecionCUPS.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCUPS.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCUPS.periodo == periodo)
    return q.order_by(ObjecionCUPS.id.desc()).all()


def update_cups_respuesta(
    db: Session,
    *,
    id: int,
    tenant_id: int,
    aceptacion: str,
    motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str],
    respuesta_publicada: Optional[int] = 0,
) -> ObjecionCUPS:
    obj = db.query(ObjecionCUPS).filter(
        ObjecionCUPS.id == id,
        ObjecionCUPS.tenant_id == tenant_id,
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


def generate_reobcups(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    periodo: Optional[str] = None,
) -> bytes:
    """
    Genera REOBCUPS — SIN ID de objeción.
    El fichero AOBCUPS ya traía los campos de respuesta en la entrada.
    """
    rows = list_cups(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)

    cabeceras = [
        "CUPS",
        "Periodo de cierre objetado",
        "Motivo de objeción",
        "Valor de energía activa entrante publicado (kWh)",
        "Valor de energía activa entrante propuesto (kWh)",
        "Comentario del emisor de la objeción",
        "Objeción a autobjeción (S/N)",
        "Aceptación",
        "Motivo de no aceptación",
        "Comentario del emisor de la respuesta",
        "Magnitud",
    ]

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    writer.writerow(cabeceras)
    for r in rows:
        writer.writerow([
            r.cups or "",
            r.periodo or "",
            r.motivo or "",
            r.e_publicada or "",
            r.e_propuesta or "",
            r.comentario_emisor or "",
            r.autoobjecion or "",
            r.aceptacion or "",
            r.motivo_no_aceptacion or "",
            r.comentario_respuesta or "",
            r.magnitud or "",
        ])
    return output.getvalue().encode("latin-1", errors="replace")


# ── AOBCIL ────────────────────────────────────────────────────────────────────

def import_cil(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    nombre_fichero: str,
    content: bytes,
) -> int:
    rows = _parse_csv_bytes(content)
    nuevos = 0
    for row in rows:
        obj = ObjecionCIL(
            tenant_id=tenant_id,
            empresa_id=empresa_id,
            nombre_fichero=nombre_fichero,
            id_objecion=_str(row.get("ID de la objeción", "")),
            cil=_str(row.get("CIL", "")),
            periodo=_str(row.get("Periodo de cierre objetado", "")),
            motivo=_str(row.get("Motivo de objeción", "")),
            eas_publicada=_dec(row.get("Valor de energía activa saliente publicado (kWh)", "")),
            eas_propuesta=_dec(row.get("Valor de energía activa saliente propuesto (kWh)", "")),
            eq2_publicada=_dec(row.get("Valor de energía reactiva en el periodo cuadrante 2 publicado (kVArh) (3)", "")),
            eq2_propuesta=_dec(row.get("Valor de energía reactiva en el periodo cuadrante 2 propuesto (kVArh) (3)", "")),
            eq3_publicada=_dec(row.get("Valor de energía reactiva en el periodo cuadrante 3 publicado (kVArh) (3)", "")),
            eq3_propuesta=_dec(row.get("Valor de energía reactiva en el periodo cuadrante 2 propuesto (kVArh) (3)3", "")),
            comentario_emisor=_str(row.get("Comentario del emisor de la objeción", "")),
            autoobjecion=_str(row.get("Objeción a autobjeción", "")),
        )
        db.add(obj)
        nuevos += 1
    db.commit()
    return nuevos


def list_cil(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    periodo: Optional[str] = None,
) -> List[ObjecionCIL]:
    q = db.query(ObjecionCIL).filter(ObjecionCIL.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ObjecionCIL.empresa_id == empresa_id)
    if periodo:
        q = q.filter(ObjecionCIL.periodo == periodo)
    return q.order_by(ObjecionCIL.id.desc()).all()


def update_cil_respuesta(
    db: Session,
    *,
    id: int,
    tenant_id: int,
    aceptacion: str,
    motivo_no_aceptacion: Optional[str],
    comentario_respuesta: Optional[str],
    respuesta_publicada: Optional[int] = 0,
) -> ObjecionCIL:
    obj = db.query(ObjecionCIL).filter(
        ObjecionCIL.id == id,
        ObjecionCIL.tenant_id == tenant_id,
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


def generate_reobcil(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    periodo: Optional[str] = None,
) -> bytes:
    """Genera REOBCIL — SIN ID de objeción."""
    rows = list_cil(db, tenant_id=tenant_id, empresa_id=empresa_id, periodo=periodo)

    cabeceras = [
        "CIL",
        "Periodo de cierre objetado",
        "Motivo de objeción",
        "Valor de energía activa saliente publicado (kWh)",
        "Valor de energía activa saliente propuesto (kWh)",
        "Valor de energía reactiva en el periodo cuadrante 2 publicado (kVArh) (3)",
        "Valor de energía reactiva en el periodo cuadrante 2 propuesto (kVArh) (3)",
        "Valor de energía reactiva en el periodo cuadrante 3 publicado (kVArh) (3)",
        "Valor de energía reactiva en el periodo cuadrante 2 propuesto (kVArh) (3)3",
        "Comentario del emisor de la objeción",
        "Objeción a autobjeción",
        "Aceptación (S/N)",
        "Motivo de no aceptación",
        "Comentario del emisor de la respuesta",
    ]

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    writer.writerow(cabeceras)
    for r in rows:
        writer.writerow([
            r.cil or "",
            r.periodo or "",
            r.motivo or "",
            r.eas_publicada or "",
            r.eas_propuesta or "",
            r.eq2_publicada or "",
            r.eq2_propuesta or "",
            r.eq3_publicada or "",
            r.eq3_propuesta or "",
            r.comentario_emisor or "",
            r.autoobjecion or "",
            r.aceptacion or "",
            r.motivo_no_aceptacion or "",
            r.comentario_respuesta or "",
        ])
    return output.getvalue().encode("latin-1", errors="replace")
