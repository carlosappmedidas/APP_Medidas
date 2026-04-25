# app/objeciones/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.tenants.models import User

from app.objeciones.schemas import (
    ImportResponse,
    ObjecionAGRECLRead,
    ObjecionCILRead,
    ObjecionCUPSRead,
    ObjecionINCLRead,
    RespuestaUpdate,
)
from app.objeciones import services
from app.objeciones.services_respuestas_ree import buscar_respuestas_tenant

router = APIRouter(prefix="/objeciones", tags=["objeciones"])


# ── Schemas locales ───────────────────────────────────────────────────────────

class BulkDeletePayload(BaseModel):
    ids: List[int]
    empresa_id: int

class DeleteResponse(BaseModel):
    deleted: int

class FicheroStats(BaseModel):
    nombre_fichero: str
    aaaamm: Optional[str] = None        # periodo extraído del nombre (YYYYMM)
    created_at: Optional[datetime] = None
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    enviado_sftp_at: Optional[datetime] = None

class DashTipo(BaseModel):
    """
    Agregación por tipo de objeción (AOBAGRECL, OBJEINCL, AOBCUPS, AOBCIL).
    El Dashboard visual ya no la pinta (se sustituyó por DashPeriodo), pero
    se sigue devolviendo en la respuesta porque GestionPanel la usa para
    los contadores de las pestañas del panel Gestión.
    """
    tipo: str
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    enviadas_sftp: int = 0


class DashTipoEnPeriodo(BaseModel):
    """Desglose por tipo dentro de un periodo (AOBAGRECL, OBJEINCL, AOBCUPS, AOBCIL).
    Usado por el dashboard para mostrar el detalle al desplegar un mes."""
    tipo: str                  # "AOBAGRECL" | "OBJEINCL" | "AOBCUPS" | "AOBCIL"
    obj_total: int             # nº objeciones del tipo en este periodo
    obj_pendientes: int        # objeciones sin responder (aceptacion null)
    reob_total: int = 0        # nº REOBs enviados para este tipo+periodo
    # Contadores REE propagados a objeciones (usando num_registros del REOB)
    ree_ok: int = 0
    ree_bad: int = 0
    ree_sin_resp: int = 0
    ree_na: int = 0            # siempre 0 excepto para OBJEINCL (REE no responde INCL)


class DashPeriodo(BaseModel):
    periodo: str              # YYYYMM, ej "202507"
    periodo_label: str        # "Jul 2025" — formato legible para la UI
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    enviadas_sftp: int = 0
    # ── Respuestas REE agregadas desde ReobGenerado, en UNIDAD DE OBJECIONES ──
    # (propagadas desde cada REOB a las objeciones que cubre vía num_registros).
    # INCL NO se cuenta aquí — sus objeciones van a ree_na porque REE no responde INCL.
    ree_ok: int = 0
    ree_bad: int = 0
    ree_sin_resp: int = 0
    ree_na: int = 0            # objeciones de tipo INCL (no reciben respuesta REE)
    # Desglose por tipo dentro del periodo
    por_tipo: List[DashTipoEnPeriodo] = []

class DashEmpresaPeriodo(BaseModel):
    """Desglose por periodo dentro de una empresa.
    Usado por el dashboard para mostrar datos del último periodo por empresa."""
    periodo: str                  # YYYYMM, ej "202507"
    periodo_label: str            # "Jul 2025"
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    enviadas_sftp: int = 0


class DashEmpresa(BaseModel):
    empresa_id: int
    empresa_nombre: str
    empresa_codigo_ree: Optional[str] = None
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    enviadas_sftp: int = 0
    # Desglose por periodo dentro de esta empresa (ordenado reciente→antiguo).
    # La UI usa el primer elemento para mostrar "el último periodo" de cada empresa.
    por_periodo: List[DashEmpresaPeriodo] = []

class DashResponse(BaseModel):
    total: int
    pendientes: int
    aceptadas: int
    rechazadas: int
    enviadas_sftp: int = 0
    por_tipo: List[DashTipo]          # usado por GestionPanel (no visible en Dashboard)
    por_periodo: List[DashPeriodo]
    por_empresa: List[DashEmpresa]


# ── Helpers de acceso ─────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))

def _is_superuser(user: User) -> bool:
    return bool(getattr(user, "is_superuser", False))

def _allowed_empresa_ids(user: User) -> List[int]:
    try:
        rel = getattr(user, "empresas_permitidas", None) or []
        return [int(getattr(e, "id")) for e in rel]
    except Exception:
        return []

def _get_empresa_or_404(db: Session, empresa_id: int) -> Empresa:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return empresa

def _assert_empresa_access(*, user: User, empresa: Empresa) -> None:
    if _is_superuser(user):
        return
    if int(getattr(empresa, "tenant_id")) != _tenant_id(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")
    allowed = _allowed_empresa_ids(user)
    if allowed and int(getattr(empresa, "id")) not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a esta empresa")

def _effective_tenant(user: User) -> int:
    return _tenant_id(user)

def _validar_nombre(nombre: str, tipo_ruta: str, empresa: Empresa) -> None:
    codigo_ree = str(getattr(empresa, "codigo_ree") or "").strip() or None
    error = services.validar_nombre_fichero(nombre, tipo_ruta, codigo_ree)
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

def _get_empresa_id_verificado(db: Session, empresa_id: int, user: User) -> int:
    """Obtiene y verifica acceso a empresa. Devuelve empresa_id."""
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=user, empresa=empresa)
    return empresa_id


# ═══════════════════════════════════════════════════════════════════════════════
# DASHBOARD GLOBAL
# ═══════════════════════════════════════════════════════════════════════════════

# Meses en español para las etiquetas del dashboard (ej. "Jul 2025").
_MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _normalizar_periodo(raw: Optional[str]) -> Optional[tuple[str, str]]:
    """
    Normaliza el campo periodo de las tablas de objeciones.

    Acepta los formatos habituales:
      - "2025/06"  (el formato actual en BD)
      - "2025-06"
      - "202506"

    Devuelve una tupla (periodo_yyyymm, periodo_label), por ejemplo:
      ("202506", "Jun 2025")

    Si el valor no se puede parsear, devuelve None (y esa fila se ignora
    en la agrupación del dashboard).
    """
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None

    # Intentar extraer año y mes
    year_str = ""
    month_str = ""
    if "/" in s:
        partes = s.split("/", 1)
        year_str, month_str = partes[0], partes[1] if len(partes) > 1 else ""
    elif len(s) >= 6 and s[:6].isdigit():
        # Formato RAW tipo "20250601 01 - 20250701 00" — los primeros 6 dígitos son YYYYMM.
        # También cubre el caso simple "202506".
        year_str, month_str = s[:4], s[4:6]
    elif "-" in s:
        # Formato "2025-06" — lo ponemos DESPUÉS del anterior porque el formato RAW
        # también contiene guiones y queremos que prevalezca la lectura por posición.
        partes = s.split("-", 1)
        year_str, month_str = partes[0], partes[1] if len(partes) > 1 else ""
    else:
        return None

    if len(year_str) != 4 or not year_str.isdigit():
        return None
    if len(month_str) < 1 or len(month_str) > 2 or not month_str.isdigit():
        return None

    month_int = int(month_str)
    if month_int < 1 or month_int > 12:
        return None

    periodo_yyyymm = f"{year_str}{month_int:02d}"
    periodo_label = f"{_MESES_ES[month_int - 1]} {year_str}"
    return periodo_yyyymm, periodo_label


@router.get("/dashboard", response_model=DashResponse)
def get_dashboard(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.objeciones.models import ObjecionAGRECL, ObjecionINCL, ObjecionCUPS, ObjecionCIL
    from app.objeciones.models import ReobGenerado

    # Si se filtra por empresa, verificar acceso
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)

    tenant_id = _effective_tenant(current_user)

    # Mapeo tipo_label (en objeciones_reob_generados) ↔ tipo REE (modelos).
    # La columna ReobGenerado.tipo usa los valores: 'agrecl', 'incl', 'cups', 'cil'
    MODELOS = [
        ("AOBAGRECL", ObjecionAGRECL, "agrecl"),
        ("OBJEINCL",  ObjecionINCL,   "incl"),
        ("AOBCUPS",   ObjecionCUPS,   "cups"),
        ("AOBCIL",    ObjecionCIL,    "cil"),
    ]

    total_global = pendientes_global = aceptadas_global = rechazadas_global = enviadas_sftp_global = 0

    # Agregador por tipo (necesario para los contadores de las pestañas de Gestión).
    por_tipo: List[DashTipo] = []
    # Agregador por periodo (clave = "YYYYMM"). Guardamos también el label.
    por_periodo_dict: dict = {}
    # Agregador por empresa (clave = empresa_id).
    por_empresa_dict: dict = {}

    # ── Paso 1: Construir tablas de REOBs indexadas por (aaaamm, tipo_reob) ──
    # Necesitamos saber, para cada periodo+tipo, cuántos REOBs hay y cuántas
    # objeciones cubren en cada estado REE (propagando num_registros).
    reob_q = db.query(ReobGenerado).filter(
        ReobGenerado.tenant_id == tenant_id,
        ReobGenerado.enviado_sftp_at.isnot(None),  # solo los enviados al SFTP
    )
    if empresa_id:
        reob_q = reob_q.filter(ReobGenerado.empresa_id == empresa_id)
    reob_rows = reob_q.all()

    # reob_stats[(pkey, tipo_reob)] = {"reob_total": N, "obj_ok": N, "obj_bad": N, "obj_sin_resp": N}
    reob_stats: dict = {}
    for r in reob_rows:
        aaaamm_raw = getattr(r, "aaaamm", None)
        if not aaaamm_raw:
            continue
        pkey = str(aaaamm_raw).strip()
        if len(pkey) != 6 or not pkey.isdigit():
            continue
        tipo_reob = (getattr(r, "tipo", None) or "").strip().lower()
        if not tipo_reob:
            continue
        key = (pkey, tipo_reob)
        if key not in reob_stats:
            reob_stats[key] = {"reob_total": 0, "obj_ok": 0, "obj_bad": 0, "obj_sin_resp": 0}

        estado = getattr(r, "estado_ree", None)
        reob_stats[key]["reob_total"] += 1
        # Contadores REE en UNIDAD DE REOBS (no objeciones).
        # Cada REOB cuenta como 1, independientemente de cuántas objeciones agrupe.
        if estado == "ok":
            reob_stats[key]["obj_ok"] += 1
        elif estado == "bad":
            reob_stats[key]["obj_bad"] += 1
        else:
            reob_stats[key]["obj_sin_resp"] += 1

    for tipo_label, model, tipo_reob in MODELOS:
        q = db.query(model).filter(model.tenant_id == tenant_id)
        if empresa_id:
            q = q.filter(model.empresa_id == empresa_id)
        rows = q.all()

        # Contadores locales para este tipo (usado por por_tipo global)
        t_total = t_pend = t_ok = t_err = t_sftp = 0
        # Contadores por periodo+tipo (usado para construir por_tipo dentro de cada periodo)
        # tipo_por_periodo[pkey] = {"obj_total": N, "obj_pendientes": N}
        tipo_por_periodo: dict = {}

        for r in rows:
            ac = getattr(r, "aceptacion") or ""
            enviado = bool(getattr(r, "enviado_sftp_at", None))

            # ─── Contadores globales ──────────────────────────────────────
            total_global += 1
            if ac == "S":
                aceptadas_global += 1
            elif ac == "N":
                rechazadas_global += 1
            else:
                pendientes_global += 1
            if enviado:
                enviadas_sftp_global += 1

            # ─── Contadores POR TIPO global (para GestionPanel) ───────────
            t_total += 1
            if ac == "S":
                t_ok += 1
            elif ac == "N":
                t_err += 1
            else:
                t_pend += 1
            if enviado:
                t_sftp += 1

            # ─── Agregación POR PERIODO ──────────────────────────────────
            periodo_parsed = _normalizar_periodo(getattr(r, "periodo", None))
            if periodo_parsed is not None:
                pkey, plabel = periodo_parsed
                if pkey not in por_periodo_dict:
                    por_periodo_dict[pkey] = {
                        "periodo": pkey,
                        "periodo_label": plabel,
                        "total": 0, "pendientes": 0, "aceptadas": 0,
                        "rechazadas": 0, "enviadas_sftp": 0,
                        "ree_ok": 0, "ree_bad": 0, "ree_sin_resp": 0, "ree_na": 0,
                        "por_tipo": [],  # se rellena al final
                    }
                p = por_periodo_dict[pkey]
                p["total"] += 1
                if ac == "S":
                    p["aceptadas"] += 1
                elif ac == "N":
                    p["rechazadas"] += 1
                else:
                    p["pendientes"] += 1
                if enviado:
                    p["enviadas_sftp"] += 1

                # Sub-agregador por periodo+tipo (para construir el detalle "por_tipo")
                if pkey not in tipo_por_periodo:
                    tipo_por_periodo[pkey] = {"obj_total": 0, "obj_pendientes": 0}
                tipo_por_periodo[pkey]["obj_total"] += 1
                if ac not in ("S", "N"):
                    tipo_por_periodo[pkey]["obj_pendientes"] += 1

            # ─── Agregación POR EMPRESA ──────────────────────────────────
            eid = int(getattr(r, "empresa_id"))
            if eid not in por_empresa_dict:
                emp = db.query(Empresa).filter(Empresa.id == eid).first()
                por_empresa_dict[eid] = {
                    "empresa_id": eid,
                    "empresa_nombre": getattr(emp, "nombre", "") if emp else f"Empresa {eid}",
                    "empresa_codigo_ree": getattr(emp, "codigo_ree", None) if emp else None,
                    "total": 0, "pendientes": 0, "aceptadas": 0, "rechazadas": 0, "enviadas_sftp": 0,
                    # Sub-agregador por (empresa, periodo). Clave = pkey.
                    "_por_periodo": {},
                }
            d = por_empresa_dict[eid]
            d["total"] += 1
            if ac == "S":
                d["aceptadas"] += 1
            elif ac == "N":
                d["rechazadas"] += 1
            else:
                d["pendientes"] += 1
            if enviado:
                d["enviadas_sftp"] += 1

            # Sub-agregador (empresa × periodo) — se rellena si la objeción
            # tiene un periodo parseable (usa el mismo parseado que el bloque
            # POR PERIODO de arriba: variable `periodo_parsed`).
            if periodo_parsed is not None:
                pkey_e, plabel_e = periodo_parsed
                ep_dict = d["_por_periodo"]
                if pkey_e not in ep_dict:
                    ep_dict[pkey_e] = {
                        "periodo": pkey_e,
                        "periodo_label": plabel_e,
                        "total": 0, "pendientes": 0, "aceptadas": 0,
                        "rechazadas": 0, "enviadas_sftp": 0,
                    }
                ep = ep_dict[pkey_e]
                ep["total"] += 1
                if ac == "S":
                    ep["aceptadas"] += 1
                elif ac == "N":
                    ep["rechazadas"] += 1
                else:
                    ep["pendientes"] += 1
                if enviado:
                    ep["enviadas_sftp"] += 1

        # ─── Cerrar agregado POR TIPO global ─────────────────────────────
        if t_total > 0:
            por_tipo.append(DashTipo(
                tipo=tipo_label,
                total=t_total,
                pendientes=t_pend,
                aceptadas=t_ok,
                rechazadas=t_err,
                enviadas_sftp=t_sftp,
            ))

        # ─── Fusionar tipo_por_periodo dentro de cada periodo ────────────
        # Añadimos una entrada DashTipoEnPeriodo a p["por_tipo"] por cada
        # periodo donde este tipo tenga objeciones.
        for pkey, agg in tipo_por_periodo.items():
            if pkey not in por_periodo_dict:
                continue
            p = por_periodo_dict[pkey]
            # Recuperar stats REE para este (periodo, tipo_reob)
            stats = reob_stats.get((pkey, tipo_reob), {
                "reob_total": 0, "obj_ok": 0, "obj_bad": 0, "obj_sin_resp": 0,
            })

            # Para INCL: los REOBs no reciben respuesta REE. ree_na cuenta REOBs.
            # Para el resto: se usan los contadores propagados desde los REOBs.
            if tipo_reob == "incl":
                entry = {
                    "tipo": tipo_label,
                    "obj_total": agg["obj_total"],
                    "obj_pendientes": agg["obj_pendientes"],
                    "reob_total": stats["reob_total"],
                    "ree_ok": 0,
                    "ree_bad": 0,
                    "ree_sin_resp": 0,
                    "ree_na": stats["reob_total"],  # nº de REOBs INCL (no reciben respuesta)
                }
                # Propagar al total del periodo (en nº de REOBs)
                p["ree_na"] += stats["reob_total"]
            else:
                entry = {
                    "tipo": tipo_label,
                    "obj_total": agg["obj_total"],
                    "obj_pendientes": agg["obj_pendientes"],
                    "reob_total": stats["reob_total"],
                    "ree_ok": stats["obj_ok"],
                    "ree_bad": stats["obj_bad"],
                    "ree_sin_resp": stats["obj_sin_resp"],
                    "ree_na": 0,
                }
                # Propagar al total del periodo
                p["ree_ok"] += stats["obj_ok"]
                p["ree_bad"] += stats["obj_bad"]
                p["ree_sin_resp"] += stats["obj_sin_resp"]

            p["por_tipo"].append(entry)

    # ─── Añadir periodos que solo tienen REOBs (sin objeciones en BD) ────
    # Caso raro: puede haber REOBs huérfanos de un mes que ya no tiene AOB.
    for (pkey, tipo_reob), stats in reob_stats.items():
        if pkey in por_periodo_dict:
            continue
        year = pkey[:4]
        month = int(pkey[4:6])
        plabel = f"{_MESES_ES[month - 1]} {year}" if 1 <= month <= 12 else pkey
        por_periodo_dict[pkey] = {
            "periodo": pkey,
            "periodo_label": plabel,
            "total": 0, "pendientes": 0, "aceptadas": 0,
            "rechazadas": 0, "enviadas_sftp": 0,
            "ree_ok": 0, "ree_bad": 0, "ree_sin_resp": 0, "ree_na": 0,
            "por_tipo": [],
        }
        # (No desglosamos por_tipo en este caso raro — se mostrará solo el total)

    # ─── Orden y límite de "por_periodo": 6 más recientes, reciente arriba ────
    por_periodo_ordenado = sorted(
        por_periodo_dict.values(),
        key=lambda p: p["periodo"],
        reverse=True,
    )[:6]
    # Convertir por_tipo de cada periodo a DashTipoEnPeriodo
    for p in por_periodo_ordenado:
        p["por_tipo"] = [DashTipoEnPeriodo(**t) for t in p["por_tipo"]]
    por_periodo = [DashPeriodo(**v) for v in por_periodo_ordenado]

    # Convertir el sub-agregador _por_periodo a una lista ordenada (reciente→antiguo)
    # y limpiar la clave interna antes de instanciar el schema Pydantic.
    por_empresa = []
    for v in por_empresa_dict.values():
        periodos_empresa_dict = v.pop("_por_periodo", {})
        periodos_ordenados = sorted(
            periodos_empresa_dict.values(),
            key=lambda p: p["periodo"],
            reverse=True,
        )
        v["por_periodo"] = [DashEmpresaPeriodo(**p) for p in periodos_ordenados]
        por_empresa.append(DashEmpresa(**v))

    return DashResponse(

        total=total_global,
        pendientes=pendientes_global,
        aceptadas=aceptadas_global,
        rechazadas=rechazadas_global,
        enviadas_sftp=enviadas_sftp_global,
        por_tipo=por_tipo,
        por_periodo=por_periodo,
        por_empresa=por_empresa,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# AOBAGRECL
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/agrecl/import", response_model=ImportResponse)
async def import_agrecl(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "agrecl", empresa)
    content = await file.read()
    n = services.import_agrecl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="AOBAGRECL", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/agrecl/ficheros", response_model=List[FicheroStats])
def get_ficheros_agrecl(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_agrecl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/agrecl/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_agrecl(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    delete_reob_asociado: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_agrecl_fichero(
        db,
        nombre_fichero=nombre_fichero,
        tenant_id=_effective_tenant(current_user),
        empresa_id=eid,
        delete_reob_asociado=delete_reob_asociado,
    )
    return DeleteResponse(deleted=deleted)


@router.get("/agrecl", response_model=List[ObjecionAGRECLRead])
def get_agrecl(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_agrecl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/agrecl/{id}", response_model=ObjecionAGRECLRead)
def patch_agrecl(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_agrecl_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/agrecl/{id}", response_model=DeleteResponse)
def delete_agrecl_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_agrecl(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/agrecl/bulk-delete", response_model=DeleteResponse)
def bulk_delete_agrecl(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_agrecl(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/agrecl/generate")
def generate_agrecl(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobagrecl_zip(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.post("/agrecl/generate-one")
def generate_agrecl_one(
    empresa_id: int = Query(...),
    objecion_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        content, filename = services.generate_reobagrecl_one(db, tenant_id=_effective_tenant(current_user), empresa_id=eid, objecion_id=objecion_id, nombre_fichero=nombre_fichero)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════════════
# OBJEINCL
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/incl/import", response_model=ImportResponse)
async def import_incl(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "incl", empresa)
    content = await file.read()
    n = services.import_incl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="OBJEINCL", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/incl/ficheros", response_model=List[FicheroStats])
def get_ficheros_incl(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_incl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/incl/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_incl(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    delete_reob_asociado: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_incl_fichero(
        db,
        nombre_fichero=nombre_fichero,
        tenant_id=_effective_tenant(current_user),
        empresa_id=eid,
        delete_reob_asociado=delete_reob_asociado,
    )
    return DeleteResponse(deleted=deleted)


@router.get("/incl", response_model=List[ObjecionINCLRead])
def get_incl(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_incl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/incl/{id}", response_model=ObjecionINCLRead)
def patch_incl(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_incl_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/incl/{id}", response_model=DeleteResponse)
def delete_incl_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_incl(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/incl/bulk-delete", response_model=DeleteResponse)
def bulk_delete_incl(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_incl(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/incl/generate")
def generate_incl(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobjeincl(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════════════
# AOBCUPS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/cups/import", response_model=ImportResponse)
async def import_cups(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "cups", empresa)
    content = await file.read()
    n = services.import_cups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="AOBCUPS", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/cups/ficheros", response_model=List[FicheroStats])
def get_ficheros_cups(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_cups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/cups/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_cups(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    delete_reob_asociado: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cups_fichero(
        db,
        nombre_fichero=nombre_fichero,
        tenant_id=_effective_tenant(current_user),
        empresa_id=eid,
        delete_reob_asociado=delete_reob_asociado,
    )
    return DeleteResponse(deleted=deleted)


@router.get("/cups", response_model=List[ObjecionCUPSRead])
def get_cups(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_cups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/cups/{id}", response_model=ObjecionCUPSRead)
def patch_cups(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_cups_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/cups/{id}", response_model=DeleteResponse)
def delete_cups_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cups(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/cups/bulk-delete", response_model=DeleteResponse)
def bulk_delete_cups(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_cups(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/cups/generate")
def generate_cups(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobcups(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════════════
# AOBCIL
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/cil/import", response_model=ImportResponse)
async def import_cil(
    empresa_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    _validar_nombre(file.filename or "", "cil", empresa)
    content = await file.read()
    n = services.import_cil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=file.filename or "", content=content)
    return ImportResponse(tipo="AOBCIL", fichero=file.filename or "", registros=n, empresa_id=empresa_id)


@router.get("/cil/ficheros", response_model=List[FicheroStats])
def get_ficheros_cil(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.ficheros_cil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id)


@router.delete("/cil/ficheros/{nombre_fichero:path}", response_model=DeleteResponse)
def delete_fichero_cil(
    nombre_fichero: str,
    empresa_id: int = Query(...),
    delete_reob_asociado: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cil_fichero(
        db,
        nombre_fichero=nombre_fichero,
        tenant_id=_effective_tenant(current_user),
        empresa_id=eid,
        delete_reob_asociado=delete_reob_asociado,
    )
    return DeleteResponse(deleted=deleted)


@router.get("/cil", response_model=List[ObjecionCILRead])
def get_cil(
    empresa_id: Optional[int] = Query(None),
    periodo: Optional[str] = Query(None),
    nombre_fichero: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if empresa_id:
        empresa = _get_empresa_or_404(db, empresa_id)
        _assert_empresa_access(user=current_user, empresa=empresa)
    return services.list_cil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, periodo=periodo, nombre_fichero=nombre_fichero)


@router.patch("/cil/{id}", response_model=ObjecionCILRead)
def patch_cil(
    id: int,
    payload: RespuestaUpdate,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    try:
        return services.update_cil_respuesta(db, id=id, tenant_id=_effective_tenant(current_user), empresa_id=eid, aceptacion=payload.aceptacion, motivo_no_aceptacion=payload.motivo_no_aceptacion, comentario_respuesta=payload.comentario_respuesta, respuesta_publicada=payload.respuesta_publicada)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/cil/{id}", response_model=DeleteResponse)
def delete_cil_one(
    id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, empresa_id, current_user)
    deleted = services.delete_cil(db, ids=[id], tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)


@router.post("/cil/bulk-delete", response_model=DeleteResponse)
def bulk_delete_cil(
    payload: BulkDeletePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    deleted = services.delete_cil(db, ids=payload.ids, tenant_id=_effective_tenant(current_user), empresa_id=eid)
    return DeleteResponse(deleted=deleted)

# ═══════════════════════════════════════════════════════════════════════════════
# ENVÍO SFTP (todos los tipos)
# ═══════════════════════════════════════════════════════════════════════════════

class ReobGeneradoRead(BaseModel):
    id: int
    tipo: str
    nombre_fichero_aob: str
    nombre_fichero_reob: str
    empresa_id: int
    comercializadora: Optional[str] = None
    aaaamm: Optional[str] = None
    num_registros: Optional[int] = None
    generado_at: Optional[datetime] = None
    enviado_sftp_at: Optional[datetime] = None
    config_sftp_id: Optional[int] = None
    estado_ree: Optional[str] = None   # NULL | 'ok' | 'bad'

    class Config:
        from_attributes = True

@router.get("/reob-generados", response_model=List[ReobGeneradoRead])
def get_reob_generados(
    empresa_id: Optional[int] = Query(None),
    tipo: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.objeciones.models import ReobGenerado
    tenant_id = _effective_tenant(current_user)
    if empresa_id:
        _get_empresa_id_verificado(db, empresa_id, current_user)
    q = db.query(ReobGenerado).filter(ReobGenerado.tenant_id == tenant_id)
    if empresa_id:
        q = q.filter(ReobGenerado.empresa_id == empresa_id)
    if tipo:
        q = q.filter(ReobGenerado.tipo == tipo)
    return q.order_by(ReobGenerado.enviado_sftp_at.desc()).all()


# ═══════════════════════════════════════════════════════════════════════════════
# RESPUESTAS REE (.ok / .bad) sobre los REOB enviados
# ═══════════════════════════════════════════════════════════════════════════════

class EstadoReePatch(BaseModel):
    """Body para marcar manualmente el estado de respuesta REE de un REOB."""
    estado: Optional[str] = Field(
        None,
        description="'ok', 'bad' o null para dejar sin respuesta",
    )


class EstadoReePatchResponse(BaseModel):
    id: int
    estado_ree: Optional[str]


@router.patch("/reob-generados/{id}/estado-ree", response_model=EstadoReePatchResponse)
def patch_estado_ree(
    id: int,
    payload: EstadoReePatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marca manualmente el estado de respuesta REE de un REOB generado.
    Acepta 'ok', 'bad' o null (para limpiar)."""
    from app.objeciones.models import ReobGenerado

    # Validar valor recibido
    estado = payload.estado
    if estado is not None:
        estado = estado.strip().lower() or None
    if estado not in (None, "ok", "bad"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="estado debe ser 'ok', 'bad' o null",
        )

    tenant_id = _effective_tenant(current_user)
    reob = db.query(ReobGenerado).filter(
        ReobGenerado.id == id,
        ReobGenerado.tenant_id == tenant_id,
    ).first()
    if reob is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="REOB no encontrado")

    # Verificar acceso a la empresa del REOB
    _get_empresa_id_verificado(db, int(getattr(reob, "empresa_id")), current_user)

    reob.estado_ree = estado  # type: ignore[assignment]
    db.commit()
    db.refresh(reob)
    return EstadoReePatchResponse(id=int(getattr(reob, "id")), estado_ree=getattr(reob, "estado_ree"))


class BuscarRespuestasResponseDetalle(BaseModel):
    empresa_id: int
    empresa_nombre: str
    ok: int
    bad: int
    sin_resp: int
    error: Optional[str] = None


class BuscarRespuestasResponse(BaseModel):
    procesados: int
    encontrados_ok: int
    encontrados_bad: int
    sin_respuesta: int
    errores_empresa: int
    detalle: List[BuscarRespuestasResponseDetalle]


@router.post("/reob-generados/buscar-respuestas", response_model=BuscarRespuestasResponse)
def buscar_respuestas_ree(
    empresa_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Busca las respuestas .ok/.bad de REE en el SFTP para los REOB enviados
    del tenant que aún no tienen estado_ree.

    Si se indica `empresa_id` → solo procesa esa empresa (verificando acceso).
    Si se omite → procesa todas las empresas accesibles al usuario.
    """
    # Si viene empresa_id, verificar acceso ANTES de tocar SFTPs
    if empresa_id is not None:
        _get_empresa_id_verificado(db, empresa_id, current_user)

    try:
        res = buscar_respuestas_tenant(
            db,
            tenant_id=_effective_tenant(current_user),
            current_user=current_user,
            empresa_id=empresa_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error buscando respuestas: {str(exc)[:300]}",
        ) from exc
    return res


@router.get("/reob-generados/{id}/descargar-respuesta")
def descargar_respuesta_ree(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descarga el fichero .ok.bz2 o .bad.bz2 de respuesta de REE desde el SFTP.
    Solo disponible si el REOB tiene estado_ree != NULL."""
    from app.objeciones.models import ReobGenerado
    from app.comunicaciones.services import leer_fichero_ftp
    from app.objeciones.descarga.services import (
        _carpeta_es_dinamica,
        _primera_config_activa,
        _resolver_carpeta_aob,
    )

    tenant_id = _effective_tenant(current_user)
    reob = db.query(ReobGenerado).filter(
        ReobGenerado.id == id,
        ReobGenerado.tenant_id == tenant_id,
    ).first()
    if reob is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="REOB no encontrado")

    # Verificar acceso a la empresa
    empresa_id = int(getattr(reob, "empresa_id"))
    _get_empresa_id_verificado(db, empresa_id, current_user)

    estado_ree = getattr(reob, "estado_ree", None)
    if estado_ree not in ("ok", "bad"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este REOB todavía no tiene respuesta de REE marcada.",
        )

    # Localizar la carpeta AOB y el config del SFTP
    config = _primera_config_activa(db, tenant_id=tenant_id, empresa_id=empresa_id)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La empresa no tiene una conexión FTP activa.",
        )
    carpeta_base = (getattr(config, "carpeta_aob", None) or "").strip()
    if not carpeta_base:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La conexión FTP no tiene carpeta_aob configurada.",
        )

    # Resolver carpeta (dinámica → usar AAAAMM del REOB)
    aaaamm = (getattr(reob, "aaaamm", None) or "").strip()
    if _carpeta_es_dinamica(carpeta_base) and not aaaamm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede resolver la carpeta SFTP (AAAAMM ausente).",
        )
    carpeta = _resolver_carpeta_aob(carpeta_base, aaaamm or "202601")

    # Nombre del fichero respuesta en SFTP
    base = str(getattr(reob, "nombre_fichero_reob") or "").strip()
    if not base:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El REOB no tiene nombre_fichero_reob registrado.",
        )
    # Patrones posibles según lo observado en SFTPs reales:
    #   - '.ok.bz2'         (respuesta OK: siempre este patrón)
    #   - '.bad.bz2'        (respuesta BAD: patrón "clásico")
    #   - '.bad2.bz2'       (respuesta BAD: patrón que usan algunos concentradores)
    #   - '.bz2.ok' / '.bz2.bad'  (patrón legacy)
    # Probamos todos hasta encontrar el fichero.
    if estado_ree == "ok":
        candidatos = [f"{base}.ok.bz2", f"{base}.bz2.ok"]
    else:  # "bad"
        candidatos = [f"{base}.bad.bz2", f"{base}.bad2.bz2", f"{base}.bz2.bad"]

    contenido: Optional[bytes] = None
    nombre_respuesta: Optional[str] = None
    ultimo_error: Optional[Exception] = None
    for candidato in candidatos:
        try:
            contenido = leer_fichero_ftp(
                db,
                config_id=int(getattr(config, "id")),
                tenant_id=tenant_id,
                path=carpeta,
                fichero=candidato,
                registrar=False,
            )
            nombre_respuesta = candidato
            break
        except Exception as exc:
            ultimo_error = exc
            continue

    if contenido is None or nombre_respuesta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontró el fichero de respuesta en SFTP: {str(ultimo_error)[:200]}",
        )

    def _iter():
        yield contenido

    return StreamingResponse(
        _iter(),
        media_type="application/x-bzip2",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre_respuesta}"',
            "Content-Length": str(len(contenido)),
        },
    )


class DeleteReobResponse(BaseModel):
    deleted: bool
    id: int


@router.delete("/reob-generados/{id}", response_model=DeleteReobResponse)
def delete_reob_generado(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Borra sólo un REOB generado. El AOB original y sus objeciones se
    mantienen. Útil cuando REE devuelve .bad y queremos regenerar un REOB
    corregido con el mismo AOB base."""
    from app.objeciones.models import ReobGenerado

    tenant_id = _effective_tenant(current_user)
    reob = db.query(ReobGenerado).filter(
        ReobGenerado.id == id,
        ReobGenerado.tenant_id == tenant_id,
    ).first()
    if reob is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="REOB no encontrado")

    # Verificar acceso a la empresa del REOB
    _get_empresa_id_verificado(db, int(getattr(reob, "empresa_id")), current_user)

    deleted = services.delete_reob_solo(
        db,
        reob_id=id,
        tenant_id=tenant_id,
    )
    return DeleteReobResponse(deleted=deleted, id=id)


class ToggleSftpResponse(BaseModel):
    nombre_fichero: str
    enviado_sftp_at: Optional[datetime] = None

class ToggleSftpPayload(BaseModel):
    empresa_id: int
    nombre_fichero: str

@router.patch("/toggle-sftp/{tipo}", response_model=ToggleSftpResponse)
def toggle_sftp(
    tipo: str,
    payload: ToggleSftpPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alterna manualmente el estado enviado_sftp_at de un fichero."""
    TIPOS_VALIDOS = {"agrecl", "incl", "cups", "cil"}
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tipo '{tipo}' no válido")
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    try:
        nuevo_valor = services.toggle_enviado_sftp(
            db,
            tipo=tipo,
            tenant_id=_effective_tenant(current_user),
            empresa_id=eid,
            nombre_fichero=payload.nombre_fichero,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ToggleSftpResponse(nombre_fichero=payload.nombre_fichero, enviado_sftp_at=nuevo_valor)


class EnviarSftpPayload(BaseModel):
    empresa_id: int
    nombre_fichero: str
    config_id: int
    directorio_destino: str

class EnviarSftpResponse(BaseModel):
    ok: bool
    filename: str
    config_id: int
    directorio_destino: str

@router.post("/{tipo}/enviar-sftp", response_model=EnviarSftpResponse)
def enviar_sftp(
    tipo: str,
    payload: EnviarSftpPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genera el REOB y lo sube al SFTP del concentrador secundario."""
    TIPOS_VALIDOS = {"agrecl", "incl", "cups", "cil"}
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tipo '{tipo}' no válido")
    eid = _get_empresa_id_verificado(db, payload.empresa_id, current_user)
    try:
        filename = services.enviar_al_sftp(
            db,
            tipo=tipo,
            tenant_id=_effective_tenant(current_user),
            empresa_id=eid,
            nombre_fichero=payload.nombre_fichero,
            config_id=payload.config_id,
            directorio_destino=payload.directorio_destino,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error SFTP: {str(exc)[:300]}") from exc
    return EnviarSftpResponse(
        ok=True,
        filename=filename,
        config_id=payload.config_id,
        directorio_destino=payload.directorio_destino,
    )


@router.post("/cil/generate")
def generate_cil(
    empresa_id: int = Query(...),
    nombre_fichero: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    empresa = _get_empresa_or_404(db, empresa_id)
    _assert_empresa_access(user=current_user, empresa=empresa)
    content, filename = services.generate_reobcil(db, tenant_id=_effective_tenant(current_user), empresa_id=empresa_id, nombre_fichero=nombre_fichero)
    return Response(content=content, media_type="application/x-bzip2", headers={"Content-Disposition": f"attachment; filename={filename}"})