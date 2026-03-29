"""Tenant schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class TenantCreate(BaseModel):
    """Create a new tenant."""
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    plan_id: UUID | None = None


class TenantUpdate(BaseModel):
    """Update a tenant."""
    name: str | None = None
    slug: str | None = None
    is_active: bool | None = None
    plan_id: UUID | None = None


class TenantResponse(BaseModel):
    """Tenant response."""
    id: UUID
    name: str
    slug: str
    is_active: bool
    plan_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TenantSettingResponse(BaseModel):
    """Tenant setting response."""
    key: str
    value: dict | None
    value_type: str
    label: dict
    group: str

    model_config = {"from_attributes": True}
