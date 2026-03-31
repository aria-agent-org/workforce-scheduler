"""Tenant, Plan, and TenantSetting models."""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Plan(Base):
    """Subscription plan with feature flags."""

    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    features: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class Tenant(Base):
    """Organization/tenant."""

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id"), nullable=True
    )

    plan = relationship("Plan", lazy="selectin")
    settings = relationship("TenantSetting", back_populates="tenant", lazy="selectin")


class TenantSetting(Base):
    """Dynamic key-value settings per tenant."""

    __tablename__ = "tenant_settings"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    value_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="string"
    )
    label: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    group: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    is_editable_by_tenant_admin: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )

    tenant = relationship("Tenant", back_populates="settings")

    __table_args__ = (
        {"schema": None},
    )


class AuthMethodConfig(Base):
    """Per-tenant authentication method configuration (Section 3.4d)."""

    __tablename__ = "auth_method_configs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    method: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "password" | "webauthn" | "magic_link" | "sso_google" | "sso_saml"
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_required_as_second_factor: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "method", name="uq_auth_method_per_tenant"),
    )
