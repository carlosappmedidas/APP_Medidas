from sqlalchemy import Column, DateTime, Integer
from sqlalchemy.orm import declarative_base

from app.core.datetime_utils import ahora_madrid

# Base global de todos los modelos
Base = declarative_base()


class TimestampMixin:
    created_at = Column(
        DateTime,
        nullable=False,
        default=ahora_madrid,
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=ahora_madrid,
        onupdate=ahora_madrid,
    )


class TenantMixin:
    tenant_id = Column(Integer, nullable=False, index=True)