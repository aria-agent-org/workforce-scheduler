"""Notification schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NotificationTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    event_type_code: str
    channels: dict  # {"push": {"he": "...", "en": "..."}, "in_app": {...}}
    send_offset_minutes: int = 0
    conditions: dict | None = None
    is_active: bool = True

class NotificationTemplateUpdate(BaseModel):
    name: str | None = None
    channels: dict | None = None
    send_offset_minutes: int | None = None
    conditions: dict | None = None
    is_active: bool | None = None

class NotificationTemplateResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    event_type_code: str
    channels: dict
    send_offset_minutes: int
    conditions: dict | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class NotificationLogResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    employee_id: UUID
    channel: str
    event_type_code: str
    body_sent: str | None = None
    status: str
    sent_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

class EventTypeResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    code: str
    label: dict
    available_variables: dict | None = None
    is_system: bool

    model_config = {"from_attributes": True}

class NotificationSend(BaseModel):
    employee_ids: list[UUID]
    event_type_code: str
    template_id: UUID | None = None
    channel: str = "in_app"
    body: str | None = None
