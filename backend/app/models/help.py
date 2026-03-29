"""Help topic model."""

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HelpTopic(Base):
    """Help documentation topic (system or tenant-specific)."""

    __tablename__ = "help_topics"

    topic_key: Mapped[str] = mapped_column(String(100), nullable=False)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[dict] = mapped_column(JSONB, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    examples: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
