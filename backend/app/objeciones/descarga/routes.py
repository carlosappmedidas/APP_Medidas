# app/objeciones/descarga/routes.py
# pyright: reportMissingImports=false, reportCallIssue=false, reportArgumentType=false, reportGeneralTypeIssues=false, reportAttributeAccessIssue=false

"""
Endpoints del submódulo "Descarga en Objeciones".

Por ahora solo expone GET /objeciones/descarga/buscar (FASE 3).
En FASE 4 se añadirá POST /objeciones/descarga/ejecutar.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth import get_current_user
from app.objeciones.descarga.services import buscar_ftp


router = APIRouter(
    prefix="/objeciones/descarga",
    tags=["objeciones-descarga"],
)


# ── GET /objeciones/descarga/buscar ───────────────────────────────────────────

@router.get("/buscar")
def buscar(
    empresa_id:    Optional[List[int]] = Query(default=None, description="Filtrar por empresas concretas. Si se omite, se buscan todas las accesibles al usuario."),
    periodo:       Optional[str]       = Query(default=None, description="Mes a buscar en formato YYYY-MM. Si se omite, últimos 6 meses."),
    nombre:        Optional[str]       = Query(default=None, description="Filtro de texto sobre el nombre del fichero (contiene, case-insensitive)."),
    db:            Session             = Depends(get_db),
    current_user                       = Depends(get_current_user),
):
    """
    Busca ficheros AOB en el SFTP de las empresas del tenant.

    Devuelve una lista de filas (una por versión de cada fichero AOB) con
    estado "nuevo" / "importado" / "actualizable" / "obsoleta".

    No descarga ni modifica nada — solo listado y cálculo de estado.
    """
    tenant_id = getattr(current_user, "tenant_id", None)
    if tenant_id is None:
        raise HTTPException(status_code=403, detail="Usuario sin tenant.")

    # Validación ligera del periodo (YYYY-MM).
    if periodo is not None:
        periodo = periodo.strip()
        if periodo == "":
            periodo = None
        else:
            partes = periodo.split("-")
            if len(partes) != 2 or len(partes[0]) != 4 or len(partes[1]) != 2 or not (partes[0] + partes[1]).isdigit():
                raise HTTPException(status_code=400, detail="Parámetro 'periodo' debe tener formato YYYY-MM.")

    resultados = buscar_ftp(
        db,
        tenant_id      = int(tenant_id),
        current_user   = current_user,
        empresa_ids    = empresa_id,
        periodo        = periodo,
        nombre_filtro  = nombre,
    )

    return {
        "total":      len(resultados),
        "resultados": resultados,
    }