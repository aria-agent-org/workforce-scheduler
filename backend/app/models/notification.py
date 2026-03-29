"""Notification templates, event types, channel configs, and logs."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantBase


class EventTypeDefinition(TenantBase):
    """Definition of a notification event type."""

    __tablename__ = "event_type_definitions"

    code: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[dict] = mapped_column(JSONB, nullable=False)
    available_variables: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_event_type_code_per_tenant"),
    )


class NotificationTemplate(TenantBase):
    """Template for sending notifications across channels."""

    __tablename__ = "notification_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type_code: Mapped[str] = mapped_column(String(100), nullable=False)
    channels: Mapped[dict] = mapped_column(JSONB, nullable=False)
    send_offset_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conditions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    require_whatsapp_session: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class NotificationChannelConfig(Base):
    """Per-tenant notification channel configuration."""

    __tablename__ = "notification_channel_configs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    provider_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    cost_per_message_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    monthly_budget_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    budget_alert_at_percent: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "channel", name="uq_channel_config_per_tenant"),
    )


class NotificationLog(TenantBase):
    """Log of all sent notifications."""

    __tablename__ = "notification_logs"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    event_type_code: Mapped[str] = mapped_column(String(100), nullable=False)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notification_templates.id"), nullable=True
    )
    body_sent: Mapped[str | None] = mapped_column(Text, nullable=True)
    language_sent: Mapped[str | None] = mapped_column(String(5), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class NotificationLockedEvent(Base):
    """Events that employees cannot disable notifications for."""

    __tablename__ = "notification_locked_events"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    event_type_code: Mapped[str] = mapped_column(String(100), nullable=False)
    locked_channels: Mapped[list | None] = mapped_column(ARRAY(String), nullable=True)
    reason: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "event_type_code", name="uq_locked_event_per_tenant"),
    )
