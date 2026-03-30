"""Employee and related models."""

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantBase


class Employee(TenantBase):
    """Employee within a tenant."""

    __tablename__ = "employees"

    employee_number: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    preferred_language: Mapped[str] = mapped_column(String(5), default="he", nullable=False)
    notification_channels: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    whatsapp_session_expires_at: Mapped[str | None] = mapped_column(nullable=True)
    whatsapp_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    telegram_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    custom_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="present", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    profile = relationship("EmployeeProfile", uselist=False, back_populates="employee", lazy="selectin")
    work_roles = relationship("EmployeeWorkRole", back_populates="employee", lazy="selectin")
    preferences = relationship("EmployeePreference", uselist=False, back_populates="employee", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_number", name="uq_employee_number_per_tenant"),
    )


class EmployeeProfile(Base):
    """Extended employee profile (avatar, emergency contact)."""

    __tablename__ = "employee_profiles"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    employee = relationship("Employee", back_populates="profile")


class EmployeeFieldDefinition(TenantBase):
    """Custom field definition for employees."""

    __tablename__ = "employee_field_definitions"

    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[dict] = mapped_column(JSONB, nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_in_list: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class EmployeeWorkRole(Base):
    """Many-to-many: employee ↔ work role."""

    __tablename__ = "employee_work_roles"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    work_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_roles.id", ondelete="CASCADE"), nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    employee = relationship("Employee", back_populates="work_roles")

    __table_args__ = (
        UniqueConstraint("employee_id", "work_role_id", name="uq_employee_work_role"),
    )


class EmployeePreference(Base):
    """Employee scheduling preferences."""

    __tablename__ = "employee_preferences"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    partner_preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    mission_type_preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    time_slot_preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    custom_preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    employee = relationship("Employee", back_populates="preferences")


class EmployeeNotificationPreference(Base):
    """Per-event notification preferences for an employee."""

    __tablename__ = "employee_notification_preferences"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    event_type_code: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    channel_overrides: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("employee_id", "event_type_code", name="uq_employee_event_pref"),
    )
