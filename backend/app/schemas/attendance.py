"""Attendance schemas."""

from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, Field


class AttendanceCreate(BaseModel):
    schedule_window_id: UUID
    employee_id: UUID
    date: date
    status_code: str = Field(min_length=1, max_length=50)
    notes: str | None = None

class AttendanceUpdate(BaseModel):
    status_code: str | None = None
    notes: str | None = None

class AttendanceBulkUpdate(BaseModel):
    """Bulk update attendance for multiple employees on a date."""
    schedule_window_id: UUID
    date: date
    entries: list[dict]  # [{"employee_id": "...", "status_code": "..."}]

class AttendanceResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    schedule_window_id: UUID
    employee_id: UUID
    date: date
    status_code: str
    notes: str | None = None
    source: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class AttendanceStatusDefinitionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    code: str
    name: dict
    color: str | None = None
    icon: str | None = None
    is_schedulable: bool
    schedulable_from_time: time | None = None
    schedulable_notes: dict | None = None
    triggers_rule_category: str | None = None
    counts_as_present: bool
    sort_order: int
    is_system: bool
    created_at: datetime

    model_config = {"from_attributes": True}

class AttendanceStatusCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: dict
    color: str | None = None
    icon: str | None = None
    is_schedulable: bool = True
    counts_as_present: bool = True
    sort_order: int = 0
