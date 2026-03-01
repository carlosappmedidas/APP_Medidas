# app/ingestion/routes.py
# pyright: reportMissingImports=false

from __future__ import annotations

from datetime import datetime
from typing import Any, cast
from pathlib import Path
import shutil
import re

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
from app.core.auth import get_current_user
from app.core.config import get_settings  # ✅ NUEVO (configurable por .env)
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
) -> IngestionFile | None:
    return (
        db.query(IngestionFile)
        .filter(
            IngestionFile.tenant_id == tenant_id,
            IngestionFile.empresa_id == empresa_id,
            IngestionFile.tipo == tipo,
            IngestionFile.anio == anio,
            IngestionFile.mes == mes,
        )
        .first()
    )


# ---------------------------------------------------------
# ✅ NUEVO: helpers de borrado físico (sin afectar lógica)
# ---------------------------------------------------------
def _safe_unlink(storage_key: str | None) -> None:
    """
    Borra el fichero físico si existe.
    - Nunca lanza excepción (para no romper flujo).
    - Solo toca disco; no cambia estados ni DB.
    """
    if not storage_key:
        return
    try:
        p = Path(storage_key)
        if p.exists() and p.is_file():
            p.unlink()
    except Exception:
        # Silencioso: el borrado es best-effort
        return


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

    # ✅ Solo tipado estático (sin cambiar lógica/runtime)
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
        tenant_id=tenant_id_int,  # ✅ aquí estaba el warning (Column[int] -> int)
        empresa_id=empresa_id,
        tipo=tipo_norm,
        anio=anio,
        mes=mes,
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
        # ✅ NUEVO: guardamos el storage_key anterior para limpiar “duplicados”
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

        db.commit()
        db.refresh(existing)

        # ✅ NUEVO: si el fichero anterior era distinto, lo borramos del disco
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

    ingestion_data: dict[str, Any] = {
        "tenant_id": tenant_id_int,
        "empresa_id": data.empresa_id,
        "tipo": data.tipo,
        "anio": data.anio,
        "mes": data.mes,
        "filename": data.filename,
        "storage_key": data.storage_key,
        "status": IngestionFile.STATUS_PENDING,
        "uploaded_by": cast(int, current_user.id),
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
                detail=f"Status no válido. Debe ser uno de: {', '.join(allowed)}",
            )
        query = query.filter(IngestionFile.status == status_)
    if anio is not None:
        query = query.filter(IngestionFile.anio == anio)
    if mes is not None:
        query = query.filter(IngestionFile.mes == mes)

    query = query.order_by(
        IngestionFile.anio.desc(),
        IngestionFile.mes.desc(),
        IngestionFile.id.desc(),
    )

    return query.all()


@router.delete("/files")
def delete_files(
    empresa_id: int | None = None,
    tipo: str | None = None,
    status_: str | None = None,
    anio: int | None = None,
    mes: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id_int = cast(int, current_user.tenant_id)

    base_query = db.query(IngestionFile).filter(
        IngestionFile.tenant_id == tenant_id_int,
    )

    if empresa_id is not None:
        base_query = base_query.filter(IngestionFile.empresa_id == empresa_id)
    if tipo is not None:
        base_query = base_query.filter(IngestionFile.tipo == tipo)
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
                detail=f"Status no válido. Debe ser uno de: {', '.join(allowed)}",
            )
        base_query = base_query.filter(IngestionFile.status == status_)
    if anio is not None:
        base_query = base_query.filter(IngestionFile.anio == anio)
    if mes is not None:
        base_query = base_query.filter(IngestionFile.mes == mes)

    ids_subq = base_query.with_entities(IngestionFile.id).subquery()
    ids_select = select(ids_subq.c.id)

    deleted_medidas_general = (
        db.query(MedidaGeneral)
        .filter(
            MedidaGeneral.tenant_id == tenant_id_int,
            MedidaGeneral.file_id.in_(cast(Any, ids_select)),
        )
        .delete(synchronize_session=False)
    )

    deleted_medidas_ps = (
        db.query(MedidaPS)
        .filter(
            MedidaPS.tenant_id == tenant_id_int,
            MedidaPS.file_id.in_(cast(Any, ids_select)),
        )
        .delete(synchronize_session=False)
    )

    deleted_files = base_query.delete(synchronize_session=False)

    db.commit()

    return {
        "deleted_ingestion_files": deleted_files,
        "deleted_medidas_general": deleted_medidas_general,
        "deleted_medidas_ps": deleted_medidas_ps,
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

    ing.status = IngestionFile.STATUS_PROCESSING
    db.commit()
    db.refresh(ingestion)

    # ✅ Guardamos storage_key para borrado posterior (si procede)
    storage_key_for_cleanup = cast(str, ing.storage_key)

    try:
        tipo = (ing.tipo or "").upper()

        # ✅ Solo tipado estático (sin cambiar lógica/runtime)
        tenant_id = cast(int, ing.tenant_id)
        empresa_id = cast(int, ing.empresa_id)
        storage_key = cast(str, ing.storage_key)

        if tipo == "BALD":
            procesar_fichero_bald(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "M1":
            procesar_fichero_m1_desde_csv(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "M1_AUTOCONSUMO":
            procesar_fichero_m1_autoconsumo_desde_csv(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUMCIL":
            procesar_fichero_acumcil_generacion(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_GRD":
            procesar_fichero_acum_h2_grd_generacion(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_GEN":
            procesar_fichero_acum_h2_gen_generacion(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_RDD_P2":
            procesar_fichero_acum_h2_rdd_p2_frontera_dd(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "ACUM_H2_RDD_P1":
            procesar_fichero_acum_h2_rdd_p1_frontera_dd(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
            procesar_fichero_acum_h2_rdd_pf_kwh(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        elif tipo == "PS":
            procesar_fichero_ps(
                db=db,
                tenant_id=tenant_id,
                empresa_id=empresa_id,
                fichero=ingestion,
                file_path=storage_key,
            )
        else:
            raise ValueError(f"Tipo de fichero no soportado para procesado: {tipo}")

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

        # ✅ NUEVO: borrar fichero si terminó OK y está habilitado por config
        try:
            settings = get_settings()
            delete_after_ok = bool(getattr(settings, "INGESTION_DELETE_AFTER_OK", True))
        except Exception:
            delete_after_ok = True  # fallback seguro

        if delete_after_ok and cast(str, ing.status) == IngestionFile.STATUS_OK:
            _safe_unlink(storage_key_for_cleanup)

    return ingestion