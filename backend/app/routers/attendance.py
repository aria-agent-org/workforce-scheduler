"""Attendance endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.attendance import AttendanceSchedule, AttendanceSyncConflict

router = APIRouter()


@router.get("")
async def list_attendance(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    window_id: UUID | None = None,
    employee_id: UUID | None = None,
) -> list[dict]:
    """List attendance records."""
    query = select(AttendanceSchedule).where(AttendanceSchedule.tenant_id == tenant.id)
    if window_id:
        query = query.where(AttendanceSchedule.schedule_window_id == window_id)
    if employee_id:
        query = query.where(AttendanceSchedule.employee_id == employee_id)
    query = query.order_by(AttendanceSchedule.date)
    result = await db.execute(query)
    records = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "employee_id": str(r.employee_id),
            "date": str(r.date),
            "status_code": r.status_code,
            "source": r.source,
        }
        for r in records
    ]


@router.get("/conflicts")
async def list_sync_conflicts(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List unresolved Google Sheets sync conflicts."""
    result = await db.execute(
        select(AttendanceSyncConflict)
        .where(
            AttendanceSyncConflict.tenant_id == tenant.id,
            AttendanceSyncConflict.status == "pending",
        )
        .order_by(AttendanceSyncConflict.created_at.desc())
    )
    conflicts = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "employee_id": str(c.employee_id),
            "date": str(c.date),
            "system_value": c.system_value,
            "sheets_value": c.sheets_value,
            "status": c.status,
        }
        for c in conflicts
    ]
