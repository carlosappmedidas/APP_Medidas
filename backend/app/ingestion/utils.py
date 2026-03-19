# app/ingestion/utils.py
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.ingestion.models import IngestionFile


def infer_period_from_filename(tipo: str, filename: str) -> tuple[int, int]:
    """
    Infiere (anio, mes) a partir del tipo de fichero y su nombre.
    Lanza ValueError si no puede inferirlo.
    """
    tipo_norm = (tipo or "").upper()
    name = str(filename)

    if tipo_norm in {"M1_AUTOCONSUMO", "ACUMCIL"}:
        match = re.search(r"_(\d{4})(\d{2})_", name)
        if match:
            return int(match.group(1)), int(match.group(2))

    if tipo_norm == "M1":
        match = re.search(r"_(\d{4})(\d{2})", name)
        if match:
            return int(match.group(1)), int(match.group(2))

    if tipo_norm == "BALD":
        match = re.search(r"BALD_\d+_(\d{6})_", name.upper())
        if match:
            periodo_str = match.group(1)
            return int(periodo_str[:4]), int(periodo_str[4:6])

    if tipo_norm in {"ACUM_H2_GRD", "ACUM_H2_GEN", "ACUM_H2_RDD_P1", "ACUM_H2_RDD_P2"}:
        match = re.search(r"_(\d{4})(\d{2})", name)
        if match:
            return int(match.group(1)), int(match.group(2))

    match = re.search(r"_(\d{4})(\d{2})", name)
    if match:
        return int(match.group(1)), int(match.group(2))

    raise ValueError(
        f"No se ha podido inferir el periodo AAAAMM del nombre de fichero "
        f"'{name}' para el tipo '{tipo_norm}'."
    )


def find_existing_ingestion_file(
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
    Busca un IngestionFile existente para el mismo tenant/empresa/tipo/periodo.
    Para BALD también filtra por filename exacto.
    """
    tipo_norm = (tipo or "").upper()

    if tipo_norm == "BALD":
        if not filename:
            return None
        return (
            db.query(IngestionFile)
            .filter(
                IngestionFile.tenant_id == tenant_id,
                IngestionFile.empresa_id == empresa_id,
                IngestionFile.tipo == tipo_norm,
                IngestionFile.anio == anio,
                IngestionFile.mes == mes,
                IngestionFile.filename == filename,
            )
            .order_by(IngestionFile.id.desc())
            .first()
        )

    return (
        db.query(IngestionFile)
        .filter(
            IngestionFile.tenant_id == tenant_id,
            IngestionFile.empresa_id == empresa_id,
            IngestionFile.tipo == tipo_norm,
            IngestionFile.anio == anio,
            IngestionFile.mes == mes,
        )
        .order_by(IngestionFile.id.desc())
        .first()
    )


def safe_unlink(storage_key: str | None) -> None:
    """
    Elimina un fichero del disco de forma segura, sin lanzar excepciones.
    """
    if not storage_key:
        return
    try:
        path = Path(storage_key)
        if path.exists() and path.is_file():
            path.unlink()
    except Exception:
        return