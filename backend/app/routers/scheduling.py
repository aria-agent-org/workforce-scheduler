"""Scheduling endpoints: windows, missions, templates, assignments, swaps."""

from datetime import date, datetime, time, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.permissions import require_permission
from app.models.scheduling import (
    ScheduleWindow, ScheduleWindowEmployee, MissionType, MissionTemplate,
    Mission, MissionAssignment, SwapRequest, DailyBoardTemplate,
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
from app.schemas.jsonb_validators import MissionSlot, RecurrencePattern, TimelineItem
from pydantic import ValidationError as PydanticValidationError

router = APIRouter()


def _validate_jsonb(items: list | None, model_cls: type, field_name: str) -> None:
    """Validate a list of JSONB items against a Pydantic model. Raises HTTPException 422."""
    if items is None:
        return
    if not isinstance(items, list):
        raise HTTPException(status_code=422, detail=f"שדה {field_name} חייב להיות רשימה")
    errors = []
    for i, item in enumerate(items):
        try:
            model_cls.model_validate(item)
        except PydanticValidationError as exc:
            for err in exc.errors():
                errors.append(f"{field_name}[{i}].{'.'.join(str(l) for l in err['loc'])}: {err['msg']}")
    if errors:
        raise HTTPException(status_code=422, detail={"message": "שגיאת אימות נתונים", "errors": errors})


def _validate_recurrence(rec: dict | None) -> None:
    """Validate recurrence JSONB against RecurrencePattern."""
    if rec is None:
        return
    try:
        RecurrencePattern.model_validate(rec)
    except PydanticValidationError as exc:
        errors = [f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" for e in exc.errors()]
        raise HTTPException(status_code=422, detail={"message": "שגיאת אימות תבנית חזרה", "errors": errors})


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


@router.post("/schedule-windows", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("missions", "write"))])
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
    _validate_jsonb(data.required_slots, MissionSlot, "required_slots")
    if isinstance(data.timeline_items, list):
        _validate_jsonb(data.timeline_items, TimelineItem, "timeline_items")
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
    update_data = data.model_dump(exclude_unset=True)
    if "required_slots" in update_data:
        _validate_jsonb(update_data["required_slots"], MissionSlot, "required_slots")
    if "timeline_items" in update_data and isinstance(update_data["timeline_items"], list):
        _validate_jsonb(update_data["timeline_items"], TimelineItem, "timeline_items")
    for key, value in update_data.items():
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
    _validate_recurrence(data.recurrence)
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
    update_data = data.model_dump(exclude_unset=True)
    if "recurrence" in update_data:
        _validate_recurrence(update_data["recurrence"])
    for key, value in update_data.items():
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
    status_filter: str | None = None, page: int = 1, page_size: int = 200,
) -> list[dict]:
    """List missions with pagination. Returns list for backward compat (frontend expects array)."""
    base_query = select(Mission).where(Mission.tenant_id == tenant.id)
    if window_id:
        base_query = base_query.where(Mission.schedule_window_id == window_id)
    if date_from:
        base_query = base_query.where(Mission.date >= date_from)
    if date_to:
        base_query = base_query.where(Mission.date <= date_to)
    if status_filter:
        base_query = base_query.where(Mission.status == status_filter)

    # Paginate
    query = base_query.order_by(Mission.date, Mission.start_time).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    missions = result.scalars().all()

    # Batch-load mission types to avoid N+1
    mt_ids = list({m.mission_type_id for m in missions})
    mt_map = {}
    if mt_ids:
        mt_result = await db.execute(select(MissionType).where(MissionType.id.in_(mt_ids)))
        for mt in mt_result.scalars().all():
            mt_map[str(mt.id)] = mt

    # Batch-load assignments
    mission_ids = [m.id for m in missions]
    assignment_map: dict[str, list] = {str(mid): [] for mid in mission_ids}
    if mission_ids:
        assign_result = await db.execute(
            select(MissionAssignment, Employee)
            .join(Employee, MissionAssignment.employee_id == Employee.id)
            .where(MissionAssignment.mission_id.in_(mission_ids))
        )
        for ma, emp in assign_result.all():
            assignment_map[str(ma.mission_id)].append({
                "id": str(ma.id),
                "employee_id": str(ma.employee_id),
                "employee_name": emp.full_name,
                "work_role_id": str(ma.work_role_id),
                "slot_id": ma.slot_id,
                "status": ma.status,
                "conflicts_detected": ma.conflicts_detected,
            })

    items = []
    for m in missions:
        mt = mt_map.get(str(m.mission_type_id))
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
            "assignments": assignment_map.get(str(m.id), []),
            "created_at": str(m.created_at),
            "updated_at": str(m.updated_at),
        })
    return items




@router.get("/missions/{mission_id}")
async def get_mission(
    mission_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get a single mission by ID."""
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    mission = result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")
    return mission

@router.post("/missions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("missions", "write"))])
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


@router.post("/missions/{mission_id}/approve", dependencies=[Depends(require_permission("missions", "approve"))])
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


@router.post("/missions/{mission_id}/assignments", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("missions", "write"))])
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


@router.post("/missions/auto-assign", status_code=status.HTTP_200_OK, dependencies=[Depends(require_permission("missions", "write"))])
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


# ═══════════════════════════════════════════
# Schedule Window Export/Import Templates
# ═══════════════════════════════════════════

@router.post("/schedule-windows/{window_id}/export-template", dependencies=[Depends(require_permission("missions", "read"))])
async def export_window_template(
    window_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Export window configuration as JSON template (no PII)."""
    result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.id == window_id, ScheduleWindow.tenant_id == tenant.id)
    )
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="לוח עבודה לא נמצא")

    # Get mission templates for this window
    tmpl_result = await db.execute(
        select(MissionTemplate).where(
            MissionTemplate.schedule_window_id == window_id,
            MissionTemplate.tenant_id == tenant.id,
        )
    )
    templates = [
        {
            "name": t.name,
            "mission_type_id": str(t.mission_type_id),
            "recurrence": t.recurrence,
            "time_slots": t.time_slots,
            "is_active": t.is_active,
        }
        for t in tmpl_result.scalars().all()
    ]

    # Get mission types used
    mt_ids = list({t["mission_type_id"] for t in templates})
    roles = []
    statuses = []
    if mt_ids:
        mt_result = await db.execute(
            select(MissionType).where(MissionType.id.in_([UUID(mid) for mid in mt_ids]))
        )
        for mt in mt_result.scalars().all():
            roles.append({
                "id": str(mt.id),
                "name": mt.name,
                "required_slots": mt.required_slots,
                "color": mt.color,
                "icon": mt.icon,
            })

    # Get rules/settings
    return {
        "export_version": "1.0",
        "name": w.name,
        "start_date": str(w.start_date),
        "end_date": str(w.end_date),
        "settings_override": w.settings_override,
        "notes": w.notes,
        "templates": templates,
        "mission_types": roles,
        "statuses": ["draft", "active", "paused", "archived"],
    }


class ImportTemplateRequest(PydanticBaseModel):
    template: dict
    name: str | None = None


@router.post("/schedule-windows/import-template", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("missions", "write"))])
async def import_window_template(
    data: ImportTemplateRequest,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Import JSON template → create draft schedule window."""
    tmpl = data.template
    name = data.name or tmpl.get("name", "לוח מיובא")
    start_date_str = tmpl.get("start_date")
    end_date_str = tmpl.get("end_date")

    if not start_date_str or not end_date_str:
        raise HTTPException(status_code=400, detail="תבנית חייבת לכלול תאריכי התחלה וסיום")

    window = ScheduleWindow(
        tenant_id=tenant.id,
        name=name,
        start_date=date.fromisoformat(start_date_str),
        end_date=date.fromisoformat(end_date_str),
        settings_override=tmpl.get("settings_override"),
        notes=tmpl.get("notes"),
        status="draft",
    )
    db.add(window)
    await db.flush()
    await db.refresh(window)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="import_template",
        entity_type="schedule_window", entity_id=window.id,
        after_state={"name": window.name, "source": "template_import"},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {
        "id": str(window.id),
        "name": window.name,
        "status": window.status,
        "start_date": str(window.start_date),
        "end_date": str(window.end_date),
    }


# ═══════════════════════════════════════════
# Mission Activation & Override
# ═══════════════════════════════════════════

@router.post("/missions/{mission_id}/mark-activated", dependencies=[Depends(require_permission("missions", "write"))])
async def mark_mission_activated(
    mission_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Mark a standby mission as activated (set is_activated=True)."""
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="משימה לא נמצאה")
    if m.is_activated:
        raise HTTPException(status_code=400, detail="משימה כבר מסומנת כמופעלת")

    m.is_activated = True
    m.version += 1

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="mark_activated",
        entity_type="mission", entity_id=m.id,
        after_state={"is_activated": True, "name": m.name},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {"id": str(m.id), "name": m.name, "is_activated": True, "version": m.version}


class OverrideRequest(PydanticBaseModel):
    justification: str


@router.post("/missions/{mission_id}/assignments/{assignment_id}/override", dependencies=[Depends(require_permission("missions", "write"))])
async def override_assignment_conflict(
    mission_id: UUID, assignment_id: UUID,
    data: OverrideRequest,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Override a conflict on an assignment with justification text."""
    result = await db.execute(
        select(MissionAssignment).where(
            MissionAssignment.id == assignment_id,
            MissionAssignment.mission_id == mission_id,
        )
    )
    ma = result.scalar_one_or_none()
    if not ma:
        raise HTTPException(status_code=404, detail="שיבוץ לא נמצא")

    if not data.justification.strip():
        raise HTTPException(status_code=400, detail="נדרשת הצדקה לדריסת קונפליקט")

    ma.override_approved_by = user.id
    ma.conflicts_detected = {
        **(ma.conflicts_detected or {}),
        "override_justification": data.justification,
        "override_by": str(user.id),
    }

    # Also update mission override_justification
    m_result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.tenant_id == tenant.id)
    )
    mission = m_result.scalar_one_or_none()
    if mission:
        mission.override_justification = data.justification

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="override_conflict",
        entity_type="mission_assignment", entity_id=assignment_id,
        after_state={"justification": data.justification, "mission_id": str(mission_id)},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {
        "id": str(ma.id),
        "mission_id": str(mission_id),
        "override_approved_by": str(user.id),
        "justification": data.justification,
    }


# ═══════════════════════════════════════════
# Daily Board Templates
# ═══════════════════════════════════════════

@router.get("/daily-board-templates")
async def list_daily_board_templates(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.tenant_id == tenant.id,
            DailyBoardTemplate.is_active.is_(True),
        ).order_by(DailyBoardTemplate.created_at)
    )
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "description": t.description,
            "layout": t.layout,
            "columns": t.columns,
            "filters": t.filters,
            "is_default": t.is_default,
            "created_at": str(t.created_at),
            "updated_at": str(t.updated_at),
        }
        for t in result.scalars().all()
    ]


class DailyBoardTemplateCreate(PydanticBaseModel):
    name: str
    description: str | None = None
    layout: dict | None = None
    columns: dict | None = None
    filters: dict | None = None


class DailyBoardTemplateUpdate(PydanticBaseModel):
    name: str | None = None
    description: str | None = None
    layout: dict | None = None
    columns: dict | None = None
    filters: dict | None = None


@router.post("/daily-board-templates", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("settings", "write"))])
async def create_daily_board_template(
    data: DailyBoardTemplateCreate,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    tmpl = DailyBoardTemplate(
        tenant_id=tenant.id,
        name=data.name,
        description=data.description,
        layout=data.layout,
        columns=data.columns,
        filters=data.filters,
    )
    db.add(tmpl)
    await db.flush()
    await db.refresh(tmpl)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="daily_board_template", entity_id=tmpl.id,
        after_state={"name": tmpl.name},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {
        "id": str(tmpl.id),
        "name": tmpl.name,
        "description": tmpl.description,
        "is_default": tmpl.is_default,
        "created_at": str(tmpl.created_at),
    }


@router.get("/daily-board-templates/{template_id}")
async def get_daily_board_template(
    template_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.id == template_id,
            DailyBoardTemplate.tenant_id == tenant.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="תבנית לוח יומי לא נמצאה")
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "layout": t.layout,
        "columns": t.columns,
        "filters": t.filters,
        "is_default": t.is_default,
        "created_at": str(t.created_at),
        "updated_at": str(t.updated_at),
    }


@router.patch("/daily-board-templates/{template_id}", dependencies=[Depends(require_permission("settings", "write"))])
async def update_daily_board_template(
    template_id: UUID, data: DailyBoardTemplateUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.id == template_id,
            DailyBoardTemplate.tenant_id == tenant.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="תבנית לוח יומי לא נמצאה")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(t, key, value)
    await db.flush()
    await db.refresh(t)
    await db.commit()
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "layout": t.layout,
        "columns": t.columns,
        "filters": t.filters,
        "is_default": t.is_default,
        "updated_at": str(t.updated_at),
    }


@router.delete("/daily-board-templates/{template_id}", status_code=204, dependencies=[Depends(require_permission("settings", "write"))])
async def delete_daily_board_template(
    template_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.id == template_id,
            DailyBoardTemplate.tenant_id == tenant.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="תבנית לוח יומי לא נמצאה")
    t.is_active = False
    await db.commit()


@router.post("/daily-board-templates/{template_id}/set-default", dependencies=[Depends(require_permission("settings", "write"))])
async def set_default_daily_board_template(
    template_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set a daily board template as the default (unset others)."""
    # Unset all defaults for this tenant
    all_result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.tenant_id == tenant.id,
            DailyBoardTemplate.is_default.is_(True),
        )
    )
    for t in all_result.scalars().all():
        t.is_default = False

    # Set the new default
    result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.id == template_id,
            DailyBoardTemplate.tenant_id == tenant.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="תבנית לוח יומי לא נמצאה")
    t.is_default = True
    await db.commit()
    return {"id": str(t.id), "name": t.name, "is_default": True}


class BoardPreviewRequest(PydanticBaseModel):
    date: date


@router.post("/daily-board-templates/{template_id}/preview")
async def preview_daily_board_template(
    template_id: UUID, data: BoardPreviewRequest,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Render a preview of the daily board for a given date."""
    result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.id == template_id,
            DailyBoardTemplate.tenant_id == tenant.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="תבנית לוח יומי לא נמצאה")

    # Fetch missions for the date
    missions_result = await db.execute(
        select(Mission).where(
            Mission.tenant_id == tenant.id,
            Mission.date == data.date,
            Mission.status.not_in(["cancelled"]),
        ).order_by(Mission.start_time)
    )
    missions = missions_result.scalars().all()

    mission_items = []
    for m in missions:
        # Get assignments
        assign_result = await db.execute(
            select(MissionAssignment, Employee)
            .join(Employee, MissionAssignment.employee_id == Employee.id)
            .where(
                MissionAssignment.mission_id == m.id,
                MissionAssignment.status != "replaced",
            )
        )
        assignments = [
            {
                "employee_name": emp.full_name,
                "slot_id": ma.slot_id,
                "status": ma.status,
            }
            for ma, emp in assign_result.all()
        ]

        mt_result = await db.execute(select(MissionType).where(MissionType.id == m.mission_type_id))
        mt = mt_result.scalar_one_or_none()

        mission_items.append({
            "id": str(m.id),
            "name": m.name,
            "mission_type_name": mt.name if mt else None,
            "mission_type_color": mt.color if mt else None,
            "start_time": str(m.start_time),
            "end_time": str(m.end_time),
            "status": m.status,
            "is_activated": m.is_activated,
            "assignments": assignments,
        })

    return {
        "template_id": str(t.id),
        "template_name": t.name,
        "date": str(data.date),
        "layout": t.layout,
        "columns": t.columns,
        "missions": mission_items,
    }


@router.post("/daily-board-templates/{template_id}/export")
async def export_daily_board_template(
    template_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    target_date: date | None = None,
    format: str = "json",
) -> dict:
    """Export daily board template as PDF/Excel placeholder."""
    result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.id == template_id,
            DailyBoardTemplate.tenant_id == tenant.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="תבנית לוח יומי לא נמצאה")

    if format not in ("json", "pdf", "excel"):
        raise HTTPException(status_code=400, detail="פורמט לא נתמך. אפשרויות: json, pdf, excel")

    if format in ("pdf", "excel"):
        # Placeholder — actual generation would use a library
        return {
            "message": f"ייצוא בפורמט {format} בפיתוח",
            "template_id": str(t.id),
            "template_name": t.name,
            "format": format,
        }

    return {
        "template_id": str(t.id),
        "name": t.name,
        "description": t.description,
        "layout": t.layout,
        "columns": t.columns,
        "filters": t.filters,
        "is_default": t.is_default,
        "format": "json",
    }
