# app/ingestion/models.py

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    Text,
)

from app.core.models_base import Base, TimestampMixin


class IngestionFile(TimestampMixin, Base):
    __tablename__ = "ingestion_files"

    # Estados posibles
    STATUS_PENDING = "pending"
    STATUS_PROCESSING = "processing"
    STATUS_OK = "ok"
    STATUS_ERROR = "error"

    id = Column(Integer, primary_key=True, index=True)

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Tipo de fichero: M1, M2, BALD, etc.
    tipo = Column(String(50), nullable=False)

    # Periodo del fichero
    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)

    # Nombre visible + ubicación en bucket (futuro)
    filename = Column(String(255), nullable=False)
    storage_key = Column(String(500), nullable=True)

    # Estado del proceso
    status = Column(
        String(20),
        nullable=False,
        default=STATUS_PENDING,
    )
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    processed_at = Column(DateTime(timezone=True), nullable=True)
    rows_ok = Column(Integer, nullable=True)
    rows_error = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    # ✅ NUEVO: avisos/no bloqueante (JSON serializado)
    warnings_json = Column(Text, nullable=True)

    @property
    def warnings(self) -> list[Any]:
        """
        Devuelve lista de avisos parseada desde warnings_json.
        Si no hay o está corrupto -> [].
        """
        raw = getattr(self, "warnings_json", None)
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []

    # created_at y updated_at vienen de TimestampMixin