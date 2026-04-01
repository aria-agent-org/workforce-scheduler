"""Onboarding progress model — persists wizard state per user in the DB."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OnboardingProgress(Base):
    """Stores the setup-wizard progress for each user."""

    __tablename__ = "onboarding_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    current_step: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # e.g. {"0": true, "1": true, ...}
    completed_steps: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # "in_progress" | "completed" | "skipped"
    status: Mapped[str] = mapped_column(String(20), default="in_progress", nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
