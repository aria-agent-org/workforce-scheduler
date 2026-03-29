"""Audit log schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    user_id: UUID
    action: str
    entity_type: str
    entity_id: UUID
    before_state: dict | None = None
    after_state: dict | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
