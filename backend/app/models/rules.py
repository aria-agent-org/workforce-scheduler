"""Dynamic rule definitions for the scheduling engine."""

import uuid

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class RuleDefinition(TenantBase):
    """A dynamic scheduling rule with condition/action expressions."""

    __tablename__ = "rule_definitions"

    name: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    scope: Mapped[str] = mapped_column(String(30), nullable=False, default="global")
    scope_ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    condition_expression: Mapped[dict] = mapped_column(JSONB, nullable=False)
    action_expression: Mapped[dict] = mapped_column(JSONB, nullable=False)
    parameters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="soft")
    override_permission: Mapped[str | None] = mapped_column(String(50), nullable=True)
    conflict_resolution_hint: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_system_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
