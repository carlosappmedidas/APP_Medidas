from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Table, JSON
from sqlalchemy.orm import relationship

from app.core.models_base import Base, TimestampMixin


# Tabla intermedia: usuario ↔ empresas que puede ver
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

    # Relaciones
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

    # rol “lógico” dentro del tenant (owner, admin, viewer, etc.)
    rol = Column(String(50), nullable=False, default="owner")

    # usuario activo / desactivado
    is_active = Column(Boolean, nullable=False, default=True)

    # superusuario de plataforma (puede ver todos los tenants)
    is_superuser = Column(Boolean, nullable=False, default=False)

    # ✅ NUEVO: overrides del tema UI (se guardan como JSON)
    # Ejemplo:
    # {
    #   "--app-bg": "#020617",
    #   "--sidebar-bg": "rgba(0,0,0,0.4)",
    #   ...
    # }
    ui_theme_overrides = Column(JSON, nullable=True)

    # Tenant al que pertenece
    tenant = relationship("Tenant", back_populates="usuarios")

    # 🔴 NUEVO: empresas que este usuario puede ver dentro de su tenant
    # Si la lista está vacía → ve TODAS las empresas de su tenant
    empresas_permitidas = relationship(
        "Empresa",
        secondary=user_empresas,
        back_populates="usuarios_con_acceso",
        lazy="selectin",
    )

    @property
    def empresa_ids_permitidas(self) -> list[int]:
        """
        Devuelve la lista de IDs de empresas permitidas.
        Si no hay ninguna asociada → lista vacía (interpretable como “todas”).
        """
        return [e.id for e in (self.empresas_permitidas or [])]