# app/topologia/services.py
# pyright: reportMissingImports=false
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.topologia.models import (
    CtInventario,
    CtTransformador,
    CupsTopologia,
    LineaInventario,
    LineaTramo,
)
from app.topologia.parsers.parser_b2 import parsear_b2
from app.topologia.parsers.parser_a1 import parsear_a1
from app.topologia.parsers.parser_b1_b11 import parsear_b1, parsear_b11


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


# ── Upsert CT inventario (B2) ─────────────────────────────────────────────────

def _upsert_ct(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio_declaracion: int,
    registro: Dict[str, Any],
) -> str:
    obj = (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
            CtInventario.id_ct      == registro["id_ct"],
        )
        .first()
    )
    if obj is None:
        obj = CtInventario(
            tenant_id        = tenant_id,
            empresa_id       = empresa_id,
            anio_declaracion = anio_declaracion,
            created_at       = _now(),
            updated_at       = _now(),
        )
        db.add(obj)
        accion = "insertado"
    else:
        obj.updated_at       = _now()
        obj.anio_declaracion = anio_declaracion
        accion = "actualizado"

    obj.id_ct         = registro["id_ct"]
    obj.cini          = registro.get("cini")
    obj.nombre        = registro.get("nombre") or registro["id_ct"]
    obj.codigo_ti     = registro.get("codigo_ti")
    obj.tension_kv    = registro.get("tension_kv")
    obj.potencia_kva  = registro.get("potencia_kva")
    obj.utm_x         = registro.get("utm_x")
    obj.utm_y         = registro.get("utm_y")
    obj.lat           = registro.get("lat")
    obj.lon           = registro.get("lon")
    obj.municipio_ine = registro.get("municipio_ine")
    obj.propiedad     = registro.get("propiedad")
    obj.fecha_aps     = registro.get("fecha_aps")
    return accion


# ── Upsert CT transformador (B21) ─────────────────────────────────────────────

def _upsert_transformador(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    registro: Dict[str, Any],
) -> str:
    obj = (
        db.query(CtTransformador)
        .filter(
            CtTransformador.tenant_id        == tenant_id,
            CtTransformador.empresa_id       == empresa_id,
            CtTransformador.id_ct            == registro["id_ct"],
            CtTransformador.id_transformador == registro["id_transformador"],
        )
        .first()
    )
    if obj is None:
        obj = CtTransformador(
            tenant_id  = tenant_id,
            empresa_id = empresa_id,
            created_at = _now(),
            updated_at = _now(),
        )
        db.add(obj)
        accion = "insertado"
    else:
        obj.updated_at = _now()
        accion = "actualizado"

    obj.id_ct            = registro["id_ct"]
    obj.id_transformador = registro["id_transformador"]
    obj.cini             = registro.get("cini")
    obj.potencia_kva     = registro.get("potencia_kva")
    obj.anio_fabricacion = registro.get("anio_fabricacion")
    obj.en_operacion     = registro.get("en_operacion")
    return accion


# ── Upsert CUPS (A1) ──────────────────────────────────────────────────────────

def _upsert_cups(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio_declaracion: int,
    registro: Dict[str, Any],
) -> str:
    obj = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
            CupsTopologia.cups       == registro["cups"],
        )
        .first()
    )
    if obj is None:
        obj = CupsTopologia(
            tenant_id        = tenant_id,
            empresa_id       = empresa_id,
            anio_declaracion = anio_declaracion,
            created_at       = _now(),
            updated_at       = _now(),
        )
        db.add(obj)
        accion = "insertado"
    else:
        obj.updated_at       = _now()
        obj.anio_declaracion = anio_declaracion
        accion = "actualizado"

    obj.cups                   = registro["cups"]
    obj.id_ct                  = registro.get("id_ct")
    obj.id_salida              = registro.get("id_salida")
    obj.tarifa                 = registro.get("tarifa")
    obj.tension_kv             = registro.get("tension_kv")
    obj.potencia_contratada_kw = registro.get("potencia_contratada_kw")
    obj.autoconsumo            = registro.get("autoconsumo")
    obj.telegestado            = registro.get("telegestado")
    obj.cini_contador          = registro.get("cini_contador")
    obj.fecha_alta             = registro.get("fecha_alta")
    obj.utm_x                  = registro.get("utm_x")
    obj.utm_y                  = registro.get("utm_y")
    obj.lat                    = registro.get("lat")
    obj.lon                    = registro.get("lon")
    return accion


# ── Upsert linea inventario (B1) ──────────────────────────────────────────────

def _upsert_linea(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio_declaracion: int,
    registro: Dict[str, Any],
) -> str:
    if not registro.get("id_tramo"):
        return "error"
    obj = (
        db.query(LineaInventario)
        .filter(
            LineaInventario.tenant_id  == tenant_id,
            LineaInventario.empresa_id == empresa_id,
            LineaInventario.id_tramo   == registro["id_tramo"],
        )
        .first()
    )
    if obj is None:
        obj = LineaInventario(
            tenant_id        = tenant_id,
            empresa_id       = empresa_id,
            anio_declaracion = anio_declaracion,
            created_at       = _now(),
            updated_at       = _now(),
        )
        db.add(obj)
        accion = "insertado"
    else:
        obj.updated_at       = _now()
        obj.anio_declaracion = anio_declaracion
        accion = "actualizado"

    obj.id_tramo      = registro["id_tramo"]
    obj.cini          = registro.get("cini")
    obj.codigo_ccuu   = registro.get("codigo_ccuu")
    obj.nudo_inicio   = registro.get("nudo_inicio")
    obj.nudo_fin      = registro.get("nudo_fin")
    obj.nivel_tension = registro.get("nivel_tension")
    obj.tension_kv    = registro.get("tension_kv")
    obj.longitud_km   = registro.get("longitud_km")
    return accion


# ── Upsert tramo GIS (B11) ────────────────────────────────────────────────────

def _upsert_tramo(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio_declaracion: int,
    registro: Dict[str, Any],
) -> str:
    if not registro.get("id_tramo"):
        return "error"
    obj = (
        db.query(LineaTramo)
        .filter(
            LineaTramo.tenant_id  == tenant_id,
            LineaTramo.empresa_id == empresa_id,
            LineaTramo.id_tramo   == registro["id_tramo"],
        )
        .first()
    )
    if obj is None:
        obj = LineaTramo(
            tenant_id        = tenant_id,
            empresa_id       = empresa_id,
            anio_declaracion = anio_declaracion,
            created_at       = _now(),
            updated_at       = _now(),
        )
        db.add(obj)
        accion = "insertado"
    else:
        obj.updated_at       = _now()
        obj.anio_declaracion = anio_declaracion
        accion = "actualizado"

    obj.id_tramo   = registro["id_tramo"]
    obj.id_linea   = registro.get("id_linea") or ""
    obj.orden      = registro.get("orden")
    obj.num_tramo  = registro.get("num_tramo")
    obj.utm_x_ini  = registro.get("utm_x_ini")
    obj.utm_y_ini  = registro.get("utm_y_ini")
    obj.utm_x_fin  = registro.get("utm_x_fin")
    obj.utm_y_fin  = registro.get("utm_y_fin")
    obj.lat_ini    = registro.get("lat_ini")
    obj.lon_ini    = registro.get("lon_ini")
    obj.lat_fin    = registro.get("lat_fin")
    obj.lon_fin    = registro.get("lon_fin")
    return accion


# ── Parser B21 inline ─────────────────────────────────────────────────────────

def _parsear_b21(
    contenido: bytes,
    encoding: str = "latin-1",
) -> Tuple[List[Dict[str, Any]], List[str]]:
    registros: List[Dict[str, Any]] = []
    errores:   List[str]            = []
    texto = contenido.decode(encoding, errors="replace")

    for num, linea in enumerate(texto.splitlines(), start=1):
        linea = linea.strip()
        if not linea:
            continue
        campos = linea.split(";")
        if len(campos) < 4:
            errores.append(f"Línea {num}: insuficientes campos ({len(campos)})")
            continue
        try:
            id_ct  = campos[0].strip()
            id_trf = campos[1].strip()
            if not id_ct or not id_trf:
                errores.append(f"Línea {num}: id_ct o id_transformador vacío")
                continue

            potencia = None
            try:
                potencia = float(campos[3].strip().replace(",", "."))
            except (ValueError, IndexError):
                pass

            anio = None
            try:
                anio = int(campos[4].strip()) if len(campos) > 4 else None
            except ValueError:
                pass

            operacion = None
            try:
                operacion = int(campos[5].strip()) if len(campos) > 5 else None
            except ValueError:
                pass

            registros.append({
                "id_ct":            id_ct,
                "id_transformador": id_trf,
                "cini":             campos[2].strip() or None,
                "potencia_kva":     potencia,
                "anio_fabricacion": anio,
                "en_operacion":     operacion,
            })
        except Exception as exc:
            errores.append(f"Línea {num}: error inesperado — {exc}")

    return registros, errores


# ── Servicio principal de importación ─────────────────────────────────────────

def importar_topologia(
    db:               Session,
    tenant_id:        int,
    empresa_id:       int,
    anio_declaracion: int,
    contenido_b2:     Optional[bytes] = None,
    contenido_b21:    Optional[bytes] = None,
    contenido_a1:     Optional[bytes] = None,
    contenido_b1:     Optional[bytes] = None,
    contenido_b11:    Optional[bytes] = None,
    encoding:         str = "latin-1",
    utm_zone:         int = 30,
) -> Dict[str, Any]:

    resultado: Dict[str, Any] = {
        "cts_insertados":    0,
        "cts_actualizados":  0,
        "cts_errores":       0,
        "trfs_insertados":   0,
        "trfs_actualizados": 0,
        "trfs_errores":      0,
        "cups_insertados":   0,
        "cups_actualizados": 0,
        "cups_errores":      0,
        "lineas_insertadas":   0,
        "lineas_actualizadas": 0,
        "lineas_errores":      0,
        "tramos_insertados":   0,
        "tramos_actualizados": 0,
        "tramos_errores":      0,
        "ficheros": [],
    }

    # ── B2 — CTs ──────────────────────────────────────────────────────────────
    if contenido_b2:
        registros, errores = parsear_b2(contenido_b2, encoding=encoding, utm_zone=utm_zone)
        resultado["cts_errores"] += len(errores)
        for reg in registros:
            try:
                accion = _upsert_ct(db, tenant_id, empresa_id, anio_declaracion, reg)
                if accion == "insertado":
                    resultado["cts_insertados"] += 1
                else:
                    resultado["cts_actualizados"] += 1
            except Exception:
                db.rollback()
                resultado["cts_errores"] += 1
        db.commit()
        resultado["ficheros"].append("B2")

    # ── B21 — Transformadores ─────────────────────────────────────────────────
    if contenido_b21:
        registros, errores = _parsear_b21(contenido_b21, encoding=encoding)
        resultado["trfs_errores"] += len(errores)
        for reg in registros:
            try:
                accion = _upsert_transformador(db, tenant_id, empresa_id, reg)
                if accion == "insertado":
                    resultado["trfs_insertados"] += 1
                else:
                    resultado["trfs_actualizados"] += 1
            except Exception:
                db.rollback()
                resultado["trfs_errores"] += 1
        db.commit()
        resultado["ficheros"].append("B21")

    # ── A1 — CUPS ─────────────────────────────────────────────────────────────
    if contenido_a1:
        registros, errores = parsear_a1(contenido_a1, encoding=encoding, utm_zone=utm_zone)
        resultado["cups_errores"] += len(errores)
        for reg in registros:
            try:
                accion = _upsert_cups(db, tenant_id, empresa_id, anio_declaracion, reg)
                if accion == "insertado":
                    resultado["cups_insertados"] += 1
                else:
                    resultado["cups_actualizados"] += 1
            except Exception:
                db.rollback()
                resultado["cups_errores"] += 1
        db.commit()
        resultado["ficheros"].append("A1")

    # ── B1 — Líneas ───────────────────────────────────────────────────────────
    if contenido_b1:
        texto = contenido_b1.decode(encoding, errors="replace")
        for reg in parsear_b1(texto):
            try:
                accion = _upsert_linea(db, tenant_id, empresa_id, anio_declaracion, reg)
                if accion == "insertado":
                    resultado["lineas_insertadas"] += 1
                elif accion == "actualizado":
                    resultado["lineas_actualizadas"] += 1
                else:
                    resultado["lineas_errores"] += 1
            except Exception:
                db.rollback()
                resultado["lineas_errores"] += 1
        db.commit()
        resultado["ficheros"].append("B1")

    # ── B11 — Tramos GIS ──────────────────────────────────────────────────────
    if contenido_b11:
        texto = contenido_b11.decode(encoding, errors="replace")
        for reg in parsear_b11(texto):
            try:
                accion = _upsert_tramo(db, tenant_id, empresa_id, anio_declaracion, reg)
                if accion == "insertado":
                    resultado["tramos_insertados"] += 1
                elif accion == "actualizado":
                    resultado["tramos_actualizados"] += 1
                else:
                    resultado["tramos_errores"] += 1
            except Exception:
                db.rollback()
                resultado["tramos_errores"] += 1
        db.commit()
        resultado["ficheros"].append("B11")

    return resultado


# ── Consultas para el mapa ────────────────────────────────────────────────────

def list_cts_mapa(
    db: Session,
    tenant_id: int,
    empresa_id: int,
) -> List[CtInventario]:
    return (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
            CtInventario.lat.isnot(None),
            CtInventario.lon.isnot(None),
        )
        .order_by(CtInventario.nombre)
        .all()
    )


def list_cups_mapa(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    id_ct: Optional[str] = None,
) -> List[CupsTopologia]:
    q = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
            CupsTopologia.lat.isnot(None),
            CupsTopologia.lon.isnot(None),
        )
    )
    if id_ct is not None:
        q = q.filter(CupsTopologia.id_ct == id_ct)
    return q.order_by(CupsTopologia.cups).all()


def list_cts(
    db: Session,
    tenant_id: int,
    empresa_id: int,
) -> List[CtInventario]:
    return (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
        )
        .order_by(CtInventario.nombre)
        .all()
    )


def list_tramos_mapa(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    id_linea: Optional[str] = None,
) -> List[LineaTramo]:
    """Devuelve segmentos GIS con coordenadas válidas para pintar la red en el mapa."""
    q = (
        db.query(LineaTramo)
        .filter(
            LineaTramo.tenant_id  == tenant_id,
            LineaTramo.empresa_id == empresa_id,
            LineaTramo.lat_ini.isnot(None),
            LineaTramo.lon_ini.isnot(None),
            LineaTramo.lat_fin.isnot(None),
            LineaTramo.lon_fin.isnot(None),
        )
    )
    if id_linea is not None:
        q = q.filter(LineaTramo.id_linea == id_linea)
    return q.order_by(LineaTramo.id_linea, LineaTramo.orden).all()
