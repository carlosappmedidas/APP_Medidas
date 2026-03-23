# app/calendario_ree/models.py
# pyright: reportMissingImports=false
from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, String, Text

from app.core.models_base import Base, TimestampMixin


class ReeCalendarFile(TimestampMixin, Base):
    __tablename__ = "ree_calendar_files"

    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_ARCHIVED = "archived"
    STATUS_ERROR = "error"

    id = Column(Integer, primary_key=True, index=True)

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    anio = Column(Integer, nullable=False, index=True)

    filename = Column(String(255), nullable=False)
    storage_key = Column(String(500), nullable=True)
    mime_type = Column(String(150), nullable=True)

    status = Column(String(20), nullable=False, default=STATUS_PENDING)
    is_active = Column(Boolean, nullable=False, default=False)

    uploaded_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    error_message = Column(Text, nullable=True)


class ReeCalendarEvent(TimestampMixin, Base):
    __tablename__ = "ree_calendar_events"

    id = Column(Integer, primary_key=True, index=True)

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    calendar_file_id = Column(
        Integer,
        ForeignKey("ree_calendar_files.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    anio = Column(Integer, nullable=False, index=True)
    fecha = Column(Date, nullable=False, index=True)

    mes_visual = Column(String(50), nullable=False)
    categoria = Column(String(50), nullable=False, index=True)
    evento = Column(String(255), nullable=False)
    mes_afectado = Column(String(50), nullable=False)
    estado = Column(String(20), nullable=False, index=True)

    sort_order = Column(Integer, nullable=False, default=0)