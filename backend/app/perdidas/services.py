# app/perdidas/services.py
# pyright: reportMissingImports=false

from __future__ import annotations

import io
import os
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.comunicaciones.models import FtpConfig
from app.comunicaciones.services import _conectar_en_path
from app.empresas.models import Empresa
from app.perdidas.models import Concentrador, PerdidaDiaria


# ── Helpers ───────────────────────────────────────────────────────────────────

def _nombre_empresa(db: Session, empresa_id: int) -> str:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return str(getattr(emp, "nombre", "") or f"Empresa {empresa_id}") if emp else f"Empresa {empresa_id}"


def _concentrador_to_dict(obj: Concentrador, db: Session) -> dict:
    return {
        "id":                   obj.id,
        "tenant_id":            obj.tenant_id,
        "empresa_id":           obj.empresa_id,
        "empresa_nombre":       _nombre_empresa(db, int(obj.empresa_id)),
        "nombre_ct":            obj.nombre_ct,
        "id_concentrador":      obj.id_concentrador,
        "id_supervisor":        obj.id_supervisor,
        "magn_supervisor":      obj.magn_supervisor,
        "directorio_ftp":       obj.directorio_ftp,
        "ftp_config_id":        obj.ftp_config_id,
        "fecha_ultimo_proceso": obj.fecha_ultimo_proceso,
        "activo":               obj.activo,
        "created_at":           obj.created_at,
        "updated_at":           obj.updated_at,
    }


def _perdida_to_dict(obj: PerdidaDiaria, nombre_ct: str) -> dict:
    return {
        "id":                  obj.id,
        "tenant_id":           obj.tenant_id,
        "empresa_id":          obj.empresa_id,
        "concentrador_id":     obj.concentrador_id,
        "nombre_ct":           nombre_ct,
        "fecha":               obj.fecha,
        "nombre_fichero_s02":  obj.nombre_fichero_s02,
        "ai_supervisor":       obj.ai_supervisor,
        "ae_supervisor":       obj.ae_supervisor,
        "ai_clientes":         obj.ai_clientes,
        "ae_clientes":         obj.ae_clientes,
        "energia_neta_wh":     obj.energia_neta_wh,
        "perdida_wh":          obj.perdida_wh,
        "perdida_pct":         obj.perdida_pct,
        "num_contadores":      obj.num_contadores,
        "horas_con_datos":     obj.horas_con_datos,
        "estado":              obj.estado,
        "created_at":          obj.created_at,
    }


# ── CRUD Concentrador ─────────────────────────────────────────────────────────

def list_concentradores(
    db: Session, *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
) -> List[dict]:
    q = db.query(Concentrador).filter(Concentrador.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(Concentrador.empresa_id == empresa_id)
    return [_concentrador_to_dict(c, db) for c in q.order_by(Concentrador.empresa_id, Concentrador.nombre_ct).all()]


def create_concentrador(
    db: Session, *,
    tenant_id: int,
    empresa_id: int,
    nombre_ct: str,
    id_concentrador: str,
    id_supervisor: Optional[str],
    magn_supervisor: int,
    directorio_ftp: Optional[str],
    ftp_config_id: Optional[int],
    activo: bool,
) -> dict:
    obj = Concentrador(
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        nombre_ct=nombre_ct,
        id_concentrador=id_concentrador,
        id_supervisor=id_supervisor,
        magn_supervisor=magn_supervisor,
        directorio_ftp=directorio_ftp,
        ftp_config_id=ftp_config_id,
        activo=activo,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _concentrador_to_dict(obj, db)


def update_concentrador(
    db: Session, *,
    concentrador_id: int,
    tenant_id: int,
    nombre_ct: Optional[str],
    id_supervisor: Optional[str],
    magn_supervisor: Optional[int],
    directorio_ftp: Optional[str],
    ftp_config_id: Optional[int],
    activo: Optional[bool],
) -> dict:
    obj = db.query(Concentrador).filter(
        Concentrador.id == concentrador_id,
        Concentrador.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"Concentrador id={concentrador_id} no encontrado")
    if nombre_ct is not None:
        obj.nombre_ct = nombre_ct  # type: ignore
    if id_supervisor is not None:
        obj.id_supervisor = id_supervisor  # type: ignore
    if magn_supervisor is not None:
        obj.magn_supervisor = magn_supervisor  # type: ignore
    if directorio_ftp is not None:
        obj.directorio_ftp = directorio_ftp  # type: ignore
    if ftp_config_id is not None:
        obj.ftp_config_id = ftp_config_id  # type: ignore
    if activo is not None:
        obj.activo = activo  # type: ignore
    obj.updated_at = datetime.utcnow()  # type: ignore
    db.commit()
    db.refresh(obj)
    return _concentrador_to_dict(obj, db)


def delete_concentrador(db: Session, *, concentrador_id: int, tenant_id: int) -> None:
    obj = db.query(Concentrador).filter(
        Concentrador.id == concentrador_id,
        Concentrador.tenant_id == tenant_id,
    ).first()
    if obj is None:
        raise ValueError(f"Concentrador id={concentrador_id} no encontrado")
    db.delete(obj)
    db.commit()


# ── Parseo de fichero S02 ─────────────────────────────────────────────────────

def _parse_s02(content: bytes) -> dict:
    """
    Parsea un fichero S02 XML y extrae:
    - id_concentrador
    - id_supervisor (el Cnt con Id que empieza por CIR, o Magn != 1)
    - magn_supervisor
    - lecturas por contador
    Devuelve un dict con los datos necesarios para calcular pérdidas.
    """
    text = content.decode("latin1", errors="replace")
    root = ET.fromstring(text.replace("\r", ""))

    cnc = root.find("Cnc")
    if cnc is None:
        raise ValueError("Fichero S02 sin elemento <Cnc>")

    id_concentrador = cnc.get("Id", "")
    contadores = cnc.findall("Cnt")

    supervisor = None
    clientes = []

    for cnt in contadores:
        cid  = cnt.get("Id", "")
        magn = int(cnt.get("Magn", 1))
        lecturas = cnt.findall("S02")
        total_ai = sum(int(s.get("AI", 0)) for s in lecturas) * magn
        total_ae = sum(int(s.get("AE", 0)) for s in lecturas) * magn
        horas = len(lecturas)

        if magn != 1 or cid.startswith("CIR"):
            supervisor = {
                "id":    cid,
                "magn":  magn,
                "ai":    total_ai,
                "ae":    total_ae,
                "horas": horas,
            }
        else:
            clientes.append({"id": cid, "ai": total_ai, "ae": total_ae})

    return {
        "id_concentrador": id_concentrador,
        "supervisor":      supervisor,
        "clientes":        clientes,
        "num_contadores":  len(contadores),
    }


def _calcular_perdida(supervisor: dict, clientes: list, magn: int) -> dict:  # noqa: ARG001
    """Calcula la pérdida a partir de los datos del S02."""
    ai_sup = supervisor["ai"]
    ae_sup = supervisor["ae"]
    ai_cli = sum(c["ai"] for c in clientes)
    ae_cli = sum(c["ae"] for c in clientes)

    energia_neta  = ai_sup  # ya viene multiplicado por magn en el parse
    neta_clientes = ai_cli - ae_cli
    perdida_wh    = energia_neta - neta_clientes

    perdida_pct = None
    if energia_neta > 0:
        perdida_pct = Decimal(str(perdida_wh / energia_neta * 100)).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )

    horas  = supervisor.get("horas", 0)
    estado = "ok" if horas >= 23 else ("incompleto" if horas > 0 else "sin_datos")

    return {
        "ai_supervisor":   ai_sup,
        "ae_supervisor":   ae_sup,
        "ai_clientes":     ai_cli,
        "ae_clientes":     ae_cli,
        "energia_neta_wh": energia_neta,
        "perdida_wh":      perdida_wh,
        "perdida_pct":     perdida_pct,
        "horas_con_datos": horas,
        "estado":          estado,
    }


# ── Descubrimiento automático desde FTP ──────────────────────────────────────

def descubrir_concentradores(
    db: Session, *,
    tenant_id: int,
    ftp_config_id: int,
    directorio: str,
) -> List[dict]:
    """
    Escanea el directorio FTP buscando ficheros S02,
    descarga uno por concentrador y extrae su configuración.
    """
    config = db.query(FtpConfig).filter(
        FtpConfig.id == ftp_config_id,
        FtpConfig.tenant_id == tenant_id,
        FtpConfig.activo.is_(True),
    ).first()
    if config is None:
        raise ValueError(f"FtpConfig id={ftp_config_id} no encontrada o inactiva")

    # Listar ficheros S02 en el directorio
    ftp = _conectar_en_path(config, directorio)
    lineas: List[str] = []
    try:
        ftp.retrlines("LIST", lineas.append)
    finally:
        try:
            ftp.quit()
        except Exception:
            pass

    # Agrupar ficheros S02 por concentrador (coger el más reciente de cada uno)
    s02_por_concentrador: dict = {}
    for linea in lineas:
        partes = linea.split()
        if len(partes) < 9:
            continue
        nombre = " ".join(partes[8:])
        m = re.match(r"^(CIR\d+)_0_S02_", nombre)
        if m:
            cid = m.group(1)
            if cid not in s02_por_concentrador:
                s02_por_concentrador[cid] = nombre
            elif nombre > s02_por_concentrador[cid]:
                s02_por_concentrador[cid] = nombre

    # Descargar y parsear un S02 por concentrador
    resultado = []
    ftp2 = _conectar_en_path(config, directorio)
    try:
        for id_conc, fichero in s02_por_concentrador.items():
            try:
                buf = io.BytesIO()
                ftp2.retrbinary(f"RETR {fichero}", buf.write)
                datos = _parse_s02(buf.getvalue())
                sup = datos.get("supervisor")
                resultado.append({
                    "id_concentrador":   id_conc,
                    "id_supervisor":     sup["id"] if sup else None,
                    "magn_supervisor":   sup["magn"] if sup else 1000,
                    "num_contadores":    datos["num_contadores"],
                    "directorio_ftp":    directorio,
                    "nombre_fichero":    fichero,
                    "ftp_config_id":     ftp_config_id,
                    "ftp_config_nombre": str(config.nombre or config.host),
                })
            except Exception as e:
                resultado.append({
                    "id_concentrador":   id_conc,
                    "id_supervisor":     None,
                    "magn_supervisor":   1000,
                    "num_contadores":    0,
                    "directorio_ftp":    directorio,
                    "nombre_fichero":    fichero,
                    "ftp_config_id":     ftp_config_id,
                    "ftp_config_nombre": str(config.nombre or config.host),
                    "error":             str(e)[:200],
                })
    finally:
        try:
            ftp2.quit()
        except Exception:
            pass

    return resultado


# ── Procesamiento de S02 ──────────────────────────────────────────────────────

def _directorio_descarga() -> Path:
    base = Path(os.environ.get("FTP_DOWNLOAD_DIR", "/tmp/ftp_downloads"))
    return base


def procesar_s02(
    db: Session, *,
    tenant_id: int,
    concentrador_ids: Optional[List[int]],
    fecha_desde: date,
    fecha_hasta: date,
) -> Tuple[int, int, int, List[str]]:
    """
    Procesa los ficheros S02 descargados para los concentradores indicados
    en el rango de fechas. Calcula pérdidas y guarda en perdida_diaria.
    Si ya existe un registro para esa fecha → sobreescribe.
    """
    q = db.query(Concentrador).filter(
        Concentrador.tenant_id == tenant_id,
        Concentrador.activo.is_(True),
    )
    if concentrador_ids:
        q = q.filter(Concentrador.id.in_(concentrador_ids))
    concentradores = q.all()

    procesados = 0
    errores    = 0
    omitidos   = 0
    detalle: List[str] = []

    base_dir = _directorio_descarga()

    for conc in concentradores:
        empresa_dir = base_dir / str(conc.empresa_id)
        if not empresa_dir.exists():
            detalle.append(f"OMITIDO: {conc.nombre_ct} — sin directorio de descarga")
            omitidos += 1
            continue

        patron = re.compile(rf"^{re.escape(conc.id_concentrador)}_0_S02_0_(\d{{8}})")

        ficheros_encontrados = []
        for f in empresa_dir.iterdir():
            m = patron.match(f.name)
            if m:
                ts = m.group(1)
                try:
                    fecha_f = date(int(ts[:4]), int(ts[4:6]), int(ts[6:8]))
                    if fecha_desde <= fecha_f <= fecha_hasta:
                        ficheros_encontrados.append((fecha_f, f))
                except ValueError:
                    continue

        if not ficheros_encontrados:
            detalle.append(f"OMITIDO: {conc.nombre_ct} — sin ficheros S02 en el rango")
            omitidos += 1
            continue

        for fecha_f, fichero_path in sorted(ficheros_encontrados):
            try:
                content = fichero_path.read_bytes()
                datos   = _parse_s02(content)
                sup     = datos.get("supervisor")

                if sup is None:
                    detalle.append(f"AVISO: {conc.nombre_ct} {fecha_f} — supervisor no detectado en S02")

                calculo = _calcular_perdida(
                    supervisor=sup or {
                        "id": conc.id_supervisor, "magn": conc.magn_supervisor,
                        "ai": 0, "ae": 0, "horas": 0,
                    },
                    clientes=datos["clientes"],
                    magn=conc.magn_supervisor,
                )

                # Upsert: borrar si existe y crear nuevo
                existing = db.query(PerdidaDiaria).filter(
                    PerdidaDiaria.concentrador_id == conc.id,
                    PerdidaDiaria.fecha == fecha_f,
                ).first()
                if existing:
                    db.delete(existing)
                    db.flush()

                perdida = PerdidaDiaria(
                    tenant_id=conc.tenant_id,
                    empresa_id=conc.empresa_id,
                    concentrador_id=conc.id,
                    fecha=fecha_f,
                    nombre_fichero_s02=fichero_path.name,
                    num_contadores=datos["num_contadores"],
                    created_at=datetime.utcnow(),
                    **calculo,
                )
                db.add(perdida)
                db.commit()

                # Actualizar fecha_ultimo_proceso del concentrador
                if conc.fecha_ultimo_proceso is None or fecha_f > conc.fecha_ultimo_proceso:
                    conc.fecha_ultimo_proceso = fecha_f  # type: ignore
                    conc.updated_at = datetime.utcnow()  # type: ignore
                    db.commit()

                procesados += 1
                detalle.append(
                    f"OK: {conc.nombre_ct} {fecha_f} — "
                    f"perdida={calculo['perdida_wh']} Wh ({calculo['perdida_pct']}%)"
                )

            except Exception as e:
                errores += 1
                detalle.append(f"ERROR: {conc.nombre_ct} {fecha_f} — {str(e)[:200]}")

    return procesados, errores, omitidos, detalle


# ── Consulta pérdidas diarias ─────────────────────────────────────────────────

def list_perdidas_diarias(
    db: Session, *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    concentrador_id: Optional[int] = None,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    limit: int = 500,
) -> List[dict]:
    q = db.query(PerdidaDiaria, Concentrador).join(
        Concentrador, PerdidaDiaria.concentrador_id == Concentrador.id
    ).filter(PerdidaDiaria.tenant_id == tenant_id)

    if empresa_id:
        q = q.filter(PerdidaDiaria.empresa_id == empresa_id)
    if concentrador_id:
        q = q.filter(PerdidaDiaria.concentrador_id == concentrador_id)
    if fecha_desde:
        q = q.filter(PerdidaDiaria.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(PerdidaDiaria.fecha <= fecha_hasta)

    rows = q.order_by(PerdidaDiaria.fecha.desc(), Concentrador.nombre_ct).limit(limit).all()
    return [_perdida_to_dict(p, c.nombre_ct) for p, c in rows]


# ── Pérdidas mensuales (calculadas en tiempo real) ────────────────────────────

def list_perdidas_mensuales(
    db: Session, *,
    tenant_id: int,
    empresa_id: Optional[int] = None,
    concentrador_id: Optional[int] = None,
    anio: Optional[int] = None,
) -> List[dict]:
    from sqlalchemy import cast, func, extract, Integer

    q = db.query(
        PerdidaDiaria.concentrador_id,
        Concentrador.nombre_ct,
        Concentrador.empresa_id,
        extract("year",  PerdidaDiaria.fecha).label("anio"),
        extract("month", PerdidaDiaria.fecha).label("mes"),
        func.sum(PerdidaDiaria.ai_supervisor).label("ai_supervisor"),
        func.sum(PerdidaDiaria.ae_supervisor).label("ae_supervisor"),
        func.sum(PerdidaDiaria.ai_clientes).label("ai_clientes"),
        func.sum(PerdidaDiaria.ae_clientes).label("ae_clientes"),
        func.sum(PerdidaDiaria.energia_neta_wh).label("energia_neta_wh"),
        func.sum(PerdidaDiaria.perdida_wh).label("perdida_wh"),
        func.count(PerdidaDiaria.id).label("dias_procesados"),
        func.sum(cast(PerdidaDiaria.estado == "ok", Integer)).label("dias_completos"),
    ).join(
        Concentrador, PerdidaDiaria.concentrador_id == Concentrador.id
    ).filter(PerdidaDiaria.tenant_id == tenant_id)

    if empresa_id:
        q = q.filter(PerdidaDiaria.empresa_id == empresa_id)
    if concentrador_id:
        q = q.filter(PerdidaDiaria.concentrador_id == concentrador_id)
    if anio:
        q = q.filter(extract("year", PerdidaDiaria.fecha) == anio)

    q = q.group_by(
        PerdidaDiaria.concentrador_id,
        Concentrador.nombre_ct,
        Concentrador.empresa_id,
        extract("year",  PerdidaDiaria.fecha),
        extract("month", PerdidaDiaria.fecha),
    ).order_by(
        extract("year",  PerdidaDiaria.fecha).desc(),
        extract("month", PerdidaDiaria.fecha).desc(),
        Concentrador.nombre_ct,
    )

    resultado = []
    for row in q.all():
        energia_neta = int(row.energia_neta_wh or 0)
        perdida_wh   = int(row.perdida_wh or 0)
        perdida_pct  = None
        if energia_neta > 0:
            perdida_pct = Decimal(str(perdida_wh / energia_neta * 100)).quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            )
        resultado.append({
            "concentrador_id":  row.concentrador_id,
            "nombre_ct":        row.nombre_ct,
            "empresa_id":       int(row.empresa_id),
            "anio":             int(row.anio),
            "mes":              int(row.mes),
            "ai_supervisor":    int(row.ai_supervisor or 0),
            "ae_supervisor":    int(row.ae_supervisor or 0),
            "ai_clientes":      int(row.ai_clientes or 0),
            "ae_clientes":      int(row.ae_clientes or 0),
            "energia_neta_wh":  energia_neta,
            "perdida_wh":       perdida_wh,
            "perdida_pct":      perdida_pct,
            "dias_procesados":  int(row.dias_procesados or 0),
            "dias_completos":   int(row.dias_completos or 0),
        })
    return resultado
