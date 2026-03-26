from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from app.core.models_base import Base, TimestampMixin


class Empresa(TimestampMixin, Base):
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    nombre = Column(String(255), nullable=False)
    codigo_ree = Column(String(50), nullable=True)
    codigo_cnmc = Column(String(50), nullable=True)
    activo = Column(Boolean, nullable=False, default=True)

    tenant = relationship("Tenant", back_populates="empresas")

    usuarios_con_acceso = relationship(
        "User",
        secondary="user_empresas",
        back_populates="empresas_permitidas",
        lazy="selectin",
    )