# app/ingestion/routes.py
# pyright: reportMissingImports=false
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, cast

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.core.auth import get_current_active_superuser, get_current_user
from app.core.db import get_db
from app.empresas.models import Empresa
from app.ingestion.delete_services import (
    apply_ingestion_filters,
    build_delete_preview,
    execute_delete,
)
from app.ingestion.models import IngestionFile
from app.ingestion.schemas import IngestionFileCreate, IngestionFileRead
from app.ingestion.services import process_ingestion_file
from app.ingestion.utils import (
    infer_period_from_filename,
    find_existing_ingestion_file,
    safe_unlink,
)
from app.tenants.models import User

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

UPLOAD_BASE_PATH = Path("data/ingestion")


@router.post(
    "/files/upload",
    response_model=IngestionFileRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    empresa_id: int = Form(...),
    tipo: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tipo_norm = (tipo or "").upper()
    tenant_id_int = cast(int, current_user.tenant_id)

    empresa = (
        db.query(Empresa)
        .filter(
            Empresa.id == empresa_id,
            Empresa.tenant_id == tenant_id_int,
        )
        .first()
    )
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada para este tenant",
        )
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El fichero debe tener un nombre",
        )

    try:
        anio, mes = infer_period_from_filename(tipo_norm, file.filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    existing = find_existing_ingestion_file(
        db,
        tenant_id=tenant_id_int,
        empresa_id=empresa_id,
        tipo=tipo_norm,
        anio=anio,
        mes=mes,
        filename=file.filename if tipo_norm == "BALD" else None,
    )

    dest_dir = (
        UPLOAD_BASE_PATH
        / f"tenant_{tenant_id_int}"
        / f"empresa_{empresa_id}"
        / tipo_norm
        / f"{anio}{mes:02d}"
    )
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename

    with dest_path.open("wb") as buffer:
        import shutil
        shutil.copyfileobj(file.file, buffer)

    storage_key = str(dest_path)

    if existing:
        old_storage_key = cast(str, getattr(existing, "storage_key", None) or "")
        ex = cast(Any, existing)
        ex.filename = file.filename
        ex.storage_key = storage_key
        ex.tipo = tipo_norm
        ex.anio = anio
        ex.mes = mes
        ex.status = IngestionFile.STATUS_PENDING
        ex.rows_ok = 0
        ex.rows_error = 0
        ex.error_message = None
        ex.processed_at = None
        ex.updated_at = datetime.utcnow()
        ex.warnings_json = None
        db.commit()
        db.refresh(existing)
        if old_storage_key and old_storage_key != storage_key:
            safe_unlink(old_storage_key)
        return existing

    ingestion_data: dict[str, Any] = {
        "tenant_id": tenant_id_int,
        "empresa_id": empresa_id,
        "tipo": tipo_norm,
        "anio": anio,
        "mes": mes,
        "filename": file.filename,
        "storage_key": storage_key,
        "status": IngestionFile.STATUS_PENDING,
        "uploaded_by": cast(int, current_user.id),
        "warnings_json": None,
    }
    ingestion = IngestionFile(**ingestion_data)  # type: ignore[arg-type]
    db.add(ingestion)
    db.commit()
    db.refresh(ingestion)
    return ingestion


@router.post(
    "/files",
    response_model=IngestionFileRead,
    status_code=status.HTTP_201_CREATED,
)
def register_file(
    data: IngestionFileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)

    empresa = (
        db.query(Empresa)
        .filter(
            Empresa.id == data.empresa_id,
            Empresa.tenant_id == tenant_id_int,
        )
        .first()
    )
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada para este tenant",
        )

    tipo_norm = str(data.tipo).upper()

    existing = find_existing_ingestion_file(
        db,
        tenant_id=tenant_id_int,
        empresa_id=data.empresa_id,
        tipo=tipo_norm,
        anio=data.anio,
        mes=data.mes,
        filename=data.filename if tipo_norm == "BALD" else None,
    )

    if existing:
        ex = cast(Any, existing)
        ex.filename = data.filename
        ex.storage_key = data.storage_key
        ex.tipo = tipo_norm
        ex.anio = data.anio
        ex.mes = data.mes
        ex.status = IngestionFile.STATUS_PENDING
        ex.rows_ok = 0
        ex.rows_error = 0
        ex.error_message = None
        ex.processed_at = None
        ex.updated_at = datetime.utcnow()
        ex.warnings_json = None
        db.commit()
        db.refresh(existing)
        return existing

    ingestion_data: dict[str, Any] = {
        "tenant_id": tenant_id_int,
        "empresa_id": data.empresa_id,
        "tipo": tipo_norm,
        "anio": data.anio,
        "mes": data.mes,
        "filename": data.filename,
        "storage_key": data.storage_key,
        "status": IngestionFile.STATUS_PENDING,
        "uploaded_by": cast(int, current_user.id),
        "warnings_json": None,
    }
    ingestion = IngestionFile(**ingestion_data)  # type: ignore[arg-type]
    db.add(ingestion)
    db.commit()
    db.refresh(ingestion)
    return ingestion


@router.get("/files", response_model=list[IngestionFileRead])
def list_files(
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)
    query = db.query(IngestionFile).filter(
        IngestionFile.tenant_id == tenant_id_int,
    )
    query = apply_ingestion_filters(
        query,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )
    query = query.order_by(
        IngestionFile.anio.desc(),
        IngestionFile.mes.desc(),
        IngestionFile.id.desc(),
    )
    return query.all()


@router.get("/files/delete-preview")
def delete_files_preview(
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    _ = current_user
    return build_delete_preview(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )


@router.delete("/files")
def delete_files(
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    _ = current_user
    return execute_delete(
        db,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )


@router.post(
    "/files/{file_id}/process",
    response_model=IngestionFileRead,
    status_code=status.HTTP_200_OK,
)
def process_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)
    ingestion = (
        db.query(IngestionFile)
        .filter(
            IngestionFile.id == file_id,
            IngestionFile.tenant_id == tenant_id_int,
        )
        .first()
    )
    if not ingestion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichero de ingestion no encontrado",
        )
    return process_ingestion_file(
        db=db,
        ingestion=ingestion,
        tenant_id=tenant_id_int,
    )