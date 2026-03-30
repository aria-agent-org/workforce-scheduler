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


# ═══════════════════════════════════════════
# Employee Preferences
# ═══════════════════════════════════════════

class PartnerPreference(BaseModel):
    employee_id: str
    weight: int = Field(ge=1, le=10, default=5)
    notes: str | None = None


class MissionTypePreference(BaseModel):
    mission_type_id: str
    preference: str = Field(pattern="^(prefer|avoid|neutral)$", default="neutral")
    weight: int = Field(ge=1, le=10, default=5)


class TimeSlotPreference(BaseModel):
    slot_key: str = Field(pattern="^(morning|afternoon|night)$")
    preference: str = Field(pattern="^(prefer|avoid|neutral)$", default="neutral")
    weight: int = Field(ge=1, le=10, default=5)


class EmployeePreferencesUpdate(BaseModel):
    """Update employee scheduling preferences."""
    partner_preferences: list[PartnerPreference] | None = None
    mission_type_preferences: list[MissionTypePreference] | None = None
    time_slot_preferences: list[TimeSlotPreference] | None = None
    custom_preferences: dict | None = None
    notes: str | None = None


class EmployeePreferencesResponse(BaseModel):
    """Employee preferences response."""
    employee_id: UUID
    partner_preferences: list | None = None
    mission_type_preferences: list | None = None
    time_slot_preferences: list | None = None
    custom_preferences: dict | None = None
    notes: str | None = None

    model_config = {"from_attributes": True}
