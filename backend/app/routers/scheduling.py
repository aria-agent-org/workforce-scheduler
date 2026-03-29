"""Scheduling endpoints: windows, missions, templates, assignments, swaps."""

from datetime import date, datetime, time, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.scheduling import (
    ScheduleWindow, ScheduleWindowEmployee, MissionType, MissionTemplate,
    Mission, MissionAssignment, SwapRequest,
)
from app.models.employee import Employee, EmployeeWorkRole
from app.models.audit import AuditLog
from app.schemas.scheduling import (
    ScheduleWindowCreate, ScheduleWindowUpdate, ScheduleWindowResponse,
    ScheduleWindowEmployeeAdd,
    MissionTypeCreate, MissionTypeUpdate, MissionTypeResponse,
    MissionTemplateCreate, MissionTemplateUpdate, MissionTemplateResponse,
    MissionCreate, MissionUpdate, MissionResponse,
    MissionGenerateRequest,
    MissionAssignmentCreate, MissionAssignmentResponse,
    SwapRequestCreate, SwapRequestResponse,
)

router = APIRouter()


# ═══════════════════════════════════════════
# Schedule Windows
# ═══════════════════════════════════════════

@router.get("/schedule-windows")
async def list_schedule_windows(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
) -> list[dict]:
    query = select(ScheduleWindow).where(ScheduleWindow.tenant_id == tenant.id)
    if status_filter:
        query = query.where(ScheduleWindow.status == status_filter)
    query = query.order_by(ScheduleWindow.start_date.desc())
    result = await db.execute(query)
    windows = result.scalars().all()
    items = []
    for w in windows:
        emp_count = (await db.execute(
            select(func.count()).where(ScheduleWindowEmployee.schedule_window_id == w.id)
        )).scalar() or 0
        items.append({
            "id": str(w.id),
            "tenant_id": str(w.tenant_id),
            "name": w.name,
            "start_date": str(w.start_date),
            "end_date": str(w.end_date),
            "status": w.status,
            "paused_at": str(w.paused_at) if w.paused_at else None,
            "notes": w.notes,
            "settings_override": w.settings_override,
            "employee_count": emp_count,
            "created_at": str(w.created_at),
            "updated_at": str(w.updated_at),
        })
    return items


@router.post("/schedule-windows", status_code=status.HTTP_201_CREATED)
async def create_schedule_window(
    data: ScheduleWindowCreate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    if data.end_date <= data.start_date:
        raise HTTPException(status_code=400, detail="תאריך סיום חייב להיות אחרי תאריך התחלה")
    window = ScheduleWindow(tenant_id=tenant.id, **data.model_dump())
    db.add(window)
    await db.flush()
    await db.refresh(window)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="schedule_window", entity_id=window.id,
        after_state={"name": window.name, "status": window.status},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {
        "id": str(window.id), "tenant_id": str(window.tenant_id),
        "name": window.name, "start_date": str(window.start_date),
        "end_date": str(window.end_date), "status": window.status,
        "notes": window.notes, "employee_count": 0,
        "created_at": str(window.created_at), "updated_at": str(window.updated_at),
    }


@router.get("/schedule-windows/{window_id}")
async def get_schedule_window(
    window_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    emp_count = (await db.execute(
        select(func.count()).where(ScheduleWindowEmployee.schedule_window_id == w.id)
    )).scalar() or 0
    return {
        "id": str(w.id), "tenant_id": str(w.tenant_id), "name": w.name,
        "start_date": str(w.start_date), "end_date": str(w.end_date),
        "status": w.status, "notes": w.notes, "employee_count": emp_count,
        "created_at": str(w.created_at), "updated_at": str(w.updated_at),
    }


@router.patch("/schedule-windows/{window_id}")
async def update_schedule_window(
    window_id: UUID, data: ScheduleWindowUpdate, tenant: CurrentTenant,
    user: CurrentUser, request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    before = {"name": w.name, "status": w.status}
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(w, key, value)
    await db.flush()
    await db.refresh(w)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update",
        entity_type="schedule_window", entity_id=w.id,
        before_state=before, after_state={"name": w.name, "status": w.status},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {"id": str(w.id), "name": w.name, "status": w.status,
            "start_date": str(w.start_date), "end_date": str(w.end_date)}


@router.post("/schedule-windows/{window_id}/pause")
async def pause_window(window_id: UUID, tenant: CurrentTenant, user: CurrentUser,
                       db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    if w.status != "active":
        raise HTTPException(status_code=400, detail="רק לוחות פעילים ניתנים להשהייה")
    w.status = "paused"
    w.paused_at = datetime.utcnow()
    await db.commit()
    return {"id": str(w.id), "status": "paused"}


@router.post("/schedule-windows/{window_id}/resume")
async def resume_window(window_id: UUID, tenant: CurrentTenant, user: CurrentUser,
                        db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    if w.status != "paused":
        raise HTTPException(status_code=400, detail="רק לוחות מושהים ניתנים לחידוש")
    w.status = "active"
    w.paused_at = None
    await db.commit()
    return {"id": str(w.id), "status": "active"}


class ResetWindowRequest(PydanticBaseModel):
    confirmation: str
    note: str | None = None


@router.post("/schedule-windows/{window_id}/reset")
async def reset_window(
    window_id: UUID,
    data: ResetWindowRequest,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reset a schedule window: delete draft/proposed missions, keep completed ones."""
    if data.confirmation != "אני מאשר איפוס":
        raise HTTPException(status_code=400, detail='יש להקליד "אני מאשר איפוס" לאישור')

    result = await db.execute(
        select(ScheduleWindow).where(
            ScheduleWindow.id == window_id,
            ScheduleWindow.tenant_id == tenant.id,
        )
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")

    # Delete missions in draft/proposed status
    missions_result = await db.execute(
        select(Mission).where(
            Mission.schedule_window_id == window_id,
            Mission.status.in_(["draft", "proposed"]),
        )
    )
    draft_missions = missions_result.scalars().all()
    deleted_count = 0
    for m in draft_missions:
        # Delete assignments first
        await db.execute(
            select(MissionAssignment).where(MissionAssignment.mission_id == m.id)
        )
        assignments = (await db.execute(
            select(MissionAssignment).where(MissionAssignment.mission_id == m.id)
        )).scalars().all()
        for a in assignments:
            await db.delete(a)
        await db.delete(m)
        deleted_count += 1

    # Reset window status to active
    w.status = "active"
    w.paused_at = None

    # Audit log
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="reset",
        entity_type="schedule_window",
        entity_id=window_id,
        after_state={
            "deleted_missions": deleted_count,
            "note": data.note,
        },
        ip_address=request.client.host if request.client else None,
    ))

    await db.commit()
    return {
        "id": str(w.id),
        "status": w.status,
        "deleted_missions": deleted_count,
        "note": data.note,
    }


@router.post("/schedule-windows/{window_id}/activate")
async def activate_window(window_id: UUID, tenant: CurrentTenant, user: CurrentUser,
                          db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    if w.status != "draft":
        raise HTTPException(status_code=400, detail="רק לוחות בטיוטה ניתנים להפעלה")
    w.status = "active"
    await db.commit()
    return {"id": str(w.id), "status": "active"}


@router.post("/schedule-windows/{window_id}/archive")
async def archive_window(window_id: UUID, tenant: CurrentTenant, user: CurrentUser,
                         db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    w.status = "archived"
    await db.commit()
    return {"id": str(w.id), "status": "archived"}


@router.post("/schedule-windows/{window_id}/copy", status_code=status.HTTP_201_CREATED)
async def copy_window(window_id: UUID, data: ScheduleWindowCreate,
                      tenant: CurrentTenant, user: CurrentUser,
                      db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="לוח מקור לא נמצא")
    new_window = ScheduleWindow(
        tenant_id=tenant.id, name=data.name,
        start_date=data.start_date, end_date=data.end_date,
        settings_override=source.settings_override, template_id=source.id,
    )
    db.add(new_window)
    await db.flush()
    # Copy employees
    emp_result = await db.execute(
        select(ScheduleWindowEmployee).where(ScheduleWindowEmployee.schedule_window_id == source.id)
    )
    for swe in emp_result.scalars().all():
        db.add(ScheduleWindowEmployee(
            schedule_window_id=new_window.id, employee_id=swe.employee_id,
        ))
    await db.commit()
    await db.refresh(new_window)
    return {"id": str(new_window.id), "name": new_window.name, "status": new_window.status}


@router.post("/schedule-windows/{window_id}/employees")
async def add_employees_to_window(
    window_id: UUID, data: ScheduleWindowEmployeeAdd,
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    added = 0
    for eid in data.employee_ids:
        existing = await db.execute(
            select(ScheduleWindowEmployee).where(
                ScheduleWindowEmployee.schedule_window_id == window_id,
                ScheduleWindowEmployee.employee_id == eid,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(ScheduleWindowEmployee(schedule_window_id=window_id, employee_id=eid))
            added += 1
    await db.commit()
    return {"added": added}


@router.delete("/schedule-windows/{window_id}/employees/{employee_id}", status_code=204)
async def remove_employee_from_window(
    window_id: UUID, employee_id: UUID,
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(ScheduleWindowEmployee).where(
            ScheduleWindowEmployee.schedule_window_id == window_id,
            ScheduleWindowEmployee.employee_id == employee_id,
        )
    )
    swe = result.scalar_one_or_none()
    if swe:
        await db.delete(swe)
        await db.commit()


@router.get("/schedule-windows/{window_id}/employees")
async def list_window_employees(
    window_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(ScheduleWindowEmployee, Employee)
        .join(Employee, ScheduleWindowEmployee.employee_id == Employee.id)
        .where(ScheduleWindowEmployee.schedule_window_id == window_id)
        .order_by(Employee.full_name)
    )
    return [
        {
            "id": str(swe.id),
            "employee_id": str(e.id),
            "full_name": e.full_name,
            "employee_number": e.employee_number,
            "status": e.status,
            "is_active": e.is_active,
        }
        for swe, e in result.all()
    ]


# ═══════════════════════════════════════════
# Mission Types
# ═══════════════════════════════════════════

@router.get("/mission-types")
async def list_mission_types(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    active_only: bool = True,
) -> list[dict]:
    query = select(MissionType).where(MissionType.tenant_id == tenant.id)
    if active_only:
        query = query.where(MissionType.is_active.is_(True))
    query = query.order_by(MissionType.created_at)
    result = await db.execute(query)
    return [MissionTypeResponse.model_validate(mt).model_dump() for mt in result.scalars().all()]


@router.post("/mission-types", status_code=status.HTTP_201_CREATED)
async def create_mission_type(
    data: MissionTypeCreate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    mt = MissionType(tenant_id=tenant.id, **data.model_dump())
    db.add(mt)
    await db.flush()
    await db.refresh(mt)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="mission_type", entity_id=mt.id,
        after_state={"name": mt.name},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return MissionTypeResponse.model_validate(mt).model_dump()


@router.get("/mission-types/{mt_id}")
async def get_mission_type(
    mt_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(MissionType).where(MissionType.id == mt_id, MissionType.tenant_id == tenant.id)
    )
    mt = result.scalar_one_or_none()
    if not mt:
        raise HTTPException(status_code=404, detail="סוג משימה לא נמצא")
    return MissionTypeResponse.model_validate(mt).model_dump()


@router.patch("/mission-types/{mt_id}")
async def update_mission_type(
    mt_id: UUID, data: MissionTypeUpdate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(MissionType).where(MissionType.id == mt_id, MissionType.tenant_id == tenant.id)
    )
    mt = result.scalar_one_or_none()
    if not mt:
        raise HTTPException(status_code=404, detail="סוג משימה לא נמצא")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(mt, key, value)
    await db.flush()
    await db.refresh(mt)
    await db.commit()
    return MissionTypeResponse.model_validate(mt).model_dump()


@router.delete("/mission-types/{mt_id}", status_code=204)
async def delete_mission_type(
    mt_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(MissionType).where(MissionType.id == mt_id, MissionType.tenant_id == tenant.id)
    )
    mt = result.scalar_one_or_none()
    if not mt:
        raise HTTPException(status_code=404, detail="סוג משימה לא נמצא")

    # Check if active missions use this type
    active_count = (await db.execute(
        select(func.count()).where(
            Mission.mission_type_id == mt_id,
            Mission.status.not_in(["cancelled", "archived"]),
        )
    )).scalar() or 0
    if active_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"לא ניתן למחוק סוג משימה עם {active_count} משימות פעילות"
        )

    mt.is_active = False
    await db.commit()


# ═══════════════════════════════════════════
# Mission Templates
# ═══════════════════════════════════════════

@router.get("/mission-templates")
async def list_mission_templates(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    window_id: UUID | None = None,
) -> list[dict]:
    query = select(MissionTemplate).where(MissionTemplate.tenant_id == tenant.id)
    if window_id:
        query = query.where(MissionTemplate.schedule_window_id == window_id)
    result = await db.execute(query.order_by(MissionTemplate.name))
    return [MissionTemplateResponse.model_validate(t).model_dump() for t in result.scalars().all()]


@router.post("/mission-templates", status_code=status.HTTP_201_CREATED)
async def create_mission_template(
    data: MissionTemplateCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    tmpl = MissionTemplate(tenant_id=tenant.id, **data.model_dump())
    db.add(tmpl)
    await db.flush()
    await db.refresh(tmpl)
    await db.commit()
    return MissionTemplateResponse.model_validate(tmpl).model_dump()


@router.patch("/mission-templates/{tmpl_id}")
async def update_mission_template(
    tmpl_id: UUID, data: MissionTemplateUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(MissionTemplate).where(MissionTemplate.id == tmpl_id, MissionTemplate.tenant_id == tenant.id)
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="תבנית לא נמצאה")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tmpl, key, value)
    await db.flush()
    await db.refresh(tmpl)
    await db.commit()
    return MissionTemplateResponse.model_validate(tmpl).model_dump()


@router.delete("/mission-templates/{tmpl_id}", status_code=204)
async def delete_mission_template(
    tmpl_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(MissionTemplate).where(MissionTemplate.id == tmpl_id, MissionTemplate.tenant_id == tenant.id)
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="תבנית לא נמצאה")
    tmpl.is_active = False
    await db.commit()


# ═══════════════════════════════════════════
# Missions
# ═══════════════════════════════════════════

@router.get("/missions")
async def list_missions(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    window_id: UUID | None = None, date_from: date | None = None, date_to: date | None = None,
    status_filter: str | None = None,
) -> list[dict]:
    query = select(Mission).where(Mission.tenant_id == tenant.id)
    if window_id:
        query = query.where(Mission.schedule_window_id == window_id)
    if date_from:
        query = query.where(Mission.date >= date_from)
    if date_to:
        query = query.where(Mission.date <= date_to)
    if status_filter:
        query = query.where(Mission.status == status_filter)
    query = query.order_by(Mission.date, Mission.start_time)
    result = await db.execute(query)
    missions = result.scalars().all()
    items = []
    for m in missions:
        # Get mission type name
        mt_result = await db.execute(select(MissionType).where(MissionType.id == m.mission_type_id))
        mt = mt_result.scalar_one_or_none()
        # Get assignments
        assign_result = await db.execute(
            select(MissionAssignment, Employee)
            .join(Employee, MissionAssignment.employee_id == Employee.id)
            .where(MissionAssignment.mission_id == m.id)
        )
        assignments = []
        for ma, emp in assign_result.all():
            assignments.append({
                "id": str(ma.id),
                "employee_id": str(ma.employee_id),
                "employee_name": emp.full_name,
                "work_role_id": str(ma.work_role_id),
                "slot_id": ma.slot_id,
                "status": ma.status,
                "conflicts_detected": ma.conflicts_detected,
            })
        items.append({
            "id": str(m.id),
            "tenant_id": str(m.tenant_id),
            "schedule_window_id": str(m.schedule_window_id),
            "mission_type_id": str(m.mission_type_id),
            "mission_type_name": mt.name if mt else None,
            "template_id": str(m.template_id) if m.template_id else None,
            "name": m.name,
            "date": str(m.date),
            "start_time": str(m.start_time),
            "end_time": str(m.end_time),
            "status": m.status,
            "is_activated": m.is_activated,
            "version": m.version,
            "assignments": assignments,
            "created_at": str(m.created_at),
            "updated_at": str(m.updated_at),
        })
    return items


@router.post("/missions", status_code=status.HTTP_201_CREATED)
async def create_mission(
    data: MissionCreate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    # Validate window exists
    w_result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == data.schedule_window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    if not w_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")
    # Validate mission type exists
    mt_result = await db.execute(
        select(MissionType).where(MissionType.id == data.mission_type_id, MissionType.tenant_id == tenant.id)
    )
    if not mt_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="סוג משימה לא נמצא")

    mission = Mission(
        tenant_id=tenant.id, created_by=user.id,
        **data.model_dump(),
    )
    db.add(mission)
    await db.flush()
    await db.refresh(mission)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="mission", entity_id=mission.id,
        after_state={"name": mission.name, "date": str(mission.date)},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {
        "id": str(mission.id), "name": mission.name, "date": str(mission.date),
        "start_time": str(mission.start_time), "end_time": str(mission.end_time),
        "status": mission.status, "assignments": [],
        "schedule_window_id": str(mission.schedule_window_id),
        "mission_type_id": str(mission.mission_type_id),
    }


@router.patch("/missions/{mission_id}")
async def update_mission(
    mission_id: UUID, data: MissionUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(m, key, value)
    m.version += 1
    await db.flush()
    await db.refresh(m)
    await db.commit()
    return {"id": str(m.id), "name": m.name, "status": m.status, "version": m.version}


@router.post("/missions/{mission_id}/approve")
async def approve_mission(
    mission_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")
    m.status = "approved"
    m.approved_by = user.id
    m.approved_at = datetime.utcnow()
    await db.commit()
    return {"id": str(m.id), "status": "approved"}


@router.post("/missions/{mission_id}/cancel")
async def cancel_mission(
    mission_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")
    m.status = "cancelled"
    await db.commit()
    return {"id": str(m.id), "status": "cancelled"}


@router.post("/missions/generate")
async def generate_missions(
    data: MissionGenerateRequest, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate mission instances from a template for a date range."""
    tmpl_result = await db.execute(
        select(MissionTemplate).where(MissionTemplate.id == data.template_id, MissionTemplate.tenant_id == tenant.id)
    )
    tmpl = tmpl_result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="תבנית לא נמצאה")

    mt_result = await db.execute(select(MissionType).where(MissionType.id == tmpl.mission_type_id))
    mt = mt_result.scalar_one_or_none()

    recurrence = tmpl.recurrence or {"type": "daily"}
    time_slots = tmpl.time_slots or [{"start": "08:00", "end": "16:00"}]

    created_missions = []
    current = data.start_date
    while current <= data.end_date:
        should_create = False
        rec_type = recurrence.get("type", "daily")
        if rec_type == "daily":
            should_create = True
        elif rec_type == "weekly":
            days = recurrence.get("days", [])
            if current.weekday() in days:
                should_create = True
        elif rec_type == "specific_days":
            days = recurrence.get("days", [])
            if current.weekday() in days:
                should_create = True

        if should_create:
            for slot in time_slots:
                start_parts = slot.get("start", "08:00").split(":")
                end_parts = slot.get("end", "16:00").split(":")
                mission = Mission(
                    tenant_id=tenant.id,
                    schedule_window_id=tmpl.schedule_window_id,
                    mission_type_id=tmpl.mission_type_id,
                    template_id=tmpl.id,
                    name=f"{tmpl.name} - {current.isoformat()}",
                    date=current,
                    start_time=time(int(start_parts[0]), int(start_parts[1])),
                    end_time=time(int(end_parts[0]), int(end_parts[1])),
                    created_by=user.id,
                )
                db.add(mission)
                await db.flush()
                await db.refresh(mission)
                created_missions.append({
                    "id": str(mission.id), "name": mission.name,
                    "date": str(mission.date), "status": mission.status,
                })

        current += timedelta(days=1)

    await db.commit()
    return {"created": len(created_missions), "missions": created_missions}


# ═══════════════════════════════════════════
# Mission Assignments
# ═══════════════════════════════════════════

@router.get("/missions/{mission_id}/assignments")
async def list_assignments(
    mission_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(MissionAssignment, Employee)
        .join(Employee, MissionAssignment.employee_id == Employee.id)
        .where(MissionAssignment.mission_id == mission_id)
    )
    return [
        {
            "id": str(ma.id),
            "mission_id": str(ma.mission_id),
            "employee_id": str(ma.employee_id),
            "employee_name": emp.full_name,
            "work_role_id": str(ma.work_role_id),
            "slot_id": ma.slot_id,
            "status": ma.status,
            "conflicts_detected": ma.conflicts_detected,
            "assigned_at": str(ma.assigned_at) if ma.assigned_at else None,
        }
        for ma, emp in result.all()
    ]


@router.post("/missions/{mission_id}/assignments", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    mission_id: UUID, data: MissionAssignmentCreate,
    tenant: CurrentTenant, user: CurrentUser, request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Validate mission
    m_result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    mission = m_result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")

    # Check for conflicts (same employee, overlapping time on same date)
    conflicts = []
    conflict_result = await db.execute(
        select(MissionAssignment, Mission)
        .join(Mission, MissionAssignment.mission_id == Mission.id)
        .where(
            MissionAssignment.employee_id == data.employee_id,
            Mission.date == mission.date,
            Mission.id != mission_id,
            MissionAssignment.status != "replaced",
        )
    )
    for existing_ma, existing_m in conflict_result.all():
        # Simple time overlap check
        if (existing_m.start_time < mission.end_time and existing_m.end_time > mission.start_time):
            conflicts.append({
                "type": "time_overlap",
                "mission_id": str(existing_m.id),
                "mission_name": existing_m.name,
                "time": f"{existing_m.start_time}-{existing_m.end_time}",
            })

    assignment = MissionAssignment(
        mission_id=mission_id,
        employee_id=data.employee_id,
        work_role_id=data.work_role_id,
        slot_id=data.slot_id,
        assigned_at=datetime.utcnow(),
        conflicts_detected=conflicts if conflicts else None,
    )
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)

    # Get employee name
    emp_result = await db.execute(select(Employee).where(Employee.id == data.employee_id))
    emp = emp_result.scalar_one_or_none()

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="assign",
        entity_type="mission_assignment", entity_id=assignment.id,
        after_state={"employee": emp.full_name if emp else str(data.employee_id), "mission": mission.name},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {
        "id": str(assignment.id),
        "mission_id": str(mission_id),
        "employee_id": str(data.employee_id),
        "employee_name": emp.full_name if emp else None,
        "work_role_id": str(data.work_role_id),
        "slot_id": data.slot_id,
        "status": assignment.status,
        "conflicts_detected": assignment.conflicts_detected,
        "assigned_at": str(assignment.assigned_at),
    }


@router.delete("/missions/{mission_id}/assignments/{assignment_id}", status_code=204)
async def remove_assignment(
    mission_id: UUID, assignment_id: UUID,
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(MissionAssignment).where(
            MissionAssignment.id == assignment_id,
            MissionAssignment.mission_id == mission_id,
        )
    )
    ma = result.scalar_one_or_none()
    if not ma:
        raise HTTPException(status_code=404, detail="שיבוץ לא נמצא")
    ma.status = "replaced"
    await db.commit()


# ═══════════════════════════════════════════
# Smart Manual Assignment — Eligible Soldiers
# ═══════════════════════════════════════════

@router.get("/missions/{mission_id}/eligible-soldiers/{slot_id}")
async def get_eligible_soldiers(
    mission_id: UUID, slot_id: str,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Get eligible soldiers for a mission slot, scored and sorted."""
    # Get mission
    m_result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    mission = m_result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")

    # Get mission type to find slot's required work_role
    mt_result = await db.execute(select(MissionType).where(MissionType.id == mission.mission_type_id))
    mt = mt_result.scalar_one_or_none()
    required_work_role_id = None
    if mt and mt.required_slots:
        for slot in mt.required_slots:
            if slot.get("slot_id") == slot_id:
                required_work_role_id = slot.get("work_role_id")
                break

    # Get employees in the schedule window
    emp_query = (
        select(Employee)
        .join(ScheduleWindowEmployee, ScheduleWindowEmployee.employee_id == Employee.id)
        .where(
            ScheduleWindowEmployee.schedule_window_id == mission.schedule_window_id,
            Employee.is_active.is_(True),
        )
    )
    emp_result = await db.execute(emp_query)
    employees = emp_result.scalars().all()

    # Fallback: if no employees in the schedule window, use all active employees in tenant
    if not employees:
        fallback_result = await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.is_active.is_(True),
            )
        )
        employees = fallback_result.scalars().all()

    # If required_work_role_id, filter by work role
    if required_work_role_id:
        wr_result = await db.execute(
            select(EmployeeWorkRole.employee_id).where(
                EmployeeWorkRole.work_role_id == required_work_role_id
            )
        )
        valid_emp_ids = {row[0] for row in wr_result.all()}
        employees = [e for e in employees if e.id in valid_emp_ids]

    # Include all employees — if status is not "present", add a warning but don't exclude
    results = []
    for emp in employees:
        warnings = []
        score = 100

        # Warn if not present
        if emp.status not in ("present", "returning_home", "training"):
            score -= 40
            warnings.append(f"סטטוס נוכחות: {emp.status}")

        # Check time conflicts on same day
        conflict_result = await db.execute(
            select(MissionAssignment, Mission)
            .join(Mission, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == emp.id,
                Mission.date == mission.date,
                MissionAssignment.status != "replaced",
            )
        )
        day_assignments = conflict_result.all()
        has_hard_conflict = False

        for ma, existing_m in day_assignments:
            # Check time overlap
            if existing_m.start_time < mission.end_time and existing_m.end_time > mission.start_time:
                has_hard_conflict = True
                break
            score -= 10  # Penalty per existing assignment

        if has_hard_conflict:
            continue  # Skip soldiers with hard time conflicts

        # Check rest hours since last mission (look at yesterday + today)
        yesterday = mission.date - timedelta(days=1)
        recent_result = await db.execute(
            select(Mission)
            .join(MissionAssignment, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == emp.id,
                Mission.date.in_([yesterday, mission.date]),
                MissionAssignment.status != "replaced",
            )
            .order_by(Mission.date.desc(), Mission.end_time.desc())
        )
        recent_missions = recent_result.scalars().all()
        if recent_missions:
            last = recent_missions[0]
            # Calculate hours since last mission ended
            last_end = datetime.combine(last.date, last.end_time)
            this_start = datetime.combine(mission.date, mission.start_time)
            hours_rest = (this_start - last_end).total_seconds() / 3600
            if hours_rest < 16:
                score -= 30
                warnings.append(f"{hours_rest:.0f} שעות מנוחה בלבד (מינימום 16)")
            elif hours_rest < 18:
                score -= 20
                warnings.append(f"{hours_rest:.0f} שעות מנוחה בלבד (מינימום 18)")

        # Already assigned today count
        if len(day_assignments) > 0:
            warnings.append(f"כבר משובץ ל-{len(day_assignments)} משימות היום")

        is_recommended = score >= 70 and len(warnings) == 0

        results.append({
            "employee_id": str(emp.id),
            "employee_name": emp.full_name,
            "employee_number": emp.employee_number,
            "score": max(0, score),
            "warnings": warnings,
            "is_recommended": is_recommended,
            "status": emp.status,
        })

    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ═══════════════════════════════════════════
# Auto-Scheduling
# ═══════════════════════════════════════════

class AutoAssignRequest(PydanticBaseModel):
    schedule_window_id: UUID | None = None
    window_id: UUID | None = None
    date_from: date | None = None
    date_to: date | None = None


@router.post("/missions/auto-assign", status_code=status.HTTP_200_OK)
async def auto_assign_missions(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    body: AutoAssignRequest | None = None,
    window_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Production auto-scheduling: hard filter → scoring → preference optimization → conflict check."""
    from app.services.scheduling_service import AutoScheduler

    # Accept window_id from query param or body (schedule_window_id or window_id)
    resolved_window_id = window_id
    if not resolved_window_id and body:
        resolved_window_id = body.schedule_window_id or body.window_id
    if body and not date_from:
        date_from = body.date_from
    if body and not date_to:
        date_to = body.date_to

    if not resolved_window_id:
        raise HTTPException(status_code=400, detail="נדרש מזהה לוח עבודה")
    window_id = resolved_window_id

    scheduler = AutoScheduler(db, tenant.id, user.id)
    result = await scheduler.run(window_id, date_from, date_to)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


# Legacy fallback kept for backwards compat
@router.post("/missions/auto-assign-simple", status_code=status.HTTP_200_OK)
async def auto_assign_missions_simple(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    window_id: UUID | None = None,
) -> dict:
    """Simple auto-assignment fallback."""
    query = select(Mission).where(
        Mission.tenant_id == tenant.id,
        Mission.status == "draft",
    )
    if window_id:
        query = query.where(Mission.schedule_window_id == window_id)
    missions_result = await db.execute(query.order_by(Mission.date, Mission.start_time))
    missions = missions_result.scalars().all()

    total_assigned = 0
    for mission in missions:
        mt_result = await db.execute(select(MissionType).where(MissionType.id == mission.mission_type_id))
        mt = mt_result.scalar_one_or_none()
        if not mt or not mt.required_slots:
            continue

        required_slots = mt.required_slots if isinstance(mt.required_slots, list) else []
        existing = await db.execute(
            select(MissionAssignment).where(
                MissionAssignment.mission_id == mission.id,
                MissionAssignment.status != "replaced",
            )
        )
        filled_slots = {ma.slot_id for ma in existing.scalars().all()}

        window_emps = await db.execute(
            select(ScheduleWindowEmployee, Employee)
            .join(Employee, ScheduleWindowEmployee.employee_id == Employee.id)
            .where(
                ScheduleWindowEmployee.schedule_window_id == mission.schedule_window_id,
                Employee.is_active.is_(True),
            )
        )
        available_employees = [(swe, emp) for swe, emp in window_emps.all()]

        for slot in required_slots:
            slot_id = slot.get("slot_id", "default")
            work_role_id = slot.get("work_role_id")
            count = slot.get("count", 1)

            if slot_id in filled_slots:
                continue

            for i in range(count):
                slot_key = f"{slot_id}_{i}" if count > 1 else slot_id
                if slot_key in filled_slots:
                    continue

                for swe, emp in available_employees:
                    already = await db.execute(
                        select(MissionAssignment).where(
                            MissionAssignment.mission_id == mission.id,
                            MissionAssignment.employee_id == emp.id,
                            MissionAssignment.status != "replaced",
                        )
                    )
                    if already.scalar_one_or_none():
                        continue

                    # Check time conflicts
                    conflict_check = await db.execute(
                        select(MissionAssignment)
                        .join(Mission, MissionAssignment.mission_id == Mission.id)
                        .where(
                            MissionAssignment.employee_id == emp.id,
                            Mission.date == mission.date,
                            Mission.start_time < mission.end_time,
                            Mission.end_time > mission.start_time,
                            MissionAssignment.status != "replaced",
                        )
                    )
                    if conflict_check.scalar_one_or_none():
                        continue

                    # Assign
                    assignment = MissionAssignment(
                        mission_id=mission.id,
                        employee_id=emp.id,
                        work_role_id=work_role_id or emp.id,  # fallback
                        slot_id=slot_key,
                        assigned_at=datetime.utcnow(),
                    )
                    db.add(assignment)
                    total_assigned += 1
                    filled_slots.add(slot_key)
                    break

    await db.commit()
    return {"total_assigned": total_assigned, "missions_processed": len(missions)}


# ═══════════════════════════════════════════
# Swap Requests
# ═══════════════════════════════════════════

@router.get("/swap-requests")
async def list_swap_requests(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
) -> list[dict]:
    query = select(SwapRequest).where(SwapRequest.tenant_id == tenant.id)
    if status_filter:
        query = query.where(SwapRequest.status == status_filter)
    query = query.order_by(SwapRequest.created_at.desc())
    result = await db.execute(query)
    items = []
    for sr in result.scalars().all():
        # Get requester name
        req_emp = await db.execute(select(Employee).where(Employee.id == sr.requester_employee_id))
        requester = req_emp.scalar_one_or_none()
        target_name = None
        if sr.target_employee_id:
            tgt_emp = await db.execute(select(Employee).where(Employee.id == sr.target_employee_id))
            target = tgt_emp.scalar_one_or_none()
            target_name = target.full_name if target else None
        items.append({
            "id": str(sr.id),
            "requester_employee_id": str(sr.requester_employee_id),
            "requester_name": requester.full_name if requester else None,
            "target_employee_id": str(sr.target_employee_id) if sr.target_employee_id else None,
            "target_name": target_name,
            "swap_type": sr.swap_type,
            "reason": sr.reason,
            "status": sr.status,
            "validation_result": sr.validation_result,
            "target_response": sr.target_response,
            "created_at": str(sr.created_at),
        })
    return items


@router.post("/swap-requests", status_code=status.HTTP_201_CREATED)
async def create_swap_request(
    data: SwapRequestCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Validate assignment exists
    assign_result = await db.execute(
        select(MissionAssignment).where(MissionAssignment.id == data.requester_assignment_id)
    )
    assignment = assign_result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="שיבוץ לא נמצא")

    sr = SwapRequest(
        tenant_id=tenant.id,
        requester_employee_id=assignment.employee_id,
        requester_assignment_id=data.requester_assignment_id,
        target_employee_id=data.target_employee_id,
        target_assignment_id=data.target_assignment_id,
        swap_type=data.swap_type,
        reason=data.reason,
    )
    db.add(sr)
    await db.flush()
    await db.refresh(sr)
    await db.commit()
    return {"id": str(sr.id), "status": sr.status, "swap_type": sr.swap_type}


@router.post("/swap-requests/{sr_id}/approve")
async def approve_swap_request(
    sr_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(SwapRequest).where(SwapRequest.id == sr_id, SwapRequest.tenant_id == tenant.id)
    )
    sr = result.scalar_one_or_none()
    if not sr:
        raise HTTPException(status_code=404, detail="בקשת החלפה לא נמצאה")
    if sr.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לאשר רק בקשות ממתינות")
    sr.status = "approved"
    sr.approved_by = user.id
    await db.commit()
    return {"id": str(sr.id), "status": "approved"}


@router.post("/swap-requests/{sr_id}/reject")
async def reject_swap_request(
    sr_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(SwapRequest).where(SwapRequest.id == sr_id, SwapRequest.tenant_id == tenant.id)
    )
    sr = result.scalar_one_or_none()
    if not sr:
        raise HTTPException(status_code=404, detail="בקשת החלפה לא נמצאה")
    sr.status = "rejected"
    await db.commit()
    return {"id": str(sr.id), "status": "rejected"}
