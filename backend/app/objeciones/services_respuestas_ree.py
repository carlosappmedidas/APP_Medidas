# app/objeciones/services_respuestas_ree.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false

"""
Servicio de búsqueda de respuestas REE a los ficheros REOB enviados.

Cuando se envía un fichero REOB al SFTP de REE, REE responde dejando en la
MISMA carpeta donde están los AOBs un fichero con el mismo nombre más sufijo:
    - {nombre_reob_sin_bz2}.ok.bz2   → REE aceptó el fichero
    - {nombre_reob_sin_bz2}.bad.bz2  → REE rechazó el fichero

Función pública principal:
    buscar_respuestas_tenant(db, *, tenant_id, current_user)

Recorre los REOB con enviado_sftp_at != NULL y estado_ree IS NULL, se conecta
al SFTP de cada empresa, lista la carpeta AOB (resolviendo placeholders), y
si encuentra un .ok.bz2 o .bad.bz2 correspondiente, actualiza estado_ree en BD.

Devuelve un resumen: {procesados, encontrados_ok, encontrados_bad,
                      sin_respuesta, errores, detalle}.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.comunicaciones.models import FtpConfig
from app.empresas.models import Empresa
from app.objeciones.models import ReobGenerado

# Reutilizamos helpers del service de descarga para NO duplicar código.
from app.objeciones.descarga.services import (
    _carpeta_es_dinamica,
    _empresas_accesibles,
    _listar_path,
    _primera_config_activa,
    _resolver_carpeta_aob,
)


# ── Estructuras internas ──────────────────────────────────────────────────────

@dataclass
class _ReobPendiente:
    """Un REOB que está enviado por SFTP pero aún sin respuesta REE."""
    id:                  int
    empresa_id:          int
    nombre_fichero_reob: str   # p.ej. 'REOBAGRECL_0277_..._20260419.0'
    aaaamm:              Optional[str]  # 'YYYYMM' — usado para placeholder


# ── Selección de REOBs pendientes ─────────────────────────────────────────────

def _reobs_pendientes(
    db: Session,
    *,
    tenant_id: int,
    empresa_ids: List[int],
) -> List[_ReobPendiente]:
    """
    Devuelve los REOB del tenant que:
      - han sido enviados al SFTP (enviado_sftp_at != NULL)
      - aún no tienen respuesta de REE (estado_ree IS NULL)
      - pertenecen a alguna de las empresas pasadas.
    """
    if not empresa_ids:
        return []

    rows = db.query(
        ReobGenerado.id,
        ReobGenerado.empresa_id,
        ReobGenerado.nombre_fichero_reob,
        ReobGenerado.aaaamm,
    ).filter(
        ReobGenerado.tenant_id == tenant_id,
        ReobGenerado.empresa_id.in_(empresa_ids),
        ReobGenerado.enviado_sftp_at.isnot(None),
        ReobGenerado.estado_ree.is_(None),
    ).all()

    return [
        _ReobPendiente(
            id=int(r[0]),
            empresa_id=int(r[1]),
            nombre_fichero_reob=str(r[2] or "").strip(),
            aaaamm=str(r[3]).strip() if r[3] else None,
        )
        for r in rows
        if r[2]  # descartar filas sin nombre
    ]


# ── Búsqueda en SFTP por empresa ──────────────────────────────────────────────

def _carpetas_a_explorar(
    carpeta_base: str,
    aaaamms: Set[str],
) -> List[str]:
    """
    Dado el `carpeta_aob` de una empresa y el conjunto de AAAAMMs de los REOBs
    pendientes, devuelve las rutas SFTP a listar (sin duplicados).

    - Si la carpeta es dinámica ({mes_actual}) → una ruta por AAAAMM.
    - Si la carpeta es fija → una sola ruta.
    """
    if _carpeta_es_dinamica(carpeta_base):
        rutas = []
        for mes in aaaamms:
            if not mes:
                continue
            ruta = _resolver_carpeta_aob(carpeta_base, mes)
            if ruta not in rutas:
                rutas.append(ruta)
        return rutas

    # Fija — basta con resolverla una vez (el mes_actual se ignora si no hay placeholder)
    return [_resolver_carpeta_aob(carpeta_base, "202601")]  # dummy, no se usa


# Regex para parsear nombres tipo:
#   REOBAGRECL_0277_1008_9999_202506_20260319.0
#   REOBAGRECL_0277_1008_9999_202506_20260319.0.bz2
#   REOBAGRECL_0277_1008_9999_202506_20260319.0.ok.bz2
#   REOBAGRECL_0277_1008_9999_202506_20260319.0.bad.bz2
#
# Grupos capturados: (prefijo_sin_fecha_ni_version, fecha, version, sufijo_ok_bad_o_vacio)
# prefijo_sin_fecha_ni_version → termina en '_' para facilitar concatenación.
_REOB_NOMBRE_RE = re.compile(
    r"^(?P<prefijo>[A-Z]+_\d+_\d+_\d+_\d+_)"
    r"(?P<fecha>\d{8})\."
    r"(?P<version>\d+)"
    r"(?:\.bz2)?"
    r"(?:\.(?P<sufijo>ok|bad\d*)(?:\.bz2)?)?$"
)


def _parsear_nombre_reob(nombre: str) -> Optional[Tuple[str, str, str, Optional[str]]]:
    """
    Parsea un nombre de fichero REOB o su respuesta REE.
    Devuelve (prefijo, fecha, version, sufijo) o None si no matchea.
      - prefijo: 'REOBAGRECL_0277_1008_9999_202506_' (incluye el _ final)
      - fecha:   '20260319'
      - version: '0', '1', ...
      - sufijo:  'ok' / 'bad' / None (si es el REOB original sin respuesta)
    """
    m = _REOB_NOMBRE_RE.match(nombre)
    if not m:
        return None
    return (m.group("prefijo"), m.group("fecha"), m.group("version"), m.group("sufijo"))


def _buscar_respuestas_empresa(
    config: FtpConfig,
    carpeta_base: str,
    pendientes_empresa: List[_ReobPendiente],
) -> Dict[int, str]:
    """
    Lista las carpetas AOB de una empresa y detecta respuestas .ok / .bad.

    Devuelve: {reob_id: 'ok' | 'bad'} solo para los que se haya encontrado respuesta.

    Matching (según clarificación del negocio):
      - La respuesta de REE conserva el MISMO prefijo (tipo + dddd + cccc + 9999 + aaaamm)
        y la MISMA versión (.0, .1, ...) que el REOB original.
      - La FECHA en el nombre del .ok / .bad es la del día en que REE generó la
        respuesta, que puede ser igual o posterior a la del REOB original.
      - Por tanto NO podemos buscar por nombre exacto: buscamos todos los
        .ok / .bad con mismo prefijo + misma versión, y asociamos cada respuesta
        al REOB más "joven" que sea <= fecha de la respuesta.

    Estrategia:
      1) Listar todas las carpetas SFTP relevantes una sola vez.
      2) Parsear nombres y quedarnos con los que son respuestas (.ok / .bad) o
         REOBs originales — todos con su (prefijo, fecha, versión).
      3) Agrupar pendientes por (prefijo, versión).
      4) Para cada grupo, recorrer las respuestas ordenadas por fecha asc y
         asociarlas al REOB pendiente cuya fecha sea la mayor que aún sea <=
         fecha de la respuesta. Un REOB ya asociado no se pisa.
    """
    aaaamms = {p.aaaamm for p in pendientes_empresa if p.aaaamm}

    rutas = _carpetas_a_explorar(carpeta_base, aaaamms)
    if not rutas:
        return {}

    # 1) Listar SFTP (todas las rutas, unidas en un set de nombres)
    nombres_sftp: Set[str] = set()
    for ruta in rutas:
        try:
            entries = _listar_path(config, ruta)
        except Exception:
            continue
        for e in entries:
            nombres_sftp.add(e.nombre)

    if not nombres_sftp:
        return {}

    # 2) Parsear nombres en SFTP y quedarnos con los que son RESPUESTAS (.ok/.bad)
    #    Estructura: {(prefijo, version): [(fecha, sufijo), ...]} ordenado por fecha asc.
    respuestas_por_grupo: Dict[Tuple[str, str], List[Tuple[str, str]]] = {}
    for nombre in nombres_sftp:
        p = _parsear_nombre_reob(nombre)
        if p is None:
            continue
        prefijo, fecha, version, sufijo = p
        if sufijo is None:
            continue  # es un REOB original, no una respuesta
        # Normalizar 'bad2', 'bad3'… → 'bad' (la columna en BD solo acepta 'ok'|'bad')
        if sufijo.startswith("bad"):
            sufijo = "bad"
        elif sufijo != "ok":
            continue  # sufijo raro no reconocido
        respuestas_por_grupo.setdefault((prefijo, version), []).append((fecha, sufijo))

    # Ordenar las respuestas de cada grupo por fecha ascendente
    for k in respuestas_por_grupo:
        respuestas_por_grupo[k].sort(key=lambda x: x[0])

    if not respuestas_por_grupo:
        return {}

    # 3) Agrupar los pendientes por (prefijo, versión) y ordenarlos por fecha asc
    pendientes_por_grupo: Dict[Tuple[str, str], List[Tuple[str, int]]] = {}
    for reob in pendientes_empresa:
        p = _parsear_nombre_reob(reob.nombre_fichero_reob)
        if p is None:
            continue
        prefijo, fecha, version, _ = p
        pendientes_por_grupo.setdefault((prefijo, version), []).append((fecha, reob.id))

    for k in pendientes_por_grupo:
        pendientes_por_grupo[k].sort(key=lambda x: x[0])

    # 4) Asociar respuestas → REOBs del mismo grupo (prefijo + versión).
    #    Para cada respuesta (ordenada asc), buscar el REOB pendiente cuya fecha
    #    sea la mayor que sea <= fecha de la respuesta, y que aún no tenga estado.
    resultados: Dict[int, str] = {}
    for grupo, respuestas in respuestas_por_grupo.items():
        pendientes_grupo = pendientes_por_grupo.get(grupo, [])
        if not pendientes_grupo:
            continue

        for fecha_resp, sufijo in respuestas:
            # REOBs pendientes no asignados aún cuya fecha sea <= fecha_resp
            candidatos = [
                (fecha_reob, rid)
                for (fecha_reob, rid) in pendientes_grupo
                if fecha_reob <= fecha_resp and rid not in resultados
            ]
            if not candidatos:
                continue
            # Tomar el de fecha más reciente (el más "cercano" a la respuesta)
            candidatos.sort(key=lambda x: x[0], reverse=True)
            _, rid_match = candidatos[0]
            resultados[rid_match] = sufijo

    return resultados


# ── Persistencia ──────────────────────────────────────────────────────────────

def _actualizar_estados(
    db: Session,
    *,
    actualizaciones: Dict[int, str],
) -> None:
    """
    Aplica las actualizaciones de estado_ree en bloque.
    Se hace 1 UPDATE por estado (ok / bad) para minimizar viajes a BD.
    """
    if not actualizaciones:
        return

    ids_ok  = [rid for rid, estado in actualizaciones.items() if estado == "ok"]
    ids_bad = [rid for rid, estado in actualizaciones.items() if estado == "bad"]

    if ids_ok:
        db.query(ReobGenerado).filter(ReobGenerado.id.in_(ids_ok)).update(
            {ReobGenerado.estado_ree: "ok"},
            synchronize_session=False,
        )
    if ids_bad:
        db.query(ReobGenerado).filter(ReobGenerado.id.in_(ids_bad)).update(
            {ReobGenerado.estado_ree: "bad"},
            synchronize_session=False,
        )

    db.commit()


# ── API PÚBLICA ───────────────────────────────────────────────────────────────

def buscar_respuestas_tenant(
    db: Session,
    *,
    tenant_id: int,
    current_user: Any,
    empresa_id: Optional[int] = None,
) -> dict:
    """
    Busca respuestas REE (.ok/.bad) en SFTP para los REOB enviados del tenant
    que aún no tienen estado_ree.

    Si `empresa_id` se indica, solo procesa esa empresa (y valida que el
    usuario tenga acceso a ella). Si es None, procesa todas las empresas
    accesibles al usuario.

    Devuelve resumen:
        {
            procesados:       int,   # REOBs evaluados
            encontrados_ok:   int,
            encontrados_bad:  int,
            sin_respuesta:    int,
            errores_empresa:  int,   # empresas con fallo de conexión u otros
            detalle:          [{empresa_id, empresa_nombre, ok, bad, sin_resp, error?}, ...]
        }
    """
    # 1) Empresas accesibles al usuario
    empresas = _empresas_accesibles(db, tenant_id=tenant_id, current_user=current_user)
    if not empresas:
        return {
            "procesados": 0, "encontrados_ok": 0, "encontrados_bad": 0,
            "sin_respuesta": 0, "errores_empresa": 0, "detalle": [],
        }

    # Si se indicó empresa_id, filtrar el set accesible.
    # Si la empresa no está en las accesibles → el usuario no tiene permiso,
    # devolvemos un resumen vacío sin hacer nada (comportamiento tenant-safe).
    if empresa_id is not None:
        empresas = [e for e in empresas if int(e.id) == int(empresa_id)]
        if not empresas:
            return {
                "procesados": 0, "encontrados_ok": 0, "encontrados_bad": 0,
                "sin_respuesta": 0, "errores_empresa": 0, "detalle": [],
            }

    empresa_by_id: Dict[int, Empresa] = {int(e.id): e for e in empresas}
    empresa_ids = list(empresa_by_id.keys())

    # 2) REOBs pendientes (enviados pero sin estado_ree)
    pendientes = _reobs_pendientes(db, tenant_id=tenant_id, empresa_ids=empresa_ids)
    if not pendientes:
        return {
            "procesados": 0, "encontrados_ok": 0, "encontrados_bad": 0,
            "sin_respuesta": 0, "errores_empresa": 0, "detalle": [],
        }

    # 3) Agrupar pendientes por empresa
    por_empresa: Dict[int, List[_ReobPendiente]] = {}
    for p in pendientes:
        por_empresa.setdefault(p.empresa_id, []).append(p)

    # 4) Explorar SFTP y recopilar actualizaciones
    total_actualizaciones: Dict[int, str] = {}
    detalle: List[dict] = []
    errores_empresa = 0

    for emp_id, pendientes_emp in por_empresa.items():
        emp = empresa_by_id.get(emp_id)
        emp_nombre = getattr(emp, "nombre", None) or f"Empresa {emp_id}"

        config = _primera_config_activa(db, tenant_id=tenant_id, empresa_id=emp_id)
        if config is None:
            errores_empresa += 1
            detalle.append({
                "empresa_id": emp_id, "empresa_nombre": emp_nombre,
                "ok": 0, "bad": 0, "sin_resp": len(pendientes_emp),
                "error": "Empresa sin conexión FTP activa.",
            })
            continue

        carpeta = (getattr(config, "carpeta_aob", None) or "").strip()
        if not carpeta:
            errores_empresa += 1
            detalle.append({
                "empresa_id": emp_id, "empresa_nombre": emp_nombre,
                "ok": 0, "bad": 0, "sin_resp": len(pendientes_emp),
                "error": "Empresa sin carpeta_aob configurada.",
            })
            continue

        try:
            resultados_emp = _buscar_respuestas_empresa(config, carpeta, pendientes_emp)
        except Exception as e:
            errores_empresa += 1
            detalle.append({
                "empresa_id": emp_id, "empresa_nombre": emp_nombre,
                "ok": 0, "bad": 0, "sin_resp": len(pendientes_emp),
                "error": f"Error SFTP: {str(e)[:200]}",
            })
            continue

        n_ok = sum(1 for v in resultados_emp.values() if v == "ok")
        n_bad = sum(1 for v in resultados_emp.values() if v == "bad")
        n_sin = len(pendientes_emp) - n_ok - n_bad

        detalle.append({
            "empresa_id": emp_id, "empresa_nombre": emp_nombre,
            "ok": n_ok, "bad": n_bad, "sin_resp": n_sin,
        })

        total_actualizaciones.update(resultados_emp)

    # 5) Persistir
    try:
        _actualizar_estados(db, actualizaciones=total_actualizaciones)
    except Exception:
        db.rollback()
        raise

    # 6) Resumen
    total_ok  = sum(1 for v in total_actualizaciones.values() if v == "ok")
    total_bad = sum(1 for v in total_actualizaciones.values() if v == "bad")
    procesados = len(pendientes)

    return {
        "procesados":       procesados,
        "encontrados_ok":   total_ok,
        "encontrados_bad":  total_bad,
        "sin_respuesta":    procesados - total_ok - total_bad,
        "errores_empresa":  errores_empresa,
        "detalle":          detalle,
    }