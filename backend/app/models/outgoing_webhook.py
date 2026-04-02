"""Outgoing webhook model."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.models.base import Base


class OutgoingWebhook(Base):
    """Outgoing webhook configuration."""

    __tablename__ = "outgoing_webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(200), nullable=False)
    url = Column(Text, nullable=False)
    secret = Column(String(200), nullable=True)
    events = Column(JSONB, nullable=False)
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    failure_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class WebhookDelivery(Base):
    """Webhook delivery attempt log."""

    __tablename__ = "webhook_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("outgoing_webhooks.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    payload = Column(JSONB, nullable=True)
    status_code = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    success = Column(Boolean, default=False)
    attempt = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
