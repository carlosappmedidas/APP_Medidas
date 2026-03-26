from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Table, JSON
from sqlalchemy.orm import relationship

from app.core.models_base import Base, TimestampMixin


user_empresas = Table(
    "user_empresas",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("empresa_id", Integer, ForeignKey("empresas.id"), primary_key=True),
)


class Tenant(TimestampMixin, Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False, unique=True)
    plan = Column(String(50), nullable=False, default="starter")

    usuarios = relationship(
        "User",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )
    empresas = relationship(
        "Empresa",
        back_populates="tenant",
        cascade="all, delete-orphan",
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    rol = Column(String(50), nullable=False, default="owner")
    is_active = Column(Boolean, nullable=False, default=True)
    is_superuser = Column(Boolean, nullable=False, default=False)
    ui_theme_overrides = Column(JSON, nullable=True)

    tenant = relationship("Tenant", back_populates="usuarios")

    empresas_permitidas = relationship(
        "Empresa",
        secondary=user_empresas,
        back_populates="usuarios_con_acceso",
        lazy="selectin",
    )

    @property
    def empresa_ids_permitidas(self) -> list[int]:
        return [e.id for e in (self.empresas_permitidas or [])]