"""Attendance endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.attendance import AttendanceSchedule, AttendanceStatusDefinition, AttendanceSyncConflict
from app.models.employee import Employee
from app.models.audit import AuditLog
from app.schemas.attendance import (
    AttendanceCreate, AttendanceUpdate, AttendanceBulkUpdate,
    AttendanceResponse, AttendanceStatusDefinitionResponse, AttendanceStatusCreate,
)

router = APIRouter()


@router.get("")
async def list_attendance(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    window_id: UUID | None = None,
    employee_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    """List attendance records with employee names."""
    query = select(AttendanceSchedule, Employee).join(
        Employee, AttendanceSchedule.employee_id == Employee.id
    ).where(AttendanceSchedule.tenant_id == tenant.id)

    if window_id:
        query = query.where(AttendanceSchedule.schedule_window_id == window_id)
    if employee_id:
        query = query.where(AttendanceSchedule.employee_id == employee_id)
    if date_from:
        query = query.where(AttendanceSchedule.date >= date_from)
    if date_to:
        query = query.where(AttendanceSchedule.date <= date_to)

    query = query.order_by(AttendanceSchedule.date, Employee.full_name)
    result = await db.execute(query)
    return [
        {
            "id": str(r.id),
            "tenant_id": str(r.tenant_id),
            "schedule_window_id": str(r.schedule_window_id),
            "employee_id": str(r.employee_id),
            "employee_name": emp.full_name,
            "employee_number": emp.employee_number,
            "date": str(r.date),
            "status_code": r.status_code,
            "notes": r.notes,
            "source": r.source,
            "created_at": str(r.created_at),
            "updated_at": str(r.updated_at),
        }
        for r, emp in result.all()
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_attendance(
    data: AttendanceCreate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or update attendance for a specific employee and date."""
    # Check if attendance already exists for this employee/date
    existing = await db.execute(
        select(AttendanceSchedule).where(
            AttendanceSchedule.tenant_id == tenant.id,
            AttendanceSchedule.employee_id == data.employee_id,
            AttendanceSchedule.date == data.date,
        )
    )
    record = existing.scalar_one_or_none()
    if record:
        # Update existing
        record.status_code = data.status_code
        record.notes = data.notes
        record.source = "manual"
    else:
        record = AttendanceSchedule(
            tenant_id=tenant.id,
            schedule_window_id=data.schedule_window_id,
            employee_id=data.employee_id,
            date=data.date,
            status_code=data.status_code,
            notes=data.notes,
            source="manual",
            created_by=user.id,
        )
        db.add(record)

    await db.flush()
    await db.refresh(record)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="set_attendance",
        entity_type="attendance", entity_id=record.id,
        after_state={"employee_id": str(data.employee_id), "date": str(data.date), "status": data.status_code},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return AttendanceResponse.model_validate(record).model_dump()


@router.patch("/{record_id}")
async def update_attendance(
    record_id: UUID,
    data: AttendanceUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(AttendanceSchedule).where(
            AttendanceSchedule.id == record_id,
            AttendanceSchedule.tenant_id == tenant.id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="רשומת נוכחות לא נמצאה")

    before = {"status_code": record.status_code}
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(record, key, value)
    await db.flush()
    await db.refresh(record)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update_attendance",
        entity_type="attendance", entity_id=record.id,
        before_state=before, after_state={"status_code": record.status_code},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return AttendanceResponse.model_validate(record).model_dump()


@router.post("/bulk")
async def bulk_update_attendance(
    data: AttendanceBulkUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Bulk update attendance for multiple employees on a date."""
    updated = 0
    created = 0
    for entry in data.entries:
        employee_id = entry.get("employee_id")
        status_code = entry.get("status_code", "present")
        notes = entry.get("notes")

        existing = await db.execute(
            select(AttendanceSchedule).where(
                AttendanceSchedule.tenant_id == tenant.id,
                AttendanceSchedule.employee_id == employee_id,
                AttendanceSchedule.date == data.date,
            )
        )
        record = existing.scalar_one_or_none()
        if record:
            record.status_code = status_code
            record.notes = notes
            updated += 1
        else:
            record = AttendanceSchedule(
                tenant_id=tenant.id,
                schedule_window_id=data.schedule_window_id,
                employee_id=employee_id,
                date=data.date,
                status_code=status_code,
                notes=notes,
                source="manual",
                created_by=user.id,
            )
            db.add(record)
            created += 1

    await db.commit()
    return {"updated": updated, "created": created}


@router.delete("/{record_id}", status_code=204)
async def delete_attendance(
    record_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(AttendanceSchedule).where(
            AttendanceSchedule.id == record_id,
            AttendanceSchedule.tenant_id == tenant.id,
        )
    )
    record = result.scalar_one_or_none()
    if record:
        await db.delete(record)
        await db.commit()


# ═══════════════════════════════════════════
# Attendance Status Definitions
# ═══════════════════════════════════════════

@router.get("/statuses")
async def list_status_definitions(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(AttendanceStatusDefinition)
        .where(AttendanceStatusDefinition.tenant_id == tenant.id)
        .order_by(AttendanceStatusDefinition.sort_order)
    )
    return [
        AttendanceStatusDefinitionResponse.model_validate(s).model_dump()
        for s in result.scalars().all()
    ]


@router.post("/statuses", status_code=status.HTTP_201_CREATED)
async def create_status_definition(
    data: AttendanceStatusCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    status_def = AttendanceStatusDefinition(tenant_id=tenant.id, **data.model_dump())
    db.add(status_def)
    await db.flush()
    await db.refresh(status_def)
    await db.commit()
    return AttendanceStatusDefinitionResponse.model_validate(status_def).model_dump()


# ═══════════════════════════════════════════
# Sync Conflicts
# ═══════════════════════════════════════════

@router.get("/conflicts")
async def list_sync_conflicts(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    status_filter: str = "pending",
) -> list[dict]:
    result = await db.execute(
        select(AttendanceSyncConflict, Employee)
        .join(Employee, AttendanceSyncConflict.employee_id == Employee.id)
        .where(
            AttendanceSyncConflict.tenant_id == tenant.id,
            AttendanceSyncConflict.status == status_filter,
        )
        .order_by(AttendanceSyncConflict.created_at.desc())
    )
    return [
        {
            "id": str(c.id),
            "employee_id": str(c.employee_id),
            "employee_name": emp.full_name,
            "date": str(c.date),
            "system_value": c.system_value,
            "sheets_value": c.sheets_value,
            "status": c.status,
            "created_at": str(c.created_at),
        }
        for c, emp in result.all()
    ]


@router.post("/conflicts/{conflict_id}/resolve")
async def resolve_conflict(
    conflict_id: UUID, resolution: dict,
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(AttendanceSyncConflict).where(
            AttendanceSyncConflict.id == conflict_id,
            AttendanceSyncConflict.tenant_id == tenant.id,
        )
    )
    conflict = result.scalar_one_or_none()
    if not conflict:
        raise HTTPException(status_code=404, detail="קונפליקט לא נמצא")
    from datetime import datetime
    conflict.status = "resolved"
    conflict.resolved_by = user.id
    conflict.resolved_at = datetime.utcnow()
    await db.commit()
    return {"id": str(conflict.id), "status": "resolved"}
