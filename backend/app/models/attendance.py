"""Attendance status definitions and schedule."""

import uuid
from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TenantBase


class AttendanceStatusDefinition(TenantBase):
    """Dynamic attendance status (present, home, sick, etc.)."""

    __tablename__ = "attendance_status_definitions"

    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[dict] = mapped_column(JSONB, nullable=False)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_schedulable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    schedulable_from_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    schedulable_notes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    triggers_rule_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    counts_as_present: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_attendance_status_code_per_tenant"),
    )


class AttendanceSchedule(TenantBase):
    """Daily attendance record per employee."""

    __tablename__ = "attendance_schedule"

    schedule_window_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    status_code: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    google_sheets_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "employee_id", "date", name="uq_attendance_per_day"),
    )


class AttendanceSyncConflict(TenantBase):
    """Conflict between Google Sheets and system attendance data."""

    __tablename__ = "attendance_sync_conflicts"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    system_value: Mapped[str] = mapped_column(String(50), nullable=False)
    sheets_value: Mapped[str] = mapped_column(String(50), nullable=False)
    sheets_raw_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conflict_reason: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
