"""Scheduling schemas."""

import datetime as dt
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# --- Schedule Windows ---

class ScheduleWindowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    start_date: dt.date
    end_date: dt.date
    notes: Optional[str] = None
    settings_override: Optional[dict] = None

class ScheduleWindowUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[dt.date] = None
    end_date: Optional[dt.date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    settings_override: Optional[dict] = None

class ScheduleWindowResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    start_date: dt.date
    end_date: dt.date
    status: str
    paused_at: Optional[dt.datetime] = None
    notes: Optional[str] = None
    settings_override: Optional[dict] = None
    created_at: dt.datetime
    updated_at: dt.datetime
    employee_count: int = 0

    model_config = {"from_attributes": True}

class ScheduleWindowEmployeeAdd(BaseModel):
    employee_ids: list[UUID]

class ScheduleWindowEmployeeResponse(BaseModel):
    id: UUID
    schedule_window_id: UUID
    employee_id: UUID
    notes: Optional[str] = None
    created_at: dt.datetime

    model_config = {"from_attributes": True}


# --- Mission Types ---

class MissionTypeCreate(BaseModel):
    name: dict  # {"he": "...", "en": "..."}
    description: Optional[dict] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    duration_hours: Optional[float] = None
    is_standby: bool = False
    required_slots: Optional[list] = None
    pre_mission_events: Optional[dict] = None
    post_mission_rule: Optional[dict] = None
    timeline_items: Optional[dict] = None

class MissionTypeUpdate(BaseModel):
    name: Optional[dict] = None
    description: Optional[dict] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    duration_hours: Optional[float] = None
    is_standby: Optional[bool] = None
    required_slots: Optional[list] = None
    pre_mission_events: Optional[dict] = None
    post_mission_rule: Optional[dict] = None
    timeline_items: Optional[dict] = None
    is_active: Optional[bool] = None

class MissionTypeResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: dict
    description: Optional[dict] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    duration_hours: Optional[float] = None
    is_standby: bool
    required_slots: Optional[list] = None
    pre_mission_events: Optional[dict] = None
    post_mission_rule: Optional[dict] = None
    timeline_items: Optional[dict] = None
    is_active: bool
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


# --- Mission Templates ---

class MissionTemplateCreate(BaseModel):
    schedule_window_id: UUID
    mission_type_id: UUID
    name: str = Field(min_length=1, max_length=255)
    recurrence: Optional[dict] = None
    time_slots: Optional[list] = None

class MissionTemplateUpdate(BaseModel):
    name: Optional[str] = None
    recurrence: Optional[dict] = None
    time_slots: Optional[list] = None
    is_active: Optional[bool] = None

class MissionTemplateResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    schedule_window_id: UUID
    mission_type_id: UUID
    name: str
    recurrence: Optional[dict] = None
    time_slots: Optional[list] = None
    is_active: bool
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


# --- Missions ---

class MissionCreate(BaseModel):
    schedule_window_id: UUID
    mission_type_id: UUID
    name: str = Field(min_length=1, max_length=255)
    date: dt.date
    start_time: dt.time
    end_time: dt.time

class MissionUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[dt.date] = None
    start_time: Optional[dt.time] = None
    end_time: Optional[dt.time] = None
    status: Optional[str] = None

class MissionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    schedule_window_id: UUID
    mission_type_id: UUID
    template_id: Optional[UUID] = None
    name: str
    date: dt.date
    start_time: dt.time
    end_time: dt.time
    status: str
    is_activated: bool
    version: int
    assignments: list = []
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}

class MissionGenerateRequest(BaseModel):
    template_id: UUID
    start_date: dt.date
    end_date: dt.date

class MissionBulkResponse(BaseModel):
    created: int
    missions: list[MissionResponse]


# --- Mission Assignments ---

class MissionAssignmentCreate(BaseModel):
    employee_id: UUID
    work_role_id: UUID
    slot_id: str

class MissionAssignmentResponse(BaseModel):
    id: UUID
    mission_id: UUID
    employee_id: UUID
    work_role_id: UUID
    slot_id: str
    status: str
    confirmed_at: Optional[dt.datetime] = None
    conflicts_detected: Optional[dict] = None
    assigned_at: Optional[dt.datetime] = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


# --- Swap Requests ---

class SwapRequestCreate(BaseModel):
    requester_assignment_id: UUID
    target_employee_id: Optional[UUID] = None
    target_assignment_id: Optional[UUID] = None
    swap_type: str  # "swap" | "give_away"
    reason: Optional[str] = None

class SwapRequestResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    requester_employee_id: UUID
    requester_assignment_id: UUID
    target_employee_id: Optional[UUID] = None
    target_assignment_id: Optional[UUID] = None
    swap_type: str
    reason: Optional[str] = None
    status: str
    validation_result: Optional[dict] = None
    target_response: str
    approved_by: Optional[UUID] = None
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}
