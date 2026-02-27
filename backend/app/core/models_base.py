from datetime import datetime

from sqlalchemy import Column, DateTime, Integer
from sqlalchemy.orm import declarative_base

# Base global de todos los modelos
Base = declarative_base()


class TimestampMixin:
    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class TenantMixin:
    tenant_id = Column(Integer, nullable=False, index=True)