# app/topologia/services.py
# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false

from __future__ import annotations

import collections
import math
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

    obj.id_ct       = registro["id_ct"]
    obj.cini        = registro.get("cini")
    obj.nombre      = registro.get("nombre") or registro["id_ct"]
    obj.codigo_ccuu = registro.get("codigo_ccuu")
    obj.nudo_alta   = registro.get("nudo_alta")
    obj.nudo_baja   = registro.get("nudo_baja")
    obj.tension_kv              = registro.get("tension_kv")
    obj.tension_construccion_kv = registro.get("tension_construccion_kv")
    obj.potencia_kva            = registro.get("potencia_kva")
    obj.utm_x         = registro.get("utm_x")
    obj.utm_y         = registro.get("utm_y")
    obj.lat           = registro.get("lat")
    obj.lon           = registro.get("lon")
    obj.municipio_ine = registro.get("municipio_ine")
    obj.provincia     = registro.get("provincia")
    obj.ccaa          = registro.get("ccaa")
    obj.zona          = registro.get("zona")
    obj.estado         = registro.get("estado")
    obj.modelo         = registro.get("modelo")
    obj.punto_frontera = registro.get("punto_frontera")
    obj.fecha_aps  = registro.get("fecha_aps")
    obj.causa_baja = registro.get("causa_baja")
    obj.fecha_baja = registro.get("fecha_baja")
    obj.fecha_ip   = registro.get("fecha_ip")
    obj.tipo_inversion          = registro.get("tipo_inversion")
    obj.financiado              = registro.get("financiado")
    obj.im_tramites             = registro.get("im_tramites")
    obj.im_construccion         = registro.get("im_construccion")
    obj.im_trabajos             = registro.get("im_trabajos")
    obj.subvenciones_europeas   = registro.get("subvenciones_europeas")
    obj.subvenciones_nacionales = registro.get("subvenciones_nacionales")
    obj.subvenciones_prtr       = registro.get("subvenciones_prtr")
    obj.valor_auditado          = registro.get("valor_auditado")
    obj.cuenta                  = registro.get("cuenta")
    obj.motivacion              = registro.get("motivacion")
    obj.avifauna                = registro.get("avifauna")
    obj.identificador_baja      = registro.get("identificador_baja")
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

    obj.cups      = registro["cups"]
    obj.id_ct     = registro.get("id_ct")
    obj.id_salida = registro.get("id_salida")
    obj.cnae      = registro.get("cnae")
    obj.tarifa    = registro.get("tarifa")
    obj.utm_x     = registro.get("utm_x")
    obj.utm_y     = registro.get("utm_y")
    obj.lat       = registro.get("lat")
    obj.lon       = registro.get("lon")
    obj.municipio = registro.get("municipio")
    obj.provincia = registro.get("provincia")
    obj.zona      = registro.get("zona")
    obj.conexion  = registro.get("conexion")
    obj.tension_kv              = registro.get("tension_kv")
    obj.estado_contrato         = registro.get("estado_contrato")
    obj.potencia_contratada_kw  = registro.get("potencia_contratada_kw")
    obj.potencia_adscrita_kw    = registro.get("potencia_adscrita_kw")
    obj.energia_activa_kwh      = registro.get("energia_activa_kwh")
    obj.energia_reactiva_kvarh  = registro.get("energia_reactiva_kvarh")
    obj.autoconsumo             = registro.get("autoconsumo")
    obj.cini_contador           = registro.get("cini_contador")
    obj.fecha_alta              = registro.get("fecha_alta")
    obj.lecturas                = registro.get("lecturas")
    obj.baja_suministro         = registro.get("baja_suministro")
    obj.cambio_titularidad      = registro.get("cambio_titularidad")
    obj.facturas_estimadas      = registro.get("facturas_estimadas")
    obj.facturas_total          = registro.get("facturas_total")
    obj.cau                     = registro.get("cau")
    obj.cod_auto                = registro.get("cod_auto")
    obj.cod_generacion_auto     = registro.get("cod_generacion_auto")
    obj.conexion_autoconsumo    = registro.get("conexion_autoconsumo")
    obj.energia_autoconsumida_kwh = registro.get("energia_autoconsumida_kwh")
    obj.energia_excedentaria_kwh  = registro.get("energia_excedentaria_kwh")
    # Nota: no tocamos 'fase' al reimportar — es asignación manual
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

    obj.id_tramo    = registro["id_tramo"]
    obj.cini        = registro.get("cini")
    obj.codigo_ccuu = registro.get("codigo_ccuu")
    obj.nudo_inicio   = registro.get("nudo_inicio")
    obj.nudo_fin      = registro.get("nudo_fin")
    obj.ccaa_1        = registro.get("ccaa_1")
    obj.nivel_tension = registro.get("nivel_tension")
    obj.propiedad               = registro.get("propiedad")
    obj.tension_kv              = registro.get("tension_kv")
    obj.tension_construccion_kv = registro.get("tension_construccion_kv")
    obj.longitud_km             = registro.get("longitud_km")
    obj.resistencia_ohm         = registro.get("resistencia_ohm")
    obj.reactancia_ohm          = registro.get("reactancia_ohm")
    obj.intensidad_a            = registro.get("intensidad_a")
    obj.estado         = registro.get("estado")
    obj.punto_frontera = registro.get("punto_frontera")
    obj.modelo         = registro.get("modelo")
    obj.operacion      = registro.get("operacion")
    obj.fecha_aps  = registro.get("fecha_aps")
    obj.causa_baja = registro.get("causa_baja")
    obj.fecha_baja = registro.get("fecha_baja")
    obj.fecha_ip   = registro.get("fecha_ip")
    obj.tipo_inversion          = registro.get("tipo_inversion")
    obj.motivacion              = registro.get("motivacion")
    obj.im_tramites             = registro.get("im_tramites")
    obj.im_construccion         = registro.get("im_construccion")
    obj.im_trabajos             = registro.get("im_trabajos")
    obj.valor_auditado          = registro.get("valor_auditado")
    obj.financiado              = registro.get("financiado")
    obj.subvenciones_europeas   = registro.get("subvenciones_europeas")
    obj.subvenciones_nacionales = registro.get("subvenciones_nacionales")
    obj.subvenciones_prtr       = registro.get("subvenciones_prtr")
    obj.cuenta                  = registro.get("cuenta")
    obj.avifauna                = registro.get("avifauna")
    obj.identificador_baja      = registro.get("identificador_baja")
    # No tocar id_ct ni metodo_asignacion_ct al importar — se calculan por separado
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

    obj.id_tramo  = registro["id_tramo"]
    obj.id_linea  = registro.get("id_linea") or ""
    obj.orden     = registro.get("orden")
    obj.num_tramo = registro.get("num_tramo")
    obj.utm_x_ini = registro.get("utm_x_ini")
    obj.utm_y_ini = registro.get("utm_y_ini")
    obj.utm_x_fin = registro.get("utm_x_fin")
    obj.utm_y_fin = registro.get("utm_y_fin")
    obj.lat_ini   = registro.get("lat_ini")
    obj.lon_ini   = registro.get("lon_ini")
    obj.lat_fin   = registro.get("lat_fin")
    obj.lon_fin   = registro.get("lon_fin")
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


# ── Algoritmo BFS + proximidad geográfica ─────────────────────────────────────

MAX_DIST_M = 500  # metros — umbral máximo para asignación por proximidad


def calcular_asociacion_ct(
    db: Session,
    tenant_id: int,
    empresa_id: int,
) -> Dict[str, Any]:
    """
    Calcula y persiste la asociación CT para todas las líneas y CUPS
    de una empresa. No sobreescribe asignaciones manuales (metodo='manual').
    Devuelve un resumen con contadores.
    """
    cts = (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
        )
        .all()
    )
    lineas = (
        db.query(LineaInventario)
        .filter(
            LineaInventario.tenant_id  == tenant_id,
            LineaInventario.empresa_id == empresa_id,
        )
        .all()
    )
    tramos_primeros = (
        db.query(LineaTramo.id_linea, LineaTramo.utm_x_ini, LineaTramo.utm_y_ini)
        .filter(
            LineaTramo.tenant_id  == tenant_id,
            LineaTramo.empresa_id == empresa_id,
            LineaTramo.orden      == 1,
            LineaTramo.utm_x_ini.isnot(None),
            LineaTramo.utm_y_ini.isnot(None),
        )
        .all()
    )
    linea_coords: Dict[str, Tuple[float, float]] = {
        r.id_linea: (r.utm_x_ini, r.utm_y_ini) for r in tramos_primeros
    }

    nudo_a_lineas_ini: Dict[str, List[LineaInventario]] = collections.defaultdict(list)
    nudo_a_lineas_fin: Dict[str, List[LineaInventario]] = collections.defaultdict(list)
    for linea in lineas:
        if linea.nudo_inicio:
            nudo_a_lineas_ini[linea.nudo_inicio].append(linea)
        if linea.nudo_fin:
            nudo_a_lineas_fin[linea.nudo_fin].append(linea)

    # PASO 1 — BFS bidireccional
    linea_a_ct: Dict[str, str] = {}
    metodo:     Dict[str, str] = {}

    for ct in cts:
        for linea in nudo_a_lineas_fin.get(ct.nudo_alta or "", []):
            if linea.id_tramo not in linea_a_ct:
                linea_a_ct[linea.id_tramo] = ct.id_ct
                metodo[linea.id_tramo]     = "bfs"

        if not ct.nudo_baja:
            continue
        visitados: set = set()
        cola = [ct.nudo_baja]
        while cola:
            nudo = cola.pop(0)
            if nudo in visitados:
                continue
            visitados.add(nudo)
            for linea in nudo_a_lineas_ini.get(nudo, []):
                if linea.id_tramo not in linea_a_ct:
                    linea_a_ct[linea.id_tramo] = ct.id_ct
                    metodo[linea.id_tramo]     = "bfs"
                    if linea.nudo_fin and linea.nudo_fin not in visitados:
                        cola.append(linea.nudo_fin)

    # PASO 2 — Proximidad geográfica para BT sin asociar
    ct_coords: Dict[str, Tuple[float, float]] = {}
    for ct in cts:
        lineas_ct = [
            linea_coords[l_id]
            for l_id, ct_id in linea_a_ct.items()
            if ct_id == ct.id_ct and l_id in linea_coords
        ]
        if lineas_ct:
            ct_coords[ct.id_ct] = (
                sum(c[0] for c in lineas_ct) / len(lineas_ct),
                sum(c[1] for c in lineas_ct) / len(lineas_ct),
            )

    bt_sin = [
        linea for linea in lineas
        if linea.id_tramo not in linea_a_ct
        and ("BTV" in linea.id_tramo or "LBT" in linea.id_tramo)
        and linea.id_tramo in linea_coords
    ]
    for linea in bt_sin:
        lx, ly = linea_coords[linea.id_tramo]
        mejor_ct:   Optional[str] = None
        mejor_dist: float         = MAX_DIST_M
        for id_ct, (cx, cy) in ct_coords.items():
            dist = math.sqrt((lx - cx) ** 2 + (ly - cy) ** 2)
            if dist < mejor_dist:
                mejor_dist = dist
                mejor_ct   = id_ct
        if mejor_ct:
            linea_a_ct[linea.id_tramo] = mejor_ct
            metodo[linea.id_tramo]     = "proximidad"

    # Persistir asociación en linea_inventario — no sobreescribir manuales
    lineas_bfs      = 0
    lineas_prox     = 0
    lineas_sin_asoc = 0
    for linea in lineas:
        if linea.metodo_asignacion_ct == "manual":
            continue
        id_ct_calc  = linea_a_ct.get(linea.id_tramo)
        metodo_calc = metodo.get(linea.id_tramo)
        if id_ct_calc:
            linea.id_ct                = id_ct_calc
            linea.metodo_asignacion_ct = metodo_calc
            linea.updated_at           = _now()
            if metodo_calc == "bfs":
                lineas_bfs += 1
            else:
                lineas_prox += 1
        else:
            lineas_sin_asoc += 1

    db.flush()

    # PASO 3 — CUPS → CT via nudo → línea
    cups_lista = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
        )
        .all()
    )
    cups_asignados = 0
    cups_sin_asoc  = 0
    for cups in cups_lista:
        if cups.metodo_asignacion_ct == "manual":
            continue
        nudo = cups.id_ct
        if not nudo:
            cups_sin_asoc += 1
            continue
        lineas_del_nudo = nudo_a_lineas_fin.get(nudo, [])
        id_ct_cups = None
        for linea in lineas_del_nudo:
            id_ct_cups = linea_a_ct.get(linea.id_tramo)
            if id_ct_cups:
                break
        if id_ct_cups:
            cups.id_ct_asignado       = id_ct_cups
            cups.metodo_asignacion_ct = "nudo_linea"
            cups.updated_at           = _now()
            cups_asignados += 1
        else:
            cups_sin_asoc += 1

    db.commit()
    return {
        "lineas_bfs":        lineas_bfs,
        "lineas_proximidad": lineas_prox,
        "lineas_sin_asoc":   lineas_sin_asoc,
        "lineas_total":      len(lineas),
        "cups_asignados":    cups_asignados,
        "cups_sin_asoc":     cups_sin_asoc,
        "cups_total":        len(cups_lista),
    }


# ── Reasignación manual — CT de línea ─────────────────────────────────────────

def reasignar_ct_linea(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    id_tramo: str,
    id_ct_nuevo: Optional[str],
) -> LineaInventario:
    """Reasigna manualmente el CT de una línea. None limpia la asignación."""
    linea = (
        db.query(LineaInventario)
        .filter(
            LineaInventario.tenant_id  == tenant_id,
            LineaInventario.empresa_id == empresa_id,
            LineaInventario.id_tramo   == id_tramo,
        )
        .first()
    )
    if linea is None:
        raise ValueError(f"Línea {id_tramo} no encontrada")
    linea.id_ct                = id_ct_nuevo or None
    linea.metodo_asignacion_ct = "manual" if id_ct_nuevo else None
    linea.updated_at           = _now()
    db.commit()
    db.refresh(linea)
    return linea


# ── Reasignación manual — CT de CUPS ─────────────────────────────────────────

def reasignar_ct_cups(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    cups: str,
    id_ct_nuevo: Optional[str],
) -> CupsTopologia:
    """Reasigna manualmente el CT de un CUPS. None limpia la asignación."""
    obj = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
            CupsTopologia.cups       == cups,
        )
        .first()
    )
    if obj is None:
        raise ValueError(f"CUPS {cups} no encontrado")
    obj.id_ct_asignado       = id_ct_nuevo or None
    obj.metodo_asignacion_ct = "manual" if id_ct_nuevo else None
    obj.updated_at           = _now()
    db.commit()
    db.refresh(obj)
    return obj


# ── Reasignación manual — fase de CUPS ───────────────────────────────────────

def reasignar_fase_cups(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    cups: str,
    fase_nueva: Optional[str],
) -> CupsTopologia:
    """
    Asigna manualmente la fase del CT (R/S/T/RST) a un CUPS.
    Enviar fase=None o fase="" para limpiar.
    Valores válidos: 'R', 'S', 'T', 'RST'.
    """
    FASES_VALIDAS = {"R", "S", "T", "RST"}
    if fase_nueva and fase_nueva not in FASES_VALIDAS:
        raise ValueError(f"Fase '{fase_nueva}' no válida. Use: R, S, T o RST")

    obj = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
            CupsTopologia.cups       == cups,
        )
        .first()
    )
    if obj is None:
        raise ValueError(f"CUPS {cups} no encontrado")
    obj.fase       = fase_nueva or None
    obj.updated_at = _now()
    db.commit()
    db.refresh(obj)
    return obj


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
        "cts_insertados":      0,
        "cts_actualizados":    0,
        "cts_errores":         0,
        "trfs_insertados":     0,
        "trfs_actualizados":   0,
        "trfs_errores":        0,
        "cups_insertados":     0,
        "cups_actualizados":   0,
        "cups_errores":        0,
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

    # Solo lanza el cálculo si cambió la topología
    if contenido_b1 or contenido_b2 or contenido_b11:
        try:
            calcular_asociacion_ct(db, tenant_id, empresa_id)
        except Exception:
            pass

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
        q = q.filter(CupsTopologia.id_ct_asignado == id_ct)
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


# ── Tabla líneas ──────────────────────────────────────────────────────────────

def list_lineas_tabla(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    id_ct: Optional[str] = None,
    sin_ct: bool = False,
    metodo: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
) -> Tuple[List[LineaInventario], int]:
    q = (
        db.query(LineaInventario)
        .filter(
            LineaInventario.tenant_id  == tenant_id,
            LineaInventario.empresa_id == empresa_id,
        )
    )
    if id_ct:
        q = q.filter(LineaInventario.id_ct == id_ct)
    if sin_ct:
        q = q.filter(LineaInventario.id_ct.is_(None))
    if metodo:
        q = q.filter(LineaInventario.metodo_asignacion_ct == metodo)
    total  = q.count()
    lineas = q.order_by(LineaInventario.id_tramo).offset(offset).limit(limit).all()
    return lineas, total


# ── Tabla CUPS ────────────────────────────────────────────────────────────────

def list_cups_tabla(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    id_ct: Optional[str] = None,
    sin_ct: bool = False,
    metodo: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
) -> Tuple[List[CupsTopologia], int]:
    q = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
        )
    )
    if id_ct:
        q = q.filter(CupsTopologia.id_ct_asignado == id_ct)
    if sin_ct:
        q = q.filter(CupsTopologia.id_ct_asignado.is_(None))
    if metodo:
        q = q.filter(CupsTopologia.metodo_asignacion_ct == metodo)
    total = q.count()
    cups  = q.order_by(CupsTopologia.cups).offset(offset).limit(limit).all()
    return cups, total
