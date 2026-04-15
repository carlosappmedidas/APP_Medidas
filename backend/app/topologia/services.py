# app/topologia/services.py
# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportAssignmentType=false

from __future__ import annotations

import collections
import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.topologia.models import (
    CtCelda,
    CtInventario,
    CtTransformador,
    CupsTopologia,
    LineaInventario,
    LineaTramo,
)
from app.topologia.parsers.parser_b2 import parsear_b2
from app.topologia.parsers.parser_a1 import parsear_a1
from app.topologia.parsers.parser_b1_b11 import parsear_b1, parsear_b11
from app.topologia.parsers.parser_b22 import parsear_b22
from app.topologia.cini_decoder import decodificar_cini_i28


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en metros entre dos puntos GPS."""
    R = 6_371_000
    d_lat = (lat2 - lat1) * math.pi / 180
    d_lon = (lon2 - lon1) * math.pi / 180
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180)
         * math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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


# ── Upsert CT celda (B22) ─────────────────────────────────────────────────────

def _upsert_celda(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    registro: Dict[str, Any],
) -> str:
    obj = (
        db.query(CtCelda)
        .filter(
            CtCelda.tenant_id  == tenant_id,
            CtCelda.empresa_id == empresa_id,
            CtCelda.id_celda   == registro["id_celda"],
        )
        .first()
    )
    if obj is None:
        obj = CtCelda(
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
    obj.id_celda         = registro["id_celda"]
    obj.id_transformador = registro.get("id_transformador")
    obj.cini             = registro.get("cini")
    obj.posicion         = registro.get("posicion")
    obj.en_servicio      = registro.get("en_servicio")
    obj.anio_instalacion = registro.get("anio_instalacion")
    # Decodificar CINI I28 en las 8 posiciones
    decoded = decodificar_cini_i28(registro.get("cini"))
    obj.cini_p1_tipo_instalacion = decoded["cini_p1_tipo_instalacion"]
    obj.cini_p2_actividad        = decoded["cini_p2_actividad"]
    obj.cini_p3_tipo_equipo      = decoded["cini_p3_tipo_equipo"]
    obj.cini_p4_tension_rango    = decoded["cini_p4_tension_rango"]
    obj.cini_p5_tipo_posicion    = decoded["cini_p5_tipo_posicion"]
    obj.cini_p6_ubicacion        = decoded["cini_p6_ubicacion"]
    obj.cini_p7_funcion          = decoded["cini_p7_funcion"]
    obj.cini_p8_tension_nominal  = decoded["cini_p8_tension_nominal"]

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
    obj.ccaa_2 = registro.get("ccaa_2")
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


# ── Constantes del algoritmo ──────────────────────────────────────────────────

RADIO_SALIDAS_CT_M = 5   # metros — radio para detección de salidas directas por GPS
MAX_DIST_M         = 50  # metros — radio máximo proximidad general (UTM)


# ── Helpers BT / MT ───────────────────────────────────────────────────────────

def _es_bt(linea: LineaInventario) -> bool:
    """True si la línea es de baja tensión (≤1 kV)."""
    if linea.tension_kv is not None:
        return float(linea.tension_kv) <= 1.0
    id_t = linea.id_tramo or ""
    return "BTV" in id_t or "LBT" in id_t


def _es_mt(linea: LineaInventario) -> bool:
    """True si la línea es de media tensión (>1 kV)."""
    if linea.tension_kv is not None:
        return float(linea.tension_kv) > 1.0
    id_t = linea.id_tramo or ""
    return "ATV" in id_t or "ATR" in id_t


# ── BFS solo BT ──────────────────────────────────────────────────────────────

def _bfs_bt(
    nudos_arranque: List[str],
    nudo_a_lineas_ini: Dict[str, List[LineaInventario]],
    nudo_a_lineas_fin: Dict[str, List[LineaInventario]],
    id_ct: str,
    linea_a_ct: Dict[str, str],
    metodo: Dict[str, str],
) -> None:
    """
    BFS bidireccional desde los nudos de arranque.
    SOLO propaga por líneas BT (tension_kv ≤ 1 kV).
    No toca nunca líneas MT — nunca sobreescribe asignaciones existentes.
    """
    visitados: set = set()
    cola = list(nudos_arranque)

    while cola:
        nudo = cola.pop(0)
        if nudo in visitados:
            continue
        visitados.add(nudo)

        for linea in nudo_a_lineas_ini.get(nudo, []):
            if not _es_bt(linea):
                continue
            if linea.id_tramo not in linea_a_ct:
                linea_a_ct[linea.id_tramo] = id_ct
                metodo[linea.id_tramo]     = "bfs"
            if linea.nudo_fin and linea.nudo_fin not in visitados:
                cola.append(linea.nudo_fin)

        for linea in nudo_a_lineas_fin.get(nudo, []):
            if not _es_bt(linea):
                continue
            if linea.id_tramo not in linea_a_ct:
                linea_a_ct[linea.id_tramo] = id_ct
                metodo[linea.id_tramo]     = "bfs"
            if linea.nudo_inicio and linea.nudo_inicio not in visitados:
                cola.append(linea.nudo_inicio)


# ── BFS solo MT ──────────────────────────────────────────────────────────────

def _bfs_mt(
    nudos_arranque: List[str],
    nudo_a_lineas_ini: Dict[str, List[LineaInventario]],
    nudo_a_lineas_fin: Dict[str, List[LineaInventario]],
    id_ct: str,
    linea_a_ct_mt: Dict[str, str],
    metodo_mt: Dict[str, str],
    nudos_ct: set,
) -> None:
    """
    BFS desde nudo_alta del CT por la red MT.
    Se detiene al llegar al nudo_alta de otro CT (frontera de red).
    No sobreescribe asignaciones existentes.
    """
    visitados: set = set()
    cola = list(nudos_arranque)

    while cola:
        nudo = cola.pop(0)
        if nudo in visitados:
            continue
        visitados.add(nudo)

        for linea in nudo_a_lineas_ini.get(nudo, []):
            if not _es_mt(linea):
                continue
            if linea.id_tramo not in linea_a_ct_mt:
                linea_a_ct_mt[linea.id_tramo] = id_ct
                metodo_mt[linea.id_tramo]     = "nudo_alta"
            # Propagar solo si el nudo_fin no es frontera de otro CT
            if linea.nudo_fin and linea.nudo_fin not in visitados:
                if linea.nudo_fin not in nudos_ct or linea.nudo_fin in nudos_arranque:
                    cola.append(linea.nudo_fin)

        for linea in nudo_a_lineas_fin.get(nudo, []):
            if not _es_mt(linea):
                continue
            if linea.id_tramo not in linea_a_ct_mt:
                linea_a_ct_mt[linea.id_tramo] = id_ct
                metodo_mt[linea.id_tramo]     = "nudo_alta"
            if linea.nudo_inicio and linea.nudo_inicio not in visitados:
                if linea.nudo_inicio not in nudos_ct or linea.nudo_inicio in nudos_arranque:
                    cola.append(linea.nudo_inicio)


# ── Detección de salidas del CT ───────────────────────────────────────────────

class _TramoGPS:
    __slots__ = ("id_linea", "lat_ini", "lon_ini", "nudo_inicio", "nudo_fin")

    def __init__(
        self,
        id_linea: str,
        lat_ini: float,
        lon_ini: float,
        nudo_inicio: Optional[str],
        nudo_fin: Optional[str],
    ) -> None:
        self.id_linea    = id_linea
        self.lat_ini     = lat_ini
        self.lon_ini     = lon_ini
        self.nudo_inicio = nudo_inicio
        self.nudo_fin    = nudo_fin


def _detectar_salidas_bt(
    ct: CtInventario,
    tramos_gps: List[_TramoGPS],
    lineas_por_tramo: Dict[str, LineaInventario],
    linea_a_ct: Dict[str, str],
) -> List[str]:
    """
    Detecta salidas BT del CT para propagar el BFS cuando el nudo_baja
    no alcanzó ninguna línea BT.
    """
    if ct.lat is None or ct.lon is None:
        return []

    nudos_nivel1: List[str] = []
    for row in tramos_gps:
        if linea_a_ct.get(row.id_linea) != ct.id_ct:
            continue
        linea = lineas_por_tramo.get(row.id_linea)
        if linea is None or not _es_bt(linea):
            continue
        dist = _haversine_m(ct.lat, ct.lon, row.lat_ini, row.lon_ini)
        if dist > RADIO_SALIDAS_CT_M:
            continue
        if row.nudo_inicio:
            nudos_nivel1.append(row.nudo_inicio)

    if nudos_nivel1:
        return list(set(nudos_nivel1))

    candidatas: List[_TramoGPS] = []
    for row in tramos_gps:
        if row.id_linea in linea_a_ct:
            continue
        linea = lineas_por_tramo.get(row.id_linea)
        if linea is None or not _es_bt(linea):
            continue
        dist = _haversine_m(ct.lat, ct.lon, row.lat_ini, row.lon_ini)
        if dist > RADIO_SALIDAS_CT_M:
            continue
        if linea.fecha_aps is None or linea.operacion != 1:
            continue
        candidatas.append(row)

    if not candidatas:
        return []

    nudo_fin_cands = {row.nudo_fin for row in candidatas if row.nudo_fin}
    salidas = [row for row in candidatas if row.nudo_inicio not in nudo_fin_cands]
    return [row.nudo_inicio for row in salidas if row.nudo_inicio]


# ── Algoritmo BT principal ────────────────────────────────────────────────────

def calcular_asociacion_ct(
    db: Session,
    tenant_id: int,
    empresa_id: int,
) -> Dict[str, Any]:
    """
    Calcula y persiste la asociación CT → línea BT y CT → CUPS BT.
    Las líneas MT y CUPS MT NO se tocan aquí — usar calcular_asociacion_ct_mt.
    No sobreescribe asignaciones manuales (metodo='manual').

    PASO 1 — BFS solo BT desde nudo_baja del CT.
    PASO 2 — Salidas BT detectadas por GPS (nudo+GPS o GPS puro).
    PASO 3 — BFS solo BT desde las salidas del PASO 2.
    PASO 4 — Proximidad general para líneas BT sin asignar (≤50m UTM).
    PASO 5 — CUPS BT: buscar en líneas BT que terminan en su nudo.
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

    lineas_por_tramo: Dict[str, LineaInventario] = {
        str(linea.id_tramo): linea for linea in lineas
    }

    tramos_utm = (
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
    linea_coords_utm: Dict[str, Tuple[float, float]] = {
        r.id_linea: (r.utm_x_ini, r.utm_y_ini) for r in tramos_utm
    }

    tramos_gps_rows = (
        db.query(
            LineaTramo.id_linea,
            LineaTramo.lat_ini,
            LineaTramo.lon_ini,
        )
        .filter(
            LineaTramo.tenant_id  == tenant_id,
            LineaTramo.empresa_id == empresa_id,
            LineaTramo.orden      == 1,
            LineaTramo.lat_ini.isnot(None),
            LineaTramo.lon_ini.isnot(None),
        )
        .all()
    )
    tramos_gps: List[_TramoGPS] = []
    for row in tramos_gps_rows:
        linea = lineas_por_tramo.get(row.id_linea)
        if linea is None or not _es_bt(linea):
            continue
        tramos_gps.append(_TramoGPS(
            id_linea    = row.id_linea,
            lat_ini     = row.lat_ini,
            lon_ini     = row.lon_ini,
            nudo_inicio = linea.nudo_inicio,
            nudo_fin    = linea.nudo_fin,
        ))

    nudo_a_lineas_ini: Dict[str, List[LineaInventario]] = collections.defaultdict(list)
    nudo_a_lineas_fin: Dict[str, List[LineaInventario]] = collections.defaultdict(list)
    for linea in lineas:
        if linea.nudo_inicio:
            nudo_a_lineas_ini[linea.nudo_inicio].append(linea)
        if linea.nudo_fin:
            nudo_a_lineas_fin[linea.nudo_fin].append(linea)

    linea_a_ct: Dict[str, str] = {}
    metodo:     Dict[str, str] = {}

    for ct in cts:
        # ── PASO 1: BFS solo BT desde nudo_baja ───────────────────────────────
        if ct.nudo_baja:
            _bfs_bt(
                [ct.nudo_baja],
                nudo_a_lineas_ini, nudo_a_lineas_fin,
                ct.id_ct, linea_a_ct, metodo,
            )

        # ── PASO 2: salidas BT por GPS ─────────────────────────────────────────
        nudos_salidas = _detectar_salidas_bt(
            ct, tramos_gps, lineas_por_tramo, linea_a_ct,
        )

        # ── PASO 3: BFS BT desde salidas GPS ──────────────────────────────────
        if nudos_salidas:
            _bfs_bt(
                nudos_salidas,
                nudo_a_lineas_ini, nudo_a_lineas_fin,
                ct.id_ct, linea_a_ct, metodo,
            )

    # ── PASO 4: proximidad general para BT sin asignar (≤ MAX_DIST_M UTM) ─────
    ct_coords: Dict[str, Tuple[float, float]] = {}
    for ct in cts:
        lineas_ct = [
            linea_coords_utm[l_id]
            for l_id, ct_id in linea_a_ct.items()
            if ct_id == ct.id_ct and l_id in linea_coords_utm
        ]
        if lineas_ct:
            ct_coords[ct.id_ct] = (
                sum(c[0] for c in lineas_ct) / len(lineas_ct),
                sum(c[1] for c in lineas_ct) / len(lineas_ct),
            )

    bt_sin = [
        linea for linea in lineas
        if linea.id_tramo not in linea_a_ct
        and _es_bt(linea)
        and linea.id_tramo in linea_coords_utm
    ]
    for linea in bt_sin:
        lx, ly = linea_coords_utm[linea.id_tramo]
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

    # Persistir BT — no sobreescribir manuales, no tocar MT
    lineas_bfs      = 0
    lineas_prox     = 0
    lineas_sin_asoc = 0
    for linea in lineas:
        if linea.metodo_asignacion_ct == "manual":
            continue
        if not _es_bt(linea):
            # MT las gestiona calcular_asociacion_ct_mt — no tocar
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

    # ── PASO 5: CUPS BT → CT via nudo → línea BT ──────────────────────────────
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
        # CUPS MT los gestiona calcular_asociacion_ct_mt
        if cups.tension_kv is not None and float(cups.tension_kv) > 1.0:
            continue
        nudo = cups.id_ct
        if not nudo:
            cups_sin_asoc += 1
            continue
        id_ct_cups = None
        for linea in nudo_a_lineas_fin.get(nudo, []):
            if not _es_bt(linea):
                continue
            id_ct_cups = linea_a_ct.get(linea.id_tramo)
            if id_ct_cups:
                break
        if not id_ct_cups:
            for linea in nudo_a_lineas_ini.get(nudo, []):
                if not _es_bt(linea):
                    continue
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


# ── Algoritmo MT ──────────────────────────────────────────────────────────────

def calcular_asociacion_ct_mt(
    db: Session,
    tenant_id: int,
    empresa_id: int,
) -> Dict[str, Any]:
    """
    Líneas MT: nunca se asignan a CT — se limpian las asignaciones automáticas previas.
    CUPS MT: se asignan al CT más cercano por distancia Haversine (GPS).
    No sobreescribe asignaciones manuales (metodo='manual').
    """
    cts = (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
            CtInventario.lat.isnot(None),
            CtInventario.lon.isnot(None),
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

    # ── PASO 1: Limpiar líneas MT con asignación automática previa ────────────
    lineas_mt_limpiadas = 0
    for linea in lineas:
        if not _es_mt(linea):
            continue
        if linea.metodo_asignacion_ct == "manual":
            continue
        if linea.id_ct is not None:
            linea.id_ct                = None
            linea.metodo_asignacion_ct = None
            linea.updated_at           = _now()
            lineas_mt_limpiadas += 1

    db.flush()

    # ── PASO 2: CUPS MT → CT por proximidad GPS (Haversine) ──────────────────
    cups_lista = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
        )
        .all()
    )
    cups_mt_asignados = 0
    cups_mt_sin_asoc  = 0
    for cups in cups_lista:
        if cups.metodo_asignacion_ct == "manual":
            continue
        if cups.tension_kv is None or float(cups.tension_kv) <= 1.0:
            continue
        if cups.lat is None or cups.lon is None:
            cups_mt_sin_asoc += 1
            continue

        mejor_ct:   Optional[str] = None
        mejor_dist: float         = float("inf")
        for ct in cts:
            dist = _haversine_m(cups.lat, cups.lon, ct.lat, ct.lon)
            if dist < mejor_dist:
                mejor_dist = dist
                mejor_ct   = ct.id_ct

        if mejor_ct:
            cups.id_ct_asignado       = mejor_ct
            cups.metodo_asignacion_ct = "proximidad_gps_mt"
            cups.updated_at           = _now()
            cups_mt_asignados += 1
        else:
            cups_mt_sin_asoc += 1

    db.commit()
    return {
        "lineas_mt_limpiadas": lineas_mt_limpiadas,
        "lineas_mt_total":     sum(1 for ln in lineas if _es_mt(ln)),
        "cups_mt_asignados":   cups_mt_asignados,
        "cups_mt_sin_asoc":    cups_mt_sin_asoc,
    }


# ── Reasignación manual — CT de línea ─────────────────────────────────────────

def reasignar_ct_linea(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    id_tramo: str,
    id_ct_nuevo: Optional[str],
) -> LineaInventario:
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

# ── Crear CT manual ───────────────────────────────────────────────────────────

def crear_ct(
    db: Session,
    tenant_id: int,
    empresa_id: int,
    datos: Dict[str, Any],
) -> CtInventario:
    """
    Crea un nuevo CT manualmente.
    Lanza ValueError si ya existe un CT con el mismo id_ct para esa empresa.
    """
    existente = (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
            CtInventario.id_ct      == datos["id_ct"],
        )
        .first()
    )
    if existente is not None:
        raise ValueError(f"Ya existe un CT con id_ct '{datos['id_ct']}' en esta empresa")

    obj = CtInventario(
        tenant_id  = tenant_id,
        empresa_id = empresa_id,
        created_at = _now(),
        updated_at = _now(),
    )
    obj.id_ct                   = datos["id_ct"]
    obj.nombre                  = datos["nombre"]
    obj.cini                    = datos.get("cini")
    obj.codigo_ccuu             = datos.get("codigo_ccuu")
    obj.nudo_alta               = datos.get("nudo_alta")
    obj.nudo_baja               = datos.get("nudo_baja")
    obj.tension_kv              = datos.get("tension_kv")
    obj.tension_construccion_kv = datos.get("tension_construccion_kv")
    obj.potencia_kva            = datos.get("potencia_kva")
    obj.lat                     = datos.get("lat")
    obj.lon                     = datos.get("lon")
    obj.municipio_ine           = datos.get("municipio_ine")
    obj.provincia               = datos.get("provincia")
    obj.ccaa                    = datos.get("ccaa")
    obj.zona                    = datos.get("zona")
    obj.propiedad               = datos.get("propiedad")
    obj.estado                  = datos.get("estado")
    obj.modelo                  = datos.get("modelo")
    obj.punto_frontera          = datos.get("punto_frontera")
    obj.fecha_aps               = datos.get("fecha_aps")
    obj.causa_baja              = datos.get("causa_baja")
    obj.fecha_baja              = datos.get("fecha_baja")
    obj.fecha_ip                = datos.get("fecha_ip")
    obj.tipo_inversion          = datos.get("tipo_inversion")
    obj.financiado              = datos.get("financiado")
    obj.im_tramites             = datos.get("im_tramites")
    obj.im_construccion         = datos.get("im_construccion")
    obj.im_trabajos             = datos.get("im_trabajos")
    obj.subvenciones_europeas   = datos.get("subvenciones_europeas")
    obj.subvenciones_nacionales = datos.get("subvenciones_nacionales")
    obj.subvenciones_prtr       = datos.get("subvenciones_prtr")
    obj.valor_auditado          = datos.get("valor_auditado")
    obj.cuenta                  = datos.get("cuenta")
    obj.motivacion              = datos.get("motivacion")
    obj.avifauna                = datos.get("avifauna")
    obj.identificador_baja      = datos.get("identificador_baja")

    db.add(obj)
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
    contenido_b22:    Optional[bytes] = None,
    contenido_a1:     Optional[bytes] = None,
    contenido_b1:     Optional[bytes] = None,
    contenido_b11:    Optional[bytes] = None,
    encoding:         str = "latin-1",
    utm_zone:         int = 30,
) -> Dict[str, Any]:

    resultado: Dict[str, Any] = {
        "cts_insertados":       0,
        "cts_actualizados":     0,
        "cts_errores":          0,
        "trfs_insertados":      0,
        "trfs_actualizados":    0,
        "trfs_errores":         0,
        "celdas_insertadas":    0,
        "celdas_actualizadas":  0,
        "celdas_errores":       0,
        "cups_insertados":      0,
        "cups_actualizados":    0,
        "cups_errores":         0,
        "lineas_insertadas":    0,
        "lineas_actualizadas":  0,
        "lineas_errores":       0,
        "tramos_insertados":    0,
        "tramos_actualizados":  0,
        "tramos_errores":       0,
        "ficheros": [],
    }

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

    if contenido_b22:
        registros, errores = parsear_b22(contenido_b22, encoding=encoding)
        resultado["celdas_errores"] += len(errores)
        for reg in registros:
            try:
                accion = _upsert_celda(db, tenant_id, empresa_id, reg)
                if accion == "insertado":
                    resultado["celdas_insertadas"] += 1
                else:
                    resultado["celdas_actualizadas"] += 1
            except Exception:
                db.rollback()
                resultado["celdas_errores"] += 1
        db.commit()
        resultado["ficheros"].append("B22")

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

    if contenido_b1 or contenido_b2 or contenido_b11:
        try:
            calcular_asociacion_ct(db, tenant_id, empresa_id)
        except Exception:
            pass
        try:
            calcular_asociacion_ct_mt(db, tenant_id, empresa_id)
        except Exception:
            pass

    return resultado


# ── Consultas ─────────────────────────────────────────────────────────────────

def list_cts_mapa(db: Session, tenant_id: int, empresa_id: int) -> List[CtInventario]:
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
    db: Session, tenant_id: int, empresa_id: int, id_ct: Optional[str] = None,
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


def list_cts(db: Session, tenant_id: int, empresa_id: int) -> List[CtInventario]:
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
    db: Session, tenant_id: int, empresa_id: int, id_linea: Optional[str] = None,
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


def list_lineas_tabla(
    db: Session, tenant_id: int, empresa_id: int,
    id_ct: Optional[str] = None, sin_ct: bool = False,
    metodo: Optional[str] = None, busqueda: Optional[str] = None,
    limit: int = 500, offset: int = 0,
) -> Tuple[List[LineaInventario], int]:
    q = (
        db.query(LineaInventario)
        .filter(
            LineaInventario.tenant_id  == tenant_id,
            LineaInventario.empresa_id == empresa_id,
        )
    )
    if busqueda:
        q = q.filter(LineaInventario.id_tramo.ilike(f"%{busqueda}%"))
    if id_ct:
        q = q.filter(LineaInventario.id_ct == id_ct)
    if sin_ct:
        q = q.filter(LineaInventario.id_ct.is_(None))
    if metodo:
        q = q.filter(LineaInventario.metodo_asignacion_ct == metodo)
    total  = q.count()
    lineas = q.order_by(LineaInventario.id_tramo).offset(offset).limit(limit).all()
    return lineas, total


def list_cups_tabla(
    db: Session, tenant_id: int, empresa_id: int,
    id_ct: Optional[str] = None, sin_ct: bool = False,
    metodo: Optional[str] = None, busqueda: Optional[str] = None,
    limit: int = 500, offset: int = 0,
) -> Tuple[List[CupsTopologia], int]:
    q = (
        db.query(CupsTopologia)
        .filter(
            CupsTopologia.tenant_id  == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
        )
    )
    if busqueda:
        q = q.filter(CupsTopologia.cups.ilike(f"%{busqueda}%"))
    if id_ct:
        q = q.filter(CupsTopologia.id_ct_asignado == id_ct)
    if sin_ct:
        q = q.filter(CupsTopologia.id_ct_asignado.is_(None))
    if metodo:
        q = q.filter(CupsTopologia.metodo_asignacion_ct == metodo)
    total = q.count()
    cups  = q.order_by(CupsTopologia.cups).offset(offset).limit(limit).all()
    return cups, total

def list_celdas_tabla(
    db: Session, tenant_id: int, empresa_id: int,
    id_ct: Optional[str] = None, busqueda: Optional[str] = None,
    limit: int = 500, offset: int = 0,
) -> Tuple[List[CtCelda], int]:
    """Devuelve celdas paginadas, opcionalmente filtradas por CT."""
    q = (
        db.query(CtCelda)
        .filter(
            CtCelda.tenant_id  == tenant_id,
            CtCelda.empresa_id == empresa_id,
        )
    )
    if busqueda:
        q = q.join(CtInventario, (CtInventario.id_ct == CtCelda.id_ct) & (CtInventario.tenant_id == CtCelda.tenant_id) & (CtInventario.empresa_id == CtCelda.empresa_id)).filter(CtInventario.nombre.ilike(f"%{busqueda}%"))
    if id_ct:
        q = q.filter(CtCelda.id_ct == id_ct)
    total  = q.count()
    celdas = q.order_by(CtCelda.id_ct, CtCelda.id_celda).offset(offset).limit(limit).all()
    return celdas, total


def list_celdas_ct(
    db: Session, tenant_id: int, empresa_id: int, id_ct: str,
) -> List[CtCelda]:
    """Devuelve todas las celdas de un CT ordenadas por posición e id."""
    return (
        db.query(CtCelda)
        .filter(
            CtCelda.tenant_id  == tenant_id,
            CtCelda.empresa_id == empresa_id,
            CtCelda.id_ct      == id_ct,
        )
        .order_by(CtCelda.posicion, CtCelda.id_celda)
        .all()
    )


def list_transformadores_ct(
    db: Session, tenant_id: int, empresa_id: int, id_ct: str,
) -> List[CtTransformador]:
    """Devuelve todos los transformadores de un CT."""
    return (
        db.query(CtTransformador)
        .filter(
            CtTransformador.tenant_id  == tenant_id,
            CtTransformador.empresa_id == empresa_id,
            CtTransformador.id_ct      == id_ct,
        )
        .order_by(CtTransformador.id_transformador)
        .all()
    )

def list_cts_tabla(
    db: Session, tenant_id: int, empresa_id: int,
    busqueda: Optional[str] = None, limit: int = 500, offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    """Devuelve CTs paginados con contadores de trafos, celdas y CUPS."""
    from sqlalchemy import func

    q = (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
        )
    )
    if busqueda:
        q = q.filter(CtInventario.nombre.ilike(f"%{busqueda}%"))
    total = q.count()
    cts   = q.order_by(CtInventario.nombre).offset(offset).limit(limit).all()

    # Contadores por CT
    trafos_count = dict(
        db.query(CtTransformador.id_ct, func.count())
        .filter(CtTransformador.tenant_id == tenant_id, CtTransformador.empresa_id == empresa_id)
        .group_by(CtTransformador.id_ct)
        .all()
    )
    celdas_count = dict(
        db.query(CtCelda.id_ct, func.count())
        .filter(CtCelda.tenant_id == tenant_id, CtCelda.empresa_id == empresa_id)
        .group_by(CtCelda.id_ct)
        .all()
    )
    cups_count = dict(
        db.query(CupsTopologia.id_ct_asignado, func.count())
        .filter(
            CupsTopologia.tenant_id == tenant_id,
            CupsTopologia.empresa_id == empresa_id,
            CupsTopologia.id_ct_asignado.isnot(None),
        )
        .group_by(CupsTopologia.id_ct_asignado)
        .all()
    )

    items = []
    for ct in cts:
        items.append({
            "id_ct":                  ct.id_ct,
            "nombre":                 ct.nombre,
            "cini":                   ct.cini,
            "codigo_ccuu":            ct.codigo_ccuu,
            "nudo_alta":              ct.nudo_alta,
            "nudo_baja":              ct.nudo_baja,
            "tension_kv":             float(ct.tension_kv) if ct.tension_kv is not None else None,
            "tension_construccion_kv": float(ct.tension_construccion_kv) if ct.tension_construccion_kv is not None else None,
            "potencia_kva":           float(ct.potencia_kva) if ct.potencia_kva is not None else None,
            "municipio_ine":          ct.municipio_ine,
            "provincia":              ct.provincia,
            "ccaa":                   ct.ccaa,
            "zona":                   ct.zona,
            "propiedad":              ct.propiedad,
            "estado":                 ct.estado,
            "modelo":                 ct.modelo,
            "punto_frontera":         ct.punto_frontera,
            "fecha_aps":              ct.fecha_aps,
            "causa_baja":             ct.causa_baja,
            "fecha_baja":             ct.fecha_baja,
            "fecha_ip":               ct.fecha_ip,
            "tipo_inversion":         ct.tipo_inversion,
            "financiado":             ct.financiado,
            "im_tramites":            ct.im_tramites,
            "im_construccion":        ct.im_construccion,
            "im_trabajos":            ct.im_trabajos,
            "subvenciones_europeas":  ct.subvenciones_europeas,
            "subvenciones_nacionales": ct.subvenciones_nacionales,
            "subvenciones_prtr":      ct.subvenciones_prtr,
            "valor_auditado":         ct.valor_auditado,
            "cuenta":                 ct.cuenta,
            "motivacion":             ct.motivacion,
            "avifauna":               ct.avifauna,
            "identificador_baja":     ct.identificador_baja,
            "num_trafos":             trafos_count.get(ct.id_ct, 0),
            "num_celdas":             celdas_count.get(ct.id_ct, 0),
            "num_cups":               cups_count.get(ct.id_ct, 0),
        })
    return items, total

def list_cts_mapa_baja(db: Session, tenant_id: int, empresa_id: int) -> List[CtInventario]:
    """CTs con fecha_baja IS NOT NULL y coordenadas GPS."""
    return (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tenant_id,
            CtInventario.empresa_id == empresa_id,
            CtInventario.lat.isnot(None),
            CtInventario.lon.isnot(None),
            CtInventario.fecha_baja.isnot(None),
        )
        .order_by(CtInventario.nombre)
        .all()
    )


def list_tramos_mapa_baja(
    db: Session, tenant_id: int, empresa_id: int,
) -> List[LineaTramo]:
    """Tramos GIS cuya línea tiene fecha_baja IS NOT NULL."""
    return (
        db.query(LineaTramo)
        .join(
            LineaInventario,
            (LineaInventario.id_tramo   == LineaTramo.id_linea) &
            (LineaInventario.tenant_id  == LineaTramo.tenant_id) &
            (LineaInventario.empresa_id == LineaTramo.empresa_id),
        )
        .filter(
            LineaTramo.tenant_id  == tenant_id,
            LineaTramo.empresa_id == empresa_id,
            LineaTramo.lat_ini.isnot(None),
            LineaTramo.lon_ini.isnot(None),
            LineaTramo.lat_fin.isnot(None),
            LineaTramo.lon_fin.isnot(None),
            LineaInventario.fecha_baja.isnot(None),
        )
        .order_by(LineaTramo.id_linea, LineaTramo.orden)
        .all()
    )

def list_tramos_tabla(
    db: Session, tenant_id: int, empresa_id: int,
    id_ct: Optional[str] = None, busqueda: Optional[str] = None,
    limit: int = 500, offset: int = 0,
) -> Tuple[List[Dict[str, Any]], int]:
    """Devuelve tramos GIS paginados con datos de LineaInventario via join."""
    q = (
        db.query(LineaTramo, LineaInventario)
        .outerjoin(
            LineaInventario,
            (LineaInventario.id_tramo   == LineaTramo.id_linea) &
            (LineaInventario.tenant_id  == LineaTramo.tenant_id) &
            (LineaInventario.empresa_id == LineaTramo.empresa_id),
        )
        .filter(
            LineaTramo.tenant_id  == tenant_id,
            LineaTramo.empresa_id == empresa_id,
        )
    )
    if busqueda:
        q = q.filter(LineaTramo.id_tramo.ilike(f"%{busqueda}%"))
    if id_ct:
        q = q.filter(LineaInventario.id_ct == id_ct)

    total = q.count()
    filas = q.order_by(LineaTramo.id_linea, LineaTramo.orden).offset(offset).limit(limit).all()

    items = []
    for tramo, linea in filas:
        items.append({
            "id_tramo":    tramo.id_tramo,
            "id_linea":    tramo.id_linea,
            "orden":       tramo.orden,
            "num_tramo":   tramo.num_tramo,
            "lat_ini":     tramo.lat_ini,
            "lon_ini":     tramo.lon_ini,
            "lat_fin":     tramo.lat_fin,
            "lon_fin":     tramo.lon_fin,
            "cini":                 linea.cini                 if linea else None,
            "codigo_ccuu":          linea.codigo_ccuu          if linea else None,
            "nudo_inicio":          linea.nudo_inicio          if linea else None,
            "nudo_fin":             linea.nudo_fin             if linea else None,
            "ccaa_1":               linea.ccaa_1               if linea else None,
            "ccaa_2":               linea.ccaa_2               if linea else None,
            "tension_kv":           float(linea.tension_kv) if linea and linea.tension_kv is not None else None,
            "longitud_km":          float(linea.longitud_km) if linea and linea.longitud_km is not None else None,
            "id_ct":                linea.id_ct                if linea else None,
            "metodo_asignacion_ct": linea.metodo_asignacion_ct if linea else None,
        })
    return items, total
