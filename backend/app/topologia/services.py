# app/topologia/services.py
# pyright: reportMissingImports=false
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.topologia.models import CtInventario, CtTransformador, CupsTopologia
from app.topologia.parsers.parser_b2 import parsear_b2
from app.topologia.parsers.parser_a1 import parsear_a1


# ── Helpers internos ──────────────────────────────────────────────────────────

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
    """
    Inserta o actualiza un CT en ct_inventario.
    Devuelve 'insertado' | 'actualizado' | 'error'.
    """
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
            tenant_id        = tenant_id,
            empresa_id       = empresa_id,
            created_at       = _now(),
            updated_at       = _now(),
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


# ── Upsert CUPS topología (A1) ────────────────────────────────────────────────

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
    obj.id_ct                  = registro.get("id_ct")       # None en fase 1
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


# ── Parsers B21 (inline — fichero pequeño sin parser dedicado) ────────────────

def _parsear_b21(contenido: bytes, encoding: str = "latin-1") -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parsea el fichero B21 (máquinas en CT).

    Campos (índice 0-based):
      0 → ID_CT
      1 → ID_TRANSFORMADOR
      2 → CINI
      3 → POTENCIA_KVA   (coma decimal)
      4 → ANIO_FABRICACION
      5 → EN_OPERACION   (1=servicio, 0=reserva)
    """
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
            id_ct = campos[0].strip()
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
    db: Session,
    tenant_id: int,
    empresa_id: int,
    anio_declaracion: int,
    contenido_b2:  Optional[bytes],
    contenido_b21: Optional[bytes],
    contenido_a1:  Optional[bytes],
    encoding: str = "latin-1",
    utm_zone: int = 30,
) -> Dict[str, Any]:
    """
    Importa los ficheros CNMC 8/2021 (B2, B21, A1) para una empresa.
    Actualiza registro a registro sin borrar datos existentes.

    Devuelve un dict con contadores de insertados / actualizados / errores
    por cada fichero, listo para serializar como ImportarTopologiaResponse.
    """
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
        "ficheros":          [],
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

    return resultado


# ── Consultas para el mapa ────────────────────────────────────────────────────

def list_cts_mapa(
    db: Session,
    tenant_id: int,
    empresa_id: int,
) -> List[CtInventario]:
    """Devuelve todos los CTs con coordenadas válidas para pintar en el mapa."""
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
    """
    Devuelve CUPS con coordenadas válidas.
    Si se pasa id_ct filtra por ese CT. Si no, devuelve todos.
    """
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
    """Devuelve todos los CTs de una empresa (para listados y filtros)."""
    return (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
        )
        .order_by(CtInventario.nombre)
        .all()
    )
