# app/topologia/routes.py
# pyright: reportMissingImports=false, reportAttributeAccessIssue=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.tenants.models import User
from app.topologia import services
from app.topologia.models import CtInventario, LineaInventario, LineaTramo
from app.topologia.schemas import (
    AsignacionCtRequest,
    AsignacionFaseRequest,
    CalcAsignacionCtMtResponse,
    CalcAsignacionCtResponse,
    CeldaTablaRead,
    CtCeldaRead,
    CtDetalleRead,
    CtInventarioRead,
    CtMapaRead,
    CtTransformadorRead,
    CupsMapaRead,
    CupsTablaRead,
    ImportarTopologiaResponse,
    LineaTablaRead,
    TramoMapaRead,
)

router = APIRouter(prefix="/topologia", tags=["topologia"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant_id(user: User) -> int:
    return int(getattr(user, "tenant_id"))


def _assert_not_viewer(user: User) -> None:
    if str(getattr(user, "rol", "")) == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")


# ── Importación de ficheros CNMC ──────────────────────────────────────────────

@router.post("/importar", response_model=ImportarTopologiaResponse, status_code=status.HTTP_200_OK)
async def importar_topologia(
    empresa_id:       int                  = Form(...),
    anio_declaracion: int                  = Form(...),
    b2:               Optional[UploadFile] = File(None),
    b21:              Optional[UploadFile] = File(None),
    b22:              Optional[UploadFile] = File(None),
    a1:               Optional[UploadFile] = File(None),
    b1:               Optional[UploadFile] = File(None),
    b11:              Optional[UploadFile] = File(None),
    db:               Session              = Depends(get_db),
    current_user:     User                 = Depends(get_current_user),
) -> ImportarTopologiaResponse:
    """
    Importa los ficheros CNMC 8/2021 para una empresa.
    Se pueden subir todos o solo algunos ficheros a la vez.
    La reimportación actualiza registro a registro sin borrar datos.
    Al finalizar lanza automáticamente el cálculo de asociación CT BT y MT.
    """
    _assert_not_viewer(current_user)

    if not b2 and not b21 and not b22 and not a1 and not b1 and not b11:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes subir al menos uno de los ficheros: b2, b21, b22, a1, b1 o b11",
        )

    contenido_b2  = await b2.read()  if b2  else None
    contenido_b21 = await b21.read() if b21 else None
    contenido_b22 = await b22.read() if b22 else None
    contenido_a1  = await a1.read()  if a1  else None
    contenido_b1  = await b1.read()  if b1  else None
    contenido_b11 = await b11.read() if b11 else None

    try:
        resultado = services.importar_topologia(
            db               = db,
            tenant_id        = _tenant_id(current_user),
            empresa_id       = empresa_id,
            anio_declaracion = anio_declaracion,
            contenido_b2     = contenido_b2,
            contenido_b21    = contenido_b21,
            contenido_b22    = contenido_b22,
            contenido_a1     = contenido_a1,
            contenido_b1     = contenido_b1,
            contenido_b11    = contenido_b11,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error procesando ficheros: {str(exc)[:300]}",
        ) from exc

    return ImportarTopologiaResponse(**resultado)


# ── Cálculo de asociación CT BT ───────────────────────────────────────────────

@router.post("/calcular-ct", response_model=CalcAsignacionCtResponse, status_code=status.HTTP_200_OK)
def calcular_ct(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> CalcAsignacionCtResponse:
    """Recalcula la asociación CT → líneas BT y CUPS BT."""
    _assert_not_viewer(current_user)
    try:
        resultado = services.calcular_asociacion_ct(
            db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculando asociación CT BT: {str(exc)[:300]}",
        ) from exc
    return CalcAsignacionCtResponse(**resultado)


# ── Cálculo de asociación CT MT ───────────────────────────────────────────────

@router.post("/calcular-ct-mt", response_model=CalcAsignacionCtMtResponse, status_code=status.HTTP_200_OK)
def calcular_ct_mt(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> CalcAsignacionCtMtResponse:
    """Recalcula la asociación CT → líneas MT y CUPS MT."""
    _assert_not_viewer(current_user)
    try:
        resultado = services.calcular_asociacion_ct_mt(
            db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculando asociación CT MT: {str(exc)[:300]}",
        ) from exc
    return CalcAsignacionCtMtResponse(**resultado)


# ── Detalle de CT (datos + transformadores + celdas) ─────────────────────────

@router.get("/cts/{id_ct}/detalle", response_model=CtDetalleRead)
def get_ct_detalle(
    id_ct:        str,
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> CtDetalleRead:
    """Devuelve los datos completos de un CT junto con sus transformadores y celdas."""
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)

    ct = (
        db.query(CtInventario)
        .filter(
            CtInventario.tenant_id  == tid,
            CtInventario.empresa_id == empresa_id,
            CtInventario.id_ct      == id_ct,
        )
        .first()
    )
    if ct is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"CT {id_ct} no encontrado")

    transformadores = services.list_transformadores_ct(
        db=db, tenant_id=tid, empresa_id=empresa_id, id_ct=id_ct,
    )
    celdas = services.list_celdas_ct(
        db=db, tenant_id=tid, empresa_id=empresa_id, id_ct=id_ct,
    )

    return CtDetalleRead(
        ct              = CtInventarioRead.model_validate(ct),
        transformadores = [CtTransformadorRead.model_validate(t) for t in transformadores],
        celdas          = [CtCeldaRead.model_validate(c) for c in celdas],
    )


# ── Reasignación manual — CT de línea ─────────────────────────────────────────

@router.patch("/lineas/{id_tramo}/ct", status_code=status.HTTP_200_OK)
def reasignar_ct_linea(
    id_tramo:     str,
    payload:      AsignacionCtRequest,
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> dict:
    """Reasigna manualmente el CT de una línea. Enviar id_ct=null para limpiar."""
    _assert_not_viewer(current_user)
    try:
        services.reasignar_ct_linea(
            db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
            id_tramo=id_tramo, id_ct_nuevo=payload.id_ct or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {"ok": True, "id_tramo": id_tramo, "id_ct": payload.id_ct}


# ── Reasignación manual — CT de CUPS ─────────────────────────────────────────

@router.patch("/cups/{cups}/ct", status_code=status.HTTP_200_OK)
def reasignar_ct_cups(
    cups:         str,
    payload:      AsignacionCtRequest,
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> dict:
    """Reasigna manualmente el CT de un CUPS. Enviar id_ct=null para limpiar."""
    _assert_not_viewer(current_user)
    try:
        services.reasignar_ct_cups(
            db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
            cups=cups, id_ct_nuevo=payload.id_ct or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {"ok": True, "cups": cups, "id_ct": payload.id_ct}


# ── Asignación manual — fase de CUPS ─────────────────────────────────────────

@router.patch("/cups/{cups}/fase", status_code=status.HTTP_200_OK)
def reasignar_fase_cups(
    cups:         str,
    payload:      AsignacionFaseRequest,
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> dict:
    """Asigna la fase del CT (R/S/T/RST) a un CUPS. Enviar fase=null para limpiar."""
    _assert_not_viewer(current_user)
    try:
        services.reasignar_fase_cups(
            db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
            cups=cups, fase_nueva=payload.fase or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {"ok": True, "cups": cups, "fase": payload.fase}


# ── Tabla de líneas — paginación servidor ─────────────────────────────────────

@router.get("/tabla/lineas")
def get_tabla_lineas(
    empresa_id:   int           = Query(...),
    id_ct:        Optional[str] = Query(None, description="Filtrar por CT asignado"),
    sin_ct:       bool          = Query(False, description="Mostrar solo líneas sin CT"),
    metodo:       Optional[str] = Query(None, description="Filtrar por método: bfs/proximidad/nudo_alta/manual"),
    limit:        int           = Query(50, ge=1, le=500),
    offset:       int           = Query(0, ge=0),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    lineas, total = services.list_lineas_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        id_ct=id_ct, sin_ct=sin_ct, metodo=metodo, limit=limit, offset=offset,
    )
    return {"items": [LineaTablaRead.model_validate(linea) for linea in lineas], "total": total}


# ── Tabla de CUPS — paginación servidor ──────────────────────────────────────

@router.get("/tabla/cups")
def get_tabla_cups(
    empresa_id:   int           = Query(...),
    id_ct:        Optional[str] = Query(None, description="Filtrar por CT asignado"),
    sin_ct:       bool          = Query(False, description="Mostrar solo CUPS sin CT"),
    metodo:       Optional[str] = Query(None, description="Filtrar por método: nudo_linea/nudo_linea_mt/manual"),
    limit:        int           = Query(50, ge=1, le=500),
    offset:       int           = Query(0, ge=0),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    cups, total = services.list_cups_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        id_ct=id_ct, sin_ct=sin_ct, metodo=metodo, limit=limit, offset=offset,
    )
    return {"items": [CupsTablaRead.model_validate(c) for c in cups], "total": total}


# ── Tabla de Celdas — paginación servidor ─────────────────────────────────────

@router.get("/tabla/celdas")
def get_tabla_celdas(
    empresa_id:   int           = Query(...),
    id_ct:        Optional[str] = Query(None, description="Filtrar por CT"),
    limit:        int           = Query(50, ge=1, le=500),
    offset:       int           = Query(0, ge=0),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    celdas, total = services.list_celdas_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        id_ct=id_ct, limit=limit, offset=offset,
    )
    return {"items": [CeldaTablaRead.model_validate(c) for c in celdas], "total": total}


# ── Mapa — CTs ────────────────────────────────────────────────────────────────

@router.get("/mapa/cts", response_model=List[CtMapaRead])
def get_cts_mapa(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> List[CtMapaRead]:
    _assert_not_viewer(current_user)
    return services.list_cts_mapa(  # type: ignore[return-value]
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
    )


# ── Mapa — CUPS ───────────────────────────────────────────────────────────────

@router.get("/mapa/cups", response_model=List[CupsMapaRead])
def get_cups_mapa(
    empresa_id:   int           = Query(...),
    id_ct:        Optional[str] = Query(None),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> List[CupsMapaRead]:
    _assert_not_viewer(current_user)
    return services.list_cups_mapa(  # type: ignore[return-value]
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id, id_ct=id_ct,
    )


# ── Mapa — Tramos de línea ────────────────────────────────────────────────────

@router.get("/mapa/tramos", response_model=List[TramoMapaRead])
def get_tramos_mapa(
    empresa_id:   int           = Query(...),
    id_linea:     Optional[str] = Query(None, description="Filtrar por id_linea"),
    id_ct:        Optional[str] = Query(None, description="Filtrar por CT asignado a la línea"),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> List[TramoMapaRead]:
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)

    if id_ct is not None:
        q = (
            db.query(LineaTramo, LineaInventario)
            .join(
                LineaInventario,
                (LineaInventario.id_tramo   == LineaTramo.id_linea) &
                (LineaInventario.tenant_id  == LineaTramo.tenant_id) &
                (LineaInventario.empresa_id == LineaTramo.empresa_id),
            )
            .filter(
                LineaTramo.tenant_id  == tid,
                LineaTramo.empresa_id == empresa_id,
                LineaTramo.lat_ini.isnot(None),
                LineaTramo.lon_ini.isnot(None),
                LineaTramo.lat_fin.isnot(None),
                LineaTramo.lon_fin.isnot(None),
                LineaInventario.id_ct == id_ct,
            )
        )
    else:
        q = (
            db.query(LineaTramo, LineaInventario)
            .outerjoin(
                LineaInventario,
                (LineaInventario.id_tramo   == LineaTramo.id_linea) &
                (LineaInventario.tenant_id  == LineaTramo.tenant_id) &
                (LineaInventario.empresa_id == LineaTramo.empresa_id),
            )
            .filter(
                LineaTramo.tenant_id  == tid,
                LineaTramo.empresa_id == empresa_id,
                LineaTramo.lat_ini.isnot(None),
                LineaTramo.lon_ini.isnot(None),
                LineaTramo.lat_fin.isnot(None),
                LineaTramo.lon_fin.isnot(None),
            )
        )

    if id_linea is not None:
        q = q.filter(LineaTramo.id_linea == id_linea)

    q = q.order_by(LineaTramo.id_linea, LineaTramo.orden)
    filas = q.all()

    resultado = []
    for tramo, linea in filas:
        resultado.append(TramoMapaRead(
            id_tramo  = tramo.id_tramo,
            id_linea  = tramo.id_linea,
            orden     = tramo.orden,
            num_tramo = tramo.num_tramo,
            lat_ini   = tramo.lat_ini,
            lon_ini   = tramo.lon_ini,
            lat_fin   = tramo.lat_fin,
            lon_fin   = tramo.lon_fin,
            cini                    = linea.cini                    if linea else None,
            codigo_ccuu             = linea.codigo_ccuu             if linea else None,
            nudo_inicio             = linea.nudo_inicio             if linea else None,
            nudo_fin                = linea.nudo_fin                if linea else None,
            ccaa_1                  = linea.ccaa_1                  if linea else None,
            tension_kv              = linea.tension_kv              if linea else None,
            tension_construccion_kv = linea.tension_construccion_kv if linea else None,
            longitud_km             = linea.longitud_km             if linea else None,
            resistencia_ohm         = linea.resistencia_ohm         if linea else None,
            reactancia_ohm          = linea.reactancia_ohm          if linea else None,
            intensidad_a            = linea.intensidad_a            if linea else None,
            propiedad               = linea.propiedad               if linea else None,
            estado                  = linea.estado                  if linea else None,
            operacion               = linea.operacion               if linea else None,
            punto_frontera          = linea.punto_frontera          if linea else None,
            modelo                  = linea.modelo                  if linea else None,
            causa_baja              = linea.causa_baja              if linea else None,
            fecha_aps               = linea.fecha_aps               if linea else None,
            fecha_baja              = linea.fecha_baja              if linea else None,
            fecha_ip                = linea.fecha_ip                if linea else None,
            tipo_inversion          = linea.tipo_inversion          if linea else None,
            motivacion              = linea.motivacion              if linea else None,
            im_tramites             = linea.im_tramites             if linea else None,
            im_construccion         = linea.im_construccion         if linea else None,
            im_trabajos             = linea.im_trabajos             if linea else None,
            valor_auditado          = linea.valor_auditado          if linea else None,
            financiado              = linea.financiado              if linea else None,
            subvenciones_europeas   = linea.subvenciones_europeas   if linea else None,
            subvenciones_nacionales = linea.subvenciones_nacionales if linea else None,
            subvenciones_prtr       = linea.subvenciones_prtr       if linea else None,
            cuenta                  = linea.cuenta                  if linea else None,
            avifauna                = linea.avifauna                if linea else None,
            identificador_baja      = linea.identificador_baja      if linea else None,
            id_ct                   = linea.id_ct                   if linea else None,
            metodo_asignacion_ct    = linea.metodo_asignacion_ct    if linea else None,
        ))

    return resultado


# ── Listado de líneas disponibles ─────────────────────────────────────────────

@router.get("/mapa/lineas", response_model=List[str])
def get_lineas_disponibles(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> List[str]:
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)
    filas = (
        db.query(LineaTramo.id_linea)
        .filter(
            LineaTramo.tenant_id  == tid,
            LineaTramo.empresa_id == empresa_id,
            LineaTramo.id_linea.isnot(None),
        )
        .distinct()
        .order_by(LineaTramo.id_linea)
        .all()
    )
    return [f[0] for f in filas if f[0]]


# ── Listado de CTs ────────────────────────────────────────────────────────────

@router.get("/cts", response_model=List[CtInventarioRead])
def get_cts(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> List[CtInventarioRead]:
    _assert_not_viewer(current_user)
    return services.list_cts(  # type: ignore[return-value]
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
    )
