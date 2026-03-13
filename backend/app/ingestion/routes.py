# app/ingestion/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import Any, cast
from pathlib import Path
import shutil
import re
import json

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    UploadFile,
    File,
    Form,
)
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.db import get_db
from app.core.auth import get_current_user, get_current_active_superuser
from app.core.config import get_settings
from app.ingestion.models import IngestionFile
from app.ingestion.schemas import (
    IngestionFileCreate,
    IngestionFileRead,
)
from app.tenants.models import User
from app.empresas.models import Empresa
from app.ingestion.services import (
    procesar_fichero_bald,
    procesar_fichero_m1_desde_csv,
    procesar_fichero_m1_autoconsumo_desde_csv,
    procesar_fichero_acumcil_generacion,
    procesar_fichero_acum_h2_grd_generacion,
    procesar_fichero_acum_h2_gen_generacion,
    procesar_fichero_acum_h2_rdd_p1_frontera_dd,
    procesar_fichero_acum_h2_rdd_p2_frontera_dd,
    procesar_fichero_acum_h2_rdd_pf_kwh,
    procesar_fichero_ps,
)
from app.measures.models import MedidaGeneral, MedidaPS
from app.measures.m1_models import M1PeriodContribution
from app.measures.ps_models import PSPeriodContribution
from app.measures.ps_detail_models import PSPeriodDetail

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

UPLOAD_BASE_PATH = Path("data/ingestion")


def _infer_period_from_filename(tipo: str, filename: str) -> tuple[int, int]:
    tipo_norm = (tipo or "").upper()
    name = str(filename)

    if tipo_norm in {"M1_AUTOCONSUMO", "ACUMCIL"}:
        m = re.search(r"_(\d{4})(\d{2})_", name)
        if m:
            return int(m.group(1)), int(m.group(2))

    if tipo_norm == "M1":
        m = re.search(r"_(\d{4})(\d{2})", name)
        if m:
            return int(m.group(1)), int(m.group(2))

    if tipo_norm == "BALD":
        m = re.search(r"BALD_\d+_(\d{6})_", name.upper())
        if m:
            periodo_str = m.group(1)
            return int(periodo_str[:4]), int(periodo_str[4:6])

    if tipo_norm in {"ACUM_H2_GRD", "ACUM_H2_GEN", "ACUM_H2_RDD_P1", "ACUM_H2_RDD_P2"}:
        m = re.search(r"_(\d{4})(\d{2})", name)
        if m:
            return int(m.group(1)), int(m.group(2))

    m = re.search(r"_(\d{4})(\d{2})", name)
    if m:
        return int(m.group(1)), int(m.group(2))

    raise ValueError(
        f"No se ha podido inferir el periodo AAAAMM del nombre de fichero "
        f"'{name}' para el tipo '{tipo_norm}'."
    )


def _find_existing_ingestion_file(
    db: Session,
    *,
    tenant_id: int,
    empresa_id: int,
    tipo: str,
    anio: int,
    mes: int,
    filename: str | None = None,
) -> IngestionFile | None:
    """
    - Para la mayoría de tipos: 1 fichero lógico por tenant/empresa/tipo/anio/mes.
    - Para BALD: permitimos varios en el mismo periodo, así que además diferenciamos por filename.
    - Si por histórico antiguo existen duplicados, cogemos el más reciente.
    """
    q = (
        db.query(IngestionFile)
        .filter(
            IngestionFile.tenant_id == tenant_id,
            IngestionFile.empresa_id == empresa_id,
            IngestionFile.tipo == tipo,
            IngestionFile.anio == anio,
            IngestionFile.mes == mes,
        )
    )

    if (tipo or "").upper() == "BALD" and filename:
        q = q.filter(IngestionFile.filename == filename)

    return q.order_by(IngestionFile.id.desc()).first()


def _safe_unlink(storage_key: str | None) -> None:
    if not storage_key:
        return
    try:
        p = Path(storage_key)
        if p.exists() and p.is_file():
            p.unlink()
    except Exception:
        return


def _extract_ingestion_warnings(obj: Any) -> list[Any]:
    try:
        w = getattr(obj, "_ingestion_warnings", None)
    except Exception:
        w = None

    if isinstance(w, list):
        return w
    return []


def _apply_ingestion_filters(
    query,
    *,
    tenant_id: int | None = None,
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
):
    if tenant_id is not None:
        query = query.filter(IngestionFile.tenant_id == tenant_id)

    if empresa_id is not None:
        query = query.filter(IngestionFile.empresa_id == empresa_id)

    if tipo is not None:
        query = query.filter(IngestionFile.tipo == tipo)

    if status_ is not None:
        allowed = {
            IngestionFile.STATUS_PENDING,
            IngestionFile.STATUS_PROCESSING,
            IngestionFile.STATUS_OK,
            IngestionFile.STATUS_ERROR,
        }
        if status_ not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Status no válido. Debe ser uno de: {', '.join(sorted(allowed))}",
            )
        query = query.filter(IngestionFile.status == status_)

    if anio is not None:
        query = query.filter(IngestionFile.anio == anio)

    if mes is not None:
        query = query.filter(IngestionFile.mes == mes)

    return query


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
        anio, mes = _infer_period_from_filename(tipo_norm, file.filename)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    existing = _find_existing_ingestion_file(
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
            _safe_unlink(old_storage_key)

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

    existing = _find_existing_ingestion_file(
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

    query = _apply_ingestion_filters(
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
    """
    Borrado profundo SOLO para superusuarios.

    Puede borrar cross-tenant usando filtros opcionales:
    - tenant_id
    - empresa_id
    - tipo
    - status_
    - anio
    - mes
    """
    if tenant_id is not None and empresa_id is not None:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        empresa_tenant_id = cast(int, empresa.tenant_id)
        if empresa_tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La empresa indicada no pertenece al tenant indicado",
            )

    elif tenant_id is None and empresa_id is not None:
        empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa no encontrada",
            )
        tenant_id = cast(int, empresa.tenant_id)

    base_query = db.query(IngestionFile)

    base_query = _apply_ingestion_filters(
        base_query,
        tenant_id=tenant_id,
        empresa_id=empresa_id,
        tipo=tipo,
        status_=status_,
        anio=anio,
        mes=mes,
    )

    rows_to_delete = base_query.all()
    ids_to_delete = [cast(int, row.id) for row in rows_to_delete]

    if not ids_to_delete:
        return {
            "deleted_ingestion_files": 0,
            "deleted_m1_period_contributions": 0,
            "deleted_ps_period_detail": 0,
            "deleted_ps_period_contributions": 0,
            "deleted_medidas_general": 0,
            "deleted_medidas_ps": 0,
            "filters": {
                "tenant_id": tenant_id,
                "empresa_id": empresa_id,
                "tipo": tipo,
                "status_": status_,
                "anio": anio,
                "mes": mes,
            },
        }

    ids_select = select(IngestionFile.id).where(IngestionFile.id.in_(ids_to_delete))

    deleted_m1_contrib = (
        db.query(M1PeriodContribution)
        .filter(M1PeriodContribution.ingestion_file_id.in_(cast(Any, ids_select)))
        .delete(synchronize_session=False)
    )

    deleted_ps_detail = (
        db.query(PSPeriodDetail)
        .filter(PSPeriodDetail.ingestion_file_id.in_(cast(Any, ids_select)))
        .delete(synchronize_session=False)
    )

    deleted_ps_contrib = (
        db.query(PSPeriodContribution)
        .filter(PSPeriodContribution.ingestion_file_id.in_(cast(Any, ids_select)))
        .delete(synchronize_session=False)
    )

    deleted_medidas_general = (
        db.query(MedidaGeneral)
        .filter(MedidaGeneral.file_id.in_(cast(Any, ids_select)))
        .delete(synchronize_session=False)
    )

    deleted_medidas_ps = (
        db.query(MedidaPS)
        .filter(MedidaPS.file_id.in_(cast(Any, ids_select)))
        .delete(synchronize_session=False)
    )

    deleted_files = (
        db.query(IngestionFile)
        .filter(IngestionFile.id.in_(ids_to_delete))
        .delete(synchronize_session=False)
    )

    db.commit()

    return {
        "deleted_ingestion_files": deleted_files,
        "deleted_m1_period_contributions": deleted_m1_contrib,
        "deleted_ps_period_detail": deleted_ps_detail,
        "deleted_ps_period_contributions": deleted_ps_contrib,
        "deleted_medidas_general": deleted_medidas_general,
        "deleted_medidas_ps": deleted_medidas_ps,
        "filters": {
            "tenant_id": tenant_id,
            "empresa_id": empresa_id,
            "tipo": tipo,
            "status_": status_,
            "anio": anio,
            "mes": mes,
        },
    }


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

    ing = cast(Any, ingestion)

    if ing.status not in (IngestionFile.STATUS_PENDING, IngestionFile.STATUS_ERROR):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede procesar un fichero en estado {ing.status}",
        )

    if not ing.storage_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El fichero no tiene storage_key; no se puede procesar",
        )

    ing.warnings_json = None
    ing.status = IngestionFile.STATUS_PROCESSING
    db.commit()
    db.refresh(ingestion)

    storage_key_for_cleanup = cast(str, ing.storage_key)

    try:
        tipo = (ing.tipo or "").upper()

        tenant_id_local = cast(int, ing.tenant_id)
        empresa_id_local = cast(int, ing.empresa_id)
        storage_key = cast(str, ing.storage_key)

        result_obj: Any | None = None

        if tipo == "BALD":
            result_obj = procesar_fichero_bald(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "M1":
            result_obj = procesar_fichero_m1_desde_csv(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "M1_AUTOCONSUMO":
            result_obj = procesar_fichero_m1_autoconsumo_desde_csv(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUMCIL":
            result_obj = procesar_fichero_acumcil_generacion(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_GRD":
            result_obj = procesar_fichero_acum_h2_grd_generacion(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_GEN":
            result_obj = procesar_fichero_acum_h2_gen_generacion(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_RDD_P2":
            result_obj = procesar_fichero_acum_h2_rdd_p2_frontera_dd(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_RDD_P1":
            procesar_fichero_acum_h2_rdd_p1_frontera_dd(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
            result_obj = procesar_fichero_acum_h2_rdd_pf_kwh(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "PS":
            result_obj = procesar_fichero_ps(
                db=db,
                tenant_id=tenant_id_local,
                empresa_id=empresa_id_local,
                fichero=ingestion,
                file_path=storage_key,
            )
        else:
            raise ValueError(f"Tipo de fichero no soportado para procesado: {tipo}")

        warnings_list = _extract_ingestion_warnings(result_obj)
        if warnings_list:
            ing.warnings_json = json.dumps(warnings_list, ensure_ascii=False)

        ing.status = IngestionFile.STATUS_OK
        ing.rows_ok = int(ing.rows_ok or 0) + 1
        ing.rows_error = int(ing.rows_error or 0)
        ing.error_message = None

    except Exception as exc:
        ing.status = IngestionFile.STATUS_ERROR
        ing.rows_error = int(ing.rows_error or 0) + 1
        ing.error_message = str(exc)

    finally:
        ing.processed_at = datetime.utcnow()
        db.commit()
        db.refresh(ingestion)

        try:
            settings = get_settings()
            delete_after_ok = bool(getattr(settings, "INGESTION_DELETE_AFTER_OK", True))
        except Exception:
            delete_after_ok = True

        if delete_after_ok and cast(str, ing.status) == IngestionFile.STATUS_OK:
            _safe_unlink(storage_key_for_cleanup)

    return ingestion