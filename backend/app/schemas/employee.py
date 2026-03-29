"""Employee schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class EmployeeCreate(BaseModel):
    """Create a new employee."""
    employee_number: str = Field(min_length=1, max_length=50)
    full_name: str = Field(min_length=1, max_length=255)
    preferred_language: str = "he"
    notification_channels: dict | None = None
    custom_fields: dict | None = None
    notes: str | None = None


class EmployeeUpdate(BaseModel):
    """Update an employee."""
    full_name: str | None = None
    preferred_language: str | None = None
    notification_channels: dict | None = None
    custom_fields: dict | None = None
    status: str | None = None
    is_active: bool | None = None
    notes: str | None = None


class EmployeeResponse(BaseModel):
    """Employee response."""
    id: UUID
    tenant_id: UUID
    employee_number: str
    full_name: str
    preferred_language: str
    notification_channels: dict | None = None
    custom_fields: dict | None = None
    status: str
    is_active: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeBulkImportRequest(BaseModel):
    """Bulk import employees."""
    employees: list[EmployeeCreate]
    skip_errors: bool = False
