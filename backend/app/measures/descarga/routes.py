# app/measures/descarga/routes.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false

"""
Endpoints del submódulo "Descarga de Publicaciones REE" (BALD).

  GET  /measures/descarga/buscar
  POST /measures/descarga/ejecutar
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth import get_current_user
from app.measures.descarga.services import buscar_ftp, descargar_e_importar


router = APIRouter(
    prefix="/measures/descarga",
    tags=["measures-descarga"],
)


# ── GET /measures/descarga/buscar ─────────────────────────────────────────────

@router.get("/buscar")
def buscar(
    empresa_id:    Optional[List[int]] = Query(default=None, description="Filtrar por empresas concretas. Si se omite, se buscan todas las accesibles al usuario."),
    periodo:       Optional[str]       = Query(default=None, description="Mes a buscar en formato YYYY-MM. Si se omite, no filtra por mes."),
    fecha_desde:   Optional[str]       = Query(default=None, description="Fecha publicación SFTP mínima (YYYY-MM-DD)."),
    fecha_hasta:   Optional[str]       = Query(default=None, description="Fecha publicación SFTP máxima (YYYY-MM-DD)."),
    nombre:        Optional[str]       = Query(default=None, description="Filtro de texto sobre el nombre del fichero (contiene, case-insensitive)."),
    db:            Session             = Depends(get_db),
    current_user                       = Depends(get_current_user),
):
    """
    Busca ficheros BALD publicados por REE en el SFTP de las empresas del tenant.
    """
    tenant_id = getattr(current_user, "tenant_id", None)
    if tenant_id is None:
        raise HTTPException(status_code=403, detail="Usuario sin tenant.")

    if periodo is not None:
        periodo = periodo.strip()
        if periodo == "":
            periodo = None
        else:
            partes = periodo.split("-")
            if len(partes) != 2 or len(partes[0]) != 4 or len(partes[1]) != 2 or not (partes[0] + partes[1]).isdigit():
                raise HTTPException(status_code=400, detail="Parámetro 'periodo' debe tener formato YYYY-MM.")

    def _validar_fecha(val: Optional[str], nombre_param: str) -> Optional[str]:
        if val is None:
            return None
        val = val.strip()
        if val == "":
            return None
        partes = val.split("-")
        if len(partes) != 3 or len(partes[0]) != 4 or len(partes[1]) != 2 or len(partes[2]) != 2 \
                or not "".join(partes).isdigit():
            raise HTTPException(
                status_code=400,
                detail=f"Parámetro '{nombre_param}' debe tener formato YYYY-MM-DD.",
            )
        return val

    fecha_desde = _validar_fecha(fecha_desde, "fecha_desde")
    fecha_hasta = _validar_fecha(fecha_hasta, "fecha_hasta")

    resultados = buscar_ftp(
        db,
        tenant_id      = int(tenant_id),
        current_user   = current_user,
        empresa_ids    = empresa_id,
        periodo        = periodo,
        nombre_filtro  = nombre,
        fecha_desde    = fecha_desde,
        fecha_hasta    = fecha_hasta,
    )

    return {
        "total":      len(resultados),
        "resultados": resultados,
    }


# ── POST /measures/descarga/ejecutar ──────────────────────────────────────────

class EjecutarItemPayload(BaseModel):
    empresa_id: int = Field(..., description="ID de la empresa propietaria del fichero.")
    config_id:  int = Field(..., description="ID de la FtpConfig desde la que se descarga.")
    ruta_sftp:  str = Field(..., description="Carpeta SFTP donde está el fichero.")
    nombre:     str = Field(..., description="Nombre completo del fichero, incluyendo '.N' y opcional '.bz2'.")
    estado:     Optional[str] = Field(default=None, description="Estado declarado por el cliente (informativo).")


class EjecutarPayload(BaseModel):
    items:   List[EjecutarItemPayload] = Field(..., description="Lista de ficheros a descargar + importar.")
    replace: bool = Field(default=False, description="Si es True, autoriza reemplazar versiones antigas ya importadas.")


class EjecutarDetalleResponse(BaseModel):
    nombre:    str
    resultado: str = Field(..., description="ok | reemplazado | error")
    mensaje:   str


class EjecutarResponse(BaseModel):
    importados:    int
    reemplazados:  int
    errores:       int
    detalle:       List[EjecutarDetalleResponse]
    logs:          List[str] = Field(default_factory=list, description="Líneas de log con timestamp ISO, mismo formato que CargaSection.")


@router.post("/ejecutar", response_model=EjecutarResponse)
def ejecutar(
    payload:      EjecutarPayload,
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """
    Descarga del SFTP los ficheros BALD indicados y los importa a BD.
    """
    tenant_id = getattr(current_user, "tenant_id", None)
    if tenant_id is None:
        raise HTTPException(status_code=403, detail="Usuario sin tenant.")

    if not payload.items:
        raise HTTPException(status_code=400, detail="La lista 'items' no puede estar vacía.")

    items_dicts = [i.model_dump() for i in payload.items]

    resumen = descargar_e_importar(
        db,
        tenant_id    = int(tenant_id),
        current_user = current_user,
        items        = items_dicts,
        replace      = bool(payload.replace),
    )

    return resumen