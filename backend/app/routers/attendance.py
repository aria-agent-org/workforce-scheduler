"""Attendance endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.permissions import require_permission
from app.models.attendance import AttendanceSchedule, AttendanceStatusDefinition, AttendanceSyncConflict
from app.models.employee import Employee
from app.models.audit import AuditLog
from app.models.scheduling import ScheduleWindow
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


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("attendance", "write"))])
async def create_attendance(
    data: AttendanceCreate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or update attendance for a specific employee and date."""
    # Check if attendance already exists for this employee/date (unique per day across all windows)
    existing = await db.execute(
        select(AttendanceSchedule).where(
            AttendanceSchedule.tenant_id == tenant.id,
            AttendanceSchedule.employee_id == data.employee_id,
            AttendanceSchedule.date == data.date,
        )
    )
    record = existing.scalar_one_or_none()
    if record:
        # Update existing — also reassign to the current window
        record.status_code = data.status_code
        record.notes = data.notes
        record.source = "manual"
        record.schedule_window_id = data.schedule_window_id
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
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
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
    from datetime import datetime, timezone
    from app.models.scheduling import Mission, MissionAssignment

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
    update_data = data.model_dump(exclude_unset=True)
    new_status = update_data.get("status_code", record.status_code)

    for key, value in update_data.items():
        setattr(record, key, value)
    await db.flush()
    await db.refresh(record)

    # === Status workflow: check future assignments today ===
    warnings: list[str] = []
    now = datetime.now(timezone.utc)
    current_time = now.time()

    if new_status in ("home", "going_home", "sick"):
        # Find future assignments for this employee today
        future_assignments_result = await db.execute(
            select(MissionAssignment, Mission)
            .join(Mission, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == record.employee_id,
                Mission.date == record.date,
                Mission.start_time > current_time,
                MissionAssignment.status.not_in(["replaced", "cancelled"]),
            )
        )
        future_assignments = future_assignments_result.all()

        for ma, mission in future_assignments:
            warnings.append(f"החייל משובץ למשימה בשעה {str(mission.start_time)[:5]}")

        # If sick — flag all future assignments as needing replacement
        if new_status == "sick":
            for ma, mission in future_assignments:
                ma.status = "needs_replacement"
            if future_assignments:
                warnings.append(f"סומנו {len(future_assignments)} שיבוצים כדורשי החלפה")

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update_attendance",
        entity_type="attendance", entity_id=record.id,
        before_state=before, after_state={"status_code": record.status_code},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()

    response = AttendanceResponse.model_validate(record).model_dump()
    if warnings:
        response["warnings"] = warnings
    response["updated"] = True
    return response


@router.post("/bulk", dependencies=[Depends(require_permission("attendance", "write"))])
async def bulk_update_attendance(
    data: AttendanceBulkUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Bulk update attendance for multiple employees on a date."""
    # Validate schedule_window_id exists and belongs to this tenant
    win_check = await db.execute(
        select(ScheduleWindow).where(
            ScheduleWindow.id == data.schedule_window_id,
            ScheduleWindow.tenant_id == tenant.id,
        )
    )
    if not win_check.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"חלון לוח זמנים {data.schedule_window_id} לא נמצא. בחר חלון תקין.",
        )

    updated = 0
    created = 0
    for entry in data.entries:
        employee_id = entry.get("employee_id")
        status_code = entry.get("status_code", "present")
        notes = entry.get("notes")

        # Find existing record by tenant + employee + date (unique constraint)
        existing = await db.execute(
            select(AttendanceSchedule).where(
                AttendanceSchedule.tenant_id == tenant.id,
                AttendanceSchedule.employee_id == employee_id,
                AttendanceSchedule.date == data.date,
            )
        )
        record = existing.scalar_one_or_none()
        if record:
            # Update status and reassign to the current window
            record.status_code = status_code
            record.notes = notes
            record.schedule_window_id = data.schedule_window_id
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
    # Check for duplicate code
    existing = await db.execute(
        select(AttendanceStatusDefinition).where(
            AttendanceStatusDefinition.tenant_id == tenant.id,
            AttendanceStatusDefinition.code == data.code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"קוד סטטוס '{data.code}' כבר קיים")
    status_def = AttendanceStatusDefinition(tenant_id=tenant.id, **data.model_dump())
    db.add(status_def)
    await db.flush()
    await db.refresh(status_def)
    await db.commit()
    return AttendanceStatusDefinitionResponse.model_validate(status_def).model_dump()


@router.get("/statuses/{status_id}")
async def get_status_definition(
    status_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(AttendanceStatusDefinition).where(
            AttendanceStatusDefinition.id == status_id,
            AttendanceStatusDefinition.tenant_id == tenant.id,
        )
    )
    status_def = result.scalar_one_or_none()
    if not status_def:
        raise HTTPException(status_code=404, detail="סטטוס נוכחות לא נמצא")
    return AttendanceStatusDefinitionResponse.model_validate(status_def).model_dump()


@router.patch("/statuses/{status_id}")
async def update_status_definition(
    status_id: UUID, data: dict,
    tenant: CurrentTenant, user: CurrentUser, request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(AttendanceStatusDefinition).where(
            AttendanceStatusDefinition.id == status_id,
            AttendanceStatusDefinition.tenant_id == tenant.id,
        )
    )
    status_def = result.scalar_one_or_none()
    if not status_def:
        raise HTTPException(status_code=404, detail="סטטוס נוכחות לא נמצא")

    before = {"code": status_def.code, "name": status_def.name}
    for key, value in data.items():
        if hasattr(status_def, key) and key not in ("id", "tenant_id", "created_at", "updated_at"):
            setattr(status_def, key, value)

    await db.flush()
    await db.refresh(status_def)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update",
        entity_type="attendance_status_definition", entity_id=status_def.id,
        before_state=before, after_state={"code": status_def.code, "name": status_def.name},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return AttendanceStatusDefinitionResponse.model_validate(status_def).model_dump()


@router.delete("/statuses/{status_id}", status_code=204)
async def delete_status_definition(
    status_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(AttendanceStatusDefinition).where(
            AttendanceStatusDefinition.id == status_id,
            AttendanceStatusDefinition.tenant_id == tenant.id,
        )
    )
    status_def = result.scalar_one_or_none()
    if not status_def:
        raise HTTPException(status_code=404, detail="סטטוס נוכחות לא נמצא")
    if status_def.is_system:
        raise HTTPException(status_code=403, detail="לא ניתן למחוק סטטוס מערכת")
    # Check if status is in use
    in_use = await db.execute(
        select(func.count()).where(
            AttendanceSchedule.tenant_id == tenant.id,
            AttendanceSchedule.status_code == status_def.code,
        )
    )
    if (in_use.scalar() or 0) > 0:
        raise HTTPException(status_code=409, detail="לא ניתן למחוק סטטוס שבשימוש")
    await db.delete(status_def)
    await db.commit()


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


@router.post("/sync")
async def trigger_sync(
    data: dict,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Trigger a Google Sheets sync (placeholder — actual sync via Celery task)."""
    # In production, this would enqueue a Celery task
    return {
        "status": "queued",
        "message": "סנכרון נשלח לתור עיבוד",
        "spreadsheet_id": data.get("spreadsheet_id", ""),
    }


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
    from datetime import datetime, timezone
    conflict.status = "resolved"
    conflict.resolved_by = user.id
    conflict.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return {"id": str(conflict.id), "status": "resolved"}
