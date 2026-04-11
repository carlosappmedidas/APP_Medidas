# app/topologia/routes.py
# pyright: reportMissingImports=false
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.tenants.models import User
from app.topologia import services
from app.topologia.models import LineaInventario, LineaTramo
from app.topologia.schemas import (
    CtInventarioRead,
    CtMapaRead,
    CupsMapaRead,
    ImportarTopologiaResponse,
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

    - b2  → Centros de transformación (ct_inventario)
    - b21 → Máquinas en CT (ct_transformador)
    - a1  → Puntos de suministro (cups_topologia)
    - b1  → Líneas eléctricas (linea_inventario)
    - b11 → Tramos GIS de líneas (linea_tramo)
    """
    _assert_not_viewer(current_user)

    if not b2 and not b21 and not a1 and not b1 and not b11:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes subir al menos uno de los ficheros: b2, b21, a1, b1 o b11",
        )

    contenido_b2  = await b2.read()  if b2  else None
    contenido_b21 = await b21.read() if b21 else None
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


# ── Mapa — CTs ────────────────────────────────────────────────────────────────

@router.get("/mapa/cts", response_model=List[CtMapaRead])
def get_cts_mapa(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> List[CtMapaRead]:
    _assert_not_viewer(current_user)
    return services.list_cts_mapa(  # type: ignore[return-value]
        db         = db,
        tenant_id  = _tenant_id(current_user),
        empresa_id = empresa_id,
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
        db         = db,
        tenant_id  = _tenant_id(current_user),
        empresa_id = empresa_id,
        id_ct      = id_ct,
    )


# ── Mapa — Tramos de línea ────────────────────────────────────────────────────

@router.get("/mapa/tramos", response_model=List[TramoMapaRead])
def get_tramos_mapa(
    empresa_id:   int           = Query(...),
    id_linea:     Optional[str] = Query(None, description="Filtrar por línea"),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> List[TramoMapaRead]:
    """
    Devuelve tramos GIS con coordenadas válidas para pintar la red en el mapa.
    Hace JOIN con linea_inventario para incluir los campos del B1 en el tooltip.
    Si se pasa id_linea filtra solo los tramos de esa línea.
    """
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)

    # JOIN: linea_tramo (B11) + linea_inventario (B1) por id_linea = id_tramo
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
            # B11
            id_tramo = tramo.id_tramo,
            id_linea = tramo.id_linea,
            lat_ini  = tramo.lat_ini,
            lon_ini  = tramo.lon_ini,
            lat_fin  = tramo.lat_fin,
            lon_fin  = tramo.lon_fin,
            # B1 — None si no se importó el B1
            cini                    = linea.cini                    if linea else None,
            codigo_ccuu             = linea.codigo_ccuu             if linea else None,
            tension_kv              = linea.tension_kv              if linea else None,
            tension_construccion_kv = linea.tension_construccion_kv if linea else None,
            longitud_km             = linea.longitud_km             if linea else None,
            resistencia_ohm         = linea.resistencia_ohm         if linea else None,
            reactancia_ohm          = linea.reactancia_ohm          if linea else None,
            intensidad_a            = linea.intensidad_a            if linea else None,
            propiedad               = linea.propiedad               if linea else None,
            operacion               = linea.operacion               if linea else None,
            causa_baja              = linea.causa_baja              if linea else None,
            fecha_aps               = linea.fecha_aps               if linea else None,
            fecha_baja              = linea.fecha_baja              if linea else None,
        ))

    return resultado


# ── Listado de CTs (para filtros y selectores) ────────────────────────────────

@router.get("/cts", response_model=List[CtInventarioRead])
def get_cts(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> List[CtInventarioRead]:
    _assert_not_viewer(current_user)
    return services.list_cts(  # type: ignore[return-value]
        db         = db,
        tenant_id  = _tenant_id(current_user),
        empresa_id = empresa_id,
    )
