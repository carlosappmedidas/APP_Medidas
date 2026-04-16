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
    CtCreateRequest,
    CtCreateResponse,
    CtTablaRead,
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
    TramoTablaRead,
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

# ── Crear CT manual ───────────────────────────────────────────────────────────

@router.post("/cts", response_model=CtCreateResponse, status_code=status.HTTP_201_CREATED)
def crear_ct(
    payload:      CtCreateRequest,
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> CtCreateResponse:
    """Crea un nuevo CT manualmente con todos los campos del B2."""
    _assert_not_viewer(current_user)
    try:
        services.crear_ct(
            db=db,
            tenant_id=_tenant_id(current_user),
            empresa_id=empresa_id,
            datos=payload.model_dump(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    return CtCreateResponse(ok=True, id_ct=payload.id_ct, accion="insertado")


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
    busqueda:     Optional[str] = Query(None),
    id_ct:        Optional[str] = Query(None),
    sin_ct:       bool          = Query(False),
    metodo:       Optional[str] = Query(None),
    f_cini:       Optional[str] = Query(None),
    f_codigo_ccuu: Optional[str] = Query(None),
    f_nudo_inicio: Optional[str] = Query(None),
    f_nudo_fin:   Optional[str] = Query(None),
    f_tension_kv: Optional[str] = Query(None),
    f_tension_construccion_kv: Optional[str] = Query(None),
    f_fecha_baja: Optional[str] = Query(None),
    f_fecha_aps:  Optional[str] = Query(None),
    f_fecha_ip:   Optional[str] = Query(None),
    f_ccaa_1:     Optional[str] = Query(None),
    f_ccaa_2:     Optional[str] = Query(None),
    f_modelo:     Optional[str] = Query(None),
    f_causa_baja: Optional[str] = Query(None),
    f_motivacion: Optional[str] = Query(None),
    f_cuenta:     Optional[str] = Query(None),
    f_identificador_baja: Optional[str] = Query(None),
    f_id_ct:      Optional[str] = Query(None),
    f_metodo_asignacion: Optional[str] = Query(None),
    f_propiedad:  Optional[str] = Query(None),
    f_estado:     Optional[str] = Query(None),
    f_punto_frontera: Optional[str] = Query(None),
    f_operacion:  Optional[str] = Query(None),
    f_tipo_inversion: Optional[str] = Query(None),
    f_longitud_km: Optional[str] = Query(None),
    f_im_tramites: Optional[str] = Query(None),
    f_im_construccion: Optional[str] = Query(None),
    f_im_trabajos: Optional[str] = Query(None),
    f_valor_auditado: Optional[str] = Query(None),
    f_financiado: Optional[str] = Query(None),
    f_subvenciones_europeas: Optional[str] = Query(None),
    f_subvenciones_nacionales: Optional[str] = Query(None),
    f_subvenciones_prtr: Optional[str] = Query(None),
    f_avifauna:   Optional[str] = Query(None),
    f_resistencia_ohm: Optional[str] = Query(None),
    f_reactancia_ohm: Optional[str] = Query(None),
    f_intensidad_a: Optional[str] = Query(None),
    limit:        int           = Query(50, ge=1, le=500),
    offset:       int           = Query(0, ge=0),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    lineas, total = services.list_lineas_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        id_ct=id_ct, sin_ct=sin_ct, metodo=metodo, busqueda=busqueda,
        f_cini=f_cini, f_codigo_ccuu=f_codigo_ccuu,
        f_nudo_inicio=f_nudo_inicio, f_nudo_fin=f_nudo_fin,
        f_tension_kv=f_tension_kv, f_tension_construccion_kv=f_tension_construccion_kv,
        f_fecha_baja=f_fecha_baja, f_fecha_aps=f_fecha_aps, f_fecha_ip=f_fecha_ip,
        f_ccaa_1=f_ccaa_1, f_ccaa_2=f_ccaa_2, f_modelo=f_modelo,
        f_causa_baja=f_causa_baja, f_motivacion=f_motivacion,
        f_cuenta=f_cuenta, f_identificador_baja=f_identificador_baja,
        f_id_ct=f_id_ct, f_metodo_asignacion=f_metodo_asignacion,
        f_propiedad=f_propiedad, f_estado=f_estado,
        f_punto_frontera=f_punto_frontera, f_operacion=f_operacion,
        f_tipo_inversion=f_tipo_inversion, f_longitud_km=f_longitud_km,
        f_im_tramites=f_im_tramites, f_im_construccion=f_im_construccion,
        f_im_trabajos=f_im_trabajos, f_valor_auditado=f_valor_auditado,
        f_financiado=f_financiado, f_subvenciones_europeas=f_subvenciones_europeas,
        f_subvenciones_nacionales=f_subvenciones_nacionales, f_subvenciones_prtr=f_subvenciones_prtr,
        f_avifauna=f_avifauna,
        f_resistencia_ohm=f_resistencia_ohm,
        f_reactancia_ohm=f_reactancia_ohm,
        f_intensidad_a=f_intensidad_a,
        limit=limit, offset=offset,

    )
    return {"items": [LineaTablaRead.model_validate(linea) for linea in lineas], "total": total}


# ── Tabla de CUPS — paginación servidor ──────────────────────────────────────

@router.get("/tabla/cups")
def get_tabla_cups(
    empresa_id:   int           = Query(...),
    busqueda:     Optional[str] = Query(None),
    id_ct:        Optional[str] = Query(None),
    sin_ct:       bool          = Query(False),
    metodo:       Optional[str] = Query(None),
    f_tarifa:     Optional[str] = Query(None),
    f_municipio:  Optional[str] = Query(None),
    f_provincia:  Optional[str] = Query(None),
    f_tension_kv: Optional[str] = Query(None),
    f_id_ct_asignado: Optional[str] = Query(None),
    f_fase:       Optional[str] = Query(None),
    f_cnae:       Optional[str] = Query(None),
    f_zona:       Optional[str] = Query(None),
    f_conexion:   Optional[str] = Query(None),
    f_id_ct_origen: Optional[str] = Query(None),
    f_cini_contador: Optional[str] = Query(None),
    f_fecha_alta: Optional[str] = Query(None),
    f_cau:        Optional[str] = Query(None),
    f_cod_auto:   Optional[str] = Query(None),
    f_metodo_asignacion: Optional[str] = Query(None),
    f_estado_contrato: Optional[str] = Query(None),
    f_potencia_contratada: Optional[str] = Query(None),
    f_potencia_adscrita: Optional[str] = Query(None),
    f_energia_activa: Optional[str] = Query(None),
    f_energia_reactiva: Optional[str] = Query(None),
    f_autoconsumo: Optional[str] = Query(None),
    f_lecturas:   Optional[str] = Query(None),
    f_baja_suministro: Optional[str] = Query(None),
    f_cambio_titularidad: Optional[str] = Query(None),
    f_facturas_estimadas: Optional[str] = Query(None),
    f_facturas_total: Optional[str] = Query(None),
    f_cod_generacion: Optional[str] = Query(None),
    f_conexion_autoconsumo: Optional[str] = Query(None),
    f_energia_autoconsumida: Optional[str] = Query(None),
    f_energia_excedentaria: Optional[str] = Query(None),
    limit:        int           = Query(50, ge=1, le=500),
    offset:       int           = Query(0, ge=0),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    cups, total = services.list_cups_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        id_ct=id_ct, sin_ct=sin_ct, metodo=metodo, busqueda=busqueda,
        f_tarifa=f_tarifa, f_municipio=f_municipio, f_provincia=f_provincia,
        f_tension_kv=f_tension_kv, f_id_ct_asignado=f_id_ct_asignado,
        f_fase=f_fase, f_cnae=f_cnae, f_zona=f_zona,
        f_conexion=f_conexion, f_id_ct_origen=f_id_ct_origen,
        f_cini_contador=f_cini_contador, f_fecha_alta=f_fecha_alta,
        f_cau=f_cau, f_cod_auto=f_cod_auto,
        f_metodo_asignacion=f_metodo_asignacion,
        f_estado_contrato=f_estado_contrato, f_potencia_contratada=f_potencia_contratada,
        f_potencia_adscrita=f_potencia_adscrita, f_energia_activa=f_energia_activa,
        f_energia_reactiva=f_energia_reactiva, f_autoconsumo=f_autoconsumo,
        f_lecturas=f_lecturas, f_baja_suministro=f_baja_suministro,
        f_cambio_titularidad=f_cambio_titularidad, f_facturas_estimadas=f_facturas_estimadas,
        f_facturas_total=f_facturas_total, f_cod_generacion=f_cod_generacion,
        f_conexion_autoconsumo=f_conexion_autoconsumo, f_energia_autoconsumida=f_energia_autoconsumida,
        f_energia_excedentaria=f_energia_excedentaria,
        limit=limit, offset=offset,
    )
    return {"items": [CupsTablaRead.model_validate(c) for c in cups], "total": total}


# ── Tabla de Celdas — paginación servidor ─────────────────────────────────────

@router.get("/tabla/celdas")
def get_tabla_celdas(
    empresa_id:   int           = Query(...),
    busqueda:     Optional[str] = Query(None),
    id_ct:        Optional[str] = Query(None),
    f_funcion:    Optional[str] = Query(None),
    f_tipo_posicion: Optional[str] = Query(None),
    f_ubicacion:  Optional[str] = Query(None),
    f_cini:       Optional[str] = Query(None),
    f_id_celda:   Optional[str] = Query(None),
    f_id_transformador: Optional[str] = Query(None),
    f_tension_nominal: Optional[str] = Query(None),
    f_tension_rango: Optional[str] = Query(None),
    f_posicion:   Optional[str] = Query(None),
    f_en_servicio: Optional[str] = Query(None),
    f_anio_instalacion: Optional[str] = Query(None),
    limit:        int           = Query(50, ge=1, le=500),
    offset:       int           = Query(0, ge=0),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    celdas, total = services.list_celdas_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        id_ct=id_ct, busqueda=busqueda,
        f_funcion=f_funcion, f_tipo_posicion=f_tipo_posicion,
        f_ubicacion=f_ubicacion, f_cini=f_cini,
        f_id_celda=f_id_celda, f_id_transformador=f_id_transformador,
        f_tension_nominal=f_tension_nominal, f_tension_rango=f_tension_rango,
        f_posicion=f_posicion, f_en_servicio=f_en_servicio,
        f_anio_instalacion=f_anio_instalacion,
        limit=limit, offset=offset,
    )
    return {"items": [CeldaTablaRead.model_validate(c) for c in celdas], "total": total}


# ── Mapa — CTs ────────────────────────────────────────────────────────────────

# ── Tabla de CTs — paginación servidor ────────────────────────────────────────

@router.get("/tabla/cts")
def get_tabla_cts(
    empresa_id:   int           = Query(...),
    busqueda:     Optional[str] = Query(None),
    f_municipio:  Optional[str] = Query(None),
    f_provincia:  Optional[str] = Query(None),
    f_tension_kv: Optional[str] = Query(None),
    f_fecha_baja: Optional[str] = Query(None),
    f_cini:       Optional[str] = Query(None),
    f_zona:       Optional[str] = Query(None),
    f_codigo_ccuu: Optional[str] = Query(None),
    f_nudo_alta:  Optional[str] = Query(None),
    f_nudo_baja:  Optional[str] = Query(None),
    f_modelo:     Optional[str] = Query(None),
    f_causa_baja: Optional[str] = Query(None),
    f_fecha_aps:  Optional[str] = Query(None),
    f_fecha_ip:   Optional[str] = Query(None),
    f_motivacion: Optional[str] = Query(None),
    f_cuenta:     Optional[str] = Query(None),
    f_identificador_baja: Optional[str] = Query(None),
    f_ccaa:       Optional[str] = Query(None),
    f_propiedad:  Optional[str] = Query(None),
    f_tension_construccion: Optional[str] = Query(None),
    f_potencia:   Optional[str] = Query(None),
    f_estado:     Optional[str] = Query(None),
    f_punto_frontera: Optional[str] = Query(None),
    f_tipo_inversion: Optional[str] = Query(None),
    f_im_tramites: Optional[str] = Query(None),
    f_im_construccion: Optional[str] = Query(None),
    f_im_trabajos: Optional[str] = Query(None),
    f_subvenciones_europeas: Optional[str] = Query(None),
    f_subvenciones_nacionales: Optional[str] = Query(None),
    f_subvenciones_prtr: Optional[str] = Query(None),
    f_valor_auditado: Optional[str] = Query(None),
    f_financiado: Optional[str] = Query(None),
    f_avifauna:   Optional[str] = Query(None),
    limit:        int           = Query(50, ge=1, le=500),

    offset:       int           = Query(0, ge=0),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    items, total = services.list_cts_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        busqueda=busqueda, f_municipio=f_municipio, f_provincia=f_provincia,
        f_tension_kv=f_tension_kv, f_fecha_baja=f_fecha_baja,
        f_cini=f_cini, f_zona=f_zona, f_codigo_ccuu=f_codigo_ccuu,
        f_nudo_alta=f_nudo_alta, f_nudo_baja=f_nudo_baja,
        f_modelo=f_modelo, f_causa_baja=f_causa_baja,
        f_fecha_aps=f_fecha_aps, f_fecha_ip=f_fecha_ip,
        f_motivacion=f_motivacion, f_cuenta=f_cuenta,
        f_identificador_baja=f_identificador_baja,
        f_ccaa=f_ccaa, f_propiedad=f_propiedad,
        f_tension_construccion=f_tension_construccion, f_potencia=f_potencia,
        f_estado=f_estado, f_punto_frontera=f_punto_frontera,
        f_tipo_inversion=f_tipo_inversion, f_im_tramites=f_im_tramites,
        f_im_construccion=f_im_construccion, f_im_trabajos=f_im_trabajos,
        f_subvenciones_europeas=f_subvenciones_europeas, f_subvenciones_nacionales=f_subvenciones_nacionales,
        f_subvenciones_prtr=f_subvenciones_prtr, f_valor_auditado=f_valor_auditado,
        f_financiado=f_financiado, f_avifauna=f_avifauna,
        limit=limit, offset=offset,
    )
    return {"items": [CtTablaRead(**item) for item in items], "total": total}

# ── Tabla de Tramos — paginación servidor ─────────────────────────────────────

@router.get("/tabla/tramos")
def get_tabla_tramos(
    empresa_id:   int           = Query(...),
    busqueda:     Optional[str] = Query(None),
    id_ct:        Optional[str] = Query(None),
    f_id_linea:   Optional[str] = Query(None),
    f_tension_kv: Optional[str] = Query(None),
    f_cini:       Optional[str] = Query(None),
    f_codigo_ccuu: Optional[str] = Query(None),
    f_nudo_inicio: Optional[str] = Query(None),
    f_nudo_fin:   Optional[str] = Query(None),
    f_ccaa_1:     Optional[str] = Query(None),
    f_ccaa_2:     Optional[str] = Query(None),
    f_id_ct:      Optional[str] = Query(None),
    f_metodo_asignacion: Optional[str] = Query(None),
    f_orden:      Optional[str] = Query(None),
    f_num_tramo:  Optional[str] = Query(None),
    f_longitud_km: Optional[str] = Query(None),
    limit:        int           = Query(50, ge=1, le=500),

    offset:       int           = Query(0, ge=0),
    db:           Session       = Depends(get_db),
    current_user: User          = Depends(get_current_user),
) -> Dict[str, Any]:
    _assert_not_viewer(current_user)
    items, total = services.list_tramos_tabla(
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
        id_ct=id_ct, busqueda=busqueda,
        f_id_linea=f_id_linea, f_tension_kv=f_tension_kv,
        f_cini=f_cini, f_codigo_ccuu=f_codigo_ccuu,
        f_nudo_inicio=f_nudo_inicio, f_nudo_fin=f_nudo_fin,
        f_ccaa_1=f_ccaa_1, f_ccaa_2=f_ccaa_2,
        f_id_ct=f_id_ct, f_metodo_asignacion=f_metodo_asignacion,
        f_orden=f_orden, f_num_tramo=f_num_tramo, f_longitud_km=f_longitud_km,
        limit=limit, offset=offset,
    )
    return {"items": [TramoTablaRead(**item) for item in items], "total": total}



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
            ccaa_2                  = linea.ccaa_2                  if linea else None,
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


# ── Mapa — CTs de baja ────────────────────────────────────────────────────────

@router.get("/mapa/cts/baja", response_model=List[CtMapaRead])
def get_cts_mapa_baja(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> List[CtMapaRead]:
    """CTs con fecha_baja IS NOT NULL."""
    _assert_not_viewer(current_user)
    return services.list_cts_mapa_baja(  # type: ignore[return-value]
        db=db, tenant_id=_tenant_id(current_user), empresa_id=empresa_id,
    )


# ── Mapa — Tramos de baja ─────────────────────────────────────────────────────

@router.get("/mapa/tramos/baja", response_model=List[TramoMapaRead])
def get_tramos_mapa_baja(
    empresa_id:   int     = Query(...),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
) -> List[TramoMapaRead]:
    """Tramos GIS cuya línea tiene fecha_baja IS NOT NULL."""
    _assert_not_viewer(current_user)
    tid = _tenant_id(current_user)
    tramos = services.list_tramos_mapa_baja(
        db=db, tenant_id=tid, empresa_id=empresa_id,
    )
    resultado = []
    for tramo in tramos:
        linea = (
            db.query(LineaInventario)
            .filter(
                LineaInventario.tenant_id  == tid,
                LineaInventario.empresa_id == empresa_id,
                LineaInventario.id_tramo   == tramo.id_linea,
            )
            .first()
        )
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
            ccaa_2                  = linea.ccaa_2                  if linea else None,
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
