"""Data retention configuration model."""

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class DataRetentionConfig(TenantBase):
    """Per-tenant data retention policy for different entity types."""

    __tablename__ = "data_retention_configs"

    entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "audit_log" | "notification_log" | "ai_chat_log"
    retain_days: Mapped[int] = mapped_column(Integer, default=365, nullable=False)
    archive_to_s3: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
