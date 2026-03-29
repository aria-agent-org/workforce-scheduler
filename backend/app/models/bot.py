"""Bot configuration and AI usage models."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantBase


class BotConfig(TenantBase):
    """Bot configuration per platform per tenant."""

    __tablename__ = "bot_configs"

    platform: Mapped[str] = mapped_column(String(30), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bot_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ai_mode_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    welcome_message: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fallback_message: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    allowed_actions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    menu_structure: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    credentials_secret_arn: Mapped[str | None] = mapped_column(String(500), nullable=True)


class BotRegistrationToken(Base):
    """One-time token for bot registration."""

    __tablename__ = "bot_registration_tokens"

    token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(30), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AIUsageConfig(Base):
    """AI usage limits per tenant."""

    __tablename__ = "ai_usage_configs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    limit_daily_messages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    limit_monthly_messages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    limit_total_messages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    on_limit_reached: Mapped[str] = mapped_column(String(30), default="block", nullable=False)
    alert_at_percent: Mapped[int] = mapped_column(Integer, default=80, nullable=False)
    reset_day_of_month: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class AIUsageLog(TenantBase):
    """Daily AI usage log."""

    __tablename__ = "ai_usage_logs"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    messages_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
