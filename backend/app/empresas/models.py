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

    # Tenant al que pertenece la empresa
    tenant = relationship("Tenant", back_populates="empresas")

    # 🔴 NUEVO: usuarios que tienen acceso explícito a esta empresa
    # (la tabla intermedia user_empresas está definida en app.tenants.models)
    usuarios_con_acceso = relationship(
        "User",
        secondary="user_empresas",
        back_populates="empresas_permitidas",
        lazy="selectin",
    )