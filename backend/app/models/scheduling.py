"""Scheduling models: windows, missions, templates, assignments, swaps."""

import uuid
from datetime import date, time, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Time,
    UniqueConstraint, LargeBinary,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TenantBase


class ScheduleWindow(TenantBase):
    """A scheduling period (e.g., May–July 2026)."""

    __tablename__ = "schedule_windows"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_windows.id"), nullable=True
    )
    google_sheets_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("google_sheets_configs.id"), nullable=True
    )
    settings_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    employees = relationship("ScheduleWindowEmployee", back_populates="schedule_window", lazy="selectin")


class ScheduleWindowEmployee(Base):
    """Employee assigned to a schedule window."""

    __tablename__ = "schedule_window_employees"

    schedule_window_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    custom_rules_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    schedule_window = relationship("ScheduleWindow", back_populates="employees")

    __table_args__ = (
        UniqueConstraint("schedule_window_id", "employee_id", name="uq_window_employee"),
    )


class MissionType(TenantBase):
    """Definition of a mission type with required slots."""

    __tablename__ = "mission_types"

    name: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_hours: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_standby: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    standby_can_count_as_rest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    required_slots: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    pre_mission_events: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    post_mission_rule: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    timeline_items: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    specific_rule_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    notification_templates_override: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class MissionTemplate(TenantBase):
    """Recurring mission template."""

    __tablename__ = "mission_templates"

    schedule_window_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False
    )
    mission_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_types.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    recurrence: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    time_slots: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Mission(TenantBase):
    """Actual scheduled mission instance."""

    __tablename__ = "missions"

    schedule_window_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False
    )
    mission_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_types.id"), nullable=False
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_templates.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    is_activated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    override_justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    resources_assigned: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    assignments = relationship("MissionAssignment", back_populates="mission", lazy="selectin")


class MissionAssignment(Base):
    """Employee assigned to a mission slot."""

    __tablename__ = "mission_assignments"

    mission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("missions.id", ondelete="CASCADE"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )
    work_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_roles.id"), nullable=False
    )
    slot_id: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="assigned", nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    conflicts_detected: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    override_approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    replaced_by_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_assignments.id"), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    mission = relationship("Mission", back_populates="assignments")


class DailyBoardTemplate(TenantBase):
    """Template for daily board view layout and configuration."""

    __tablename__ = "daily_board_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    layout: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    columns: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    filters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SwapRequest(TenantBase):
    """Swap/give-away request between employees."""

    __tablename__ = "swap_requests"

    requester_employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )
    requester_assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_assignments.id"), nullable=False
    )
    target_employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=True
    )
    target_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mission_assignments.id"), nullable=True
    )
    swap_type: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    validation_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    target_response: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    target_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    channel: Mapped[str | None] = mapped_column(String(50), nullable=True)
