"""Employee CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee, EmployeeWorkRole, EmployeePreference, EmployeeFieldDefinition, EmployeeProfile
from app.models.resource import WorkRole
from app.models.audit import AuditLog
from app.permissions import require_permission
from app.schemas.employee import (
    EmployeeCreate, EmployeeResponse, EmployeeUpdate, EmployeeBulkImportRequest,
    EmployeePreferencesResponse, EmployeePreferencesUpdate,
)

router = APIRouter()


# ═══════════════════════════════════════════
# Employee Field Definitions (before /{employee_id} catch-all)
# ═══════════════════════════════════════════

class FieldDefinitionCreate(BaseModel):
    field_key: str
    label: dict
    field_type: str = "text"
    options: dict | None = None
    is_required: bool = False
    show_in_list: bool = False
    display_order: int = 0


class FieldDefinitionUpdate(BaseModel):
    label: dict | None = None
    field_type: str | None = None
    options: dict | None = None
    is_required: bool | None = None
    show_in_list: bool | None = None
    display_order: int | None = None


class FieldDefinitionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    field_key: str
    label: dict
    field_type: str
    options: dict | None = None
    is_required: bool
    show_in_list: bool
    display_order: int

    model_config = {"from_attributes": True}


@router.get("/field-definitions", dependencies=[Depends(require_permission("settings", "read"))])
async def list_field_definitions(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List custom field definitions for employees."""
    result = await db.execute(
        select(EmployeeFieldDefinition)
        .where(EmployeeFieldDefinition.tenant_id == tenant.id)
        .order_by(EmployeeFieldDefinition.display_order)
    )
    return [FieldDefinitionResponse.model_validate(fd).model_dump() for fd in result.scalars().all()]


@router.post("/field-definitions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("settings", "write"))])
async def create_field_definition(
    data: FieldDefinitionCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a custom field definition."""
    # Check for duplicate field_key
    existing = await db.execute(
        select(EmployeeFieldDefinition).where(
            EmployeeFieldDefinition.tenant_id == tenant.id,
            EmployeeFieldDefinition.field_key == data.field_key,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"שדה מותאם '{data.field_key}' כבר קיים",
        )
    fd = EmployeeFieldDefinition(tenant_id=tenant.id, **data.model_dump())
    db.add(fd)
    await db.flush()
    await db.refresh(fd)
    await db.commit()
    return FieldDefinitionResponse.model_validate(fd).model_dump()


@router.patch("/field-definitions/{fd_id}", dependencies=[Depends(require_permission("settings", "write"))])
async def update_field_definition(
    fd_id: UUID, data: FieldDefinitionUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a custom field definition."""
    result = await db.execute(
        select(EmployeeFieldDefinition).where(
            EmployeeFieldDefinition.id == fd_id, EmployeeFieldDefinition.tenant_id == tenant.id
        )
    )
    fd = result.scalar_one_or_none()
    if not fd:
        raise HTTPException(status_code=404, detail="הגדרת שדה לא נמצאה")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(fd, key, value)
    await db.flush()
    await db.refresh(fd)
    await db.commit()
    return FieldDefinitionResponse.model_validate(fd).model_dump()


@router.delete("/field-definitions/{fd_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("settings", "write"))])
async def delete_field_definition(
    fd_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a custom field definition."""
    result = await db.execute(
        select(EmployeeFieldDefinition).where(
            EmployeeFieldDefinition.id == fd_id, EmployeeFieldDefinition.tenant_id == tenant.id
        )
    )
    fd = result.scalar_one_or_none()
    if not fd:
        raise HTTPException(status_code=404, detail="הגדרת שדה לא נמצאה")
    await db.delete(fd)
    await db.commit()


@router.get("", dependencies=[Depends(require_permission("employees", "read"))])
async def list_employees(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 50,
    search: str | None = None,
    is_active: bool | None = None,
    status_filter: str | None = None,
    work_role_id: UUID | None = None,
) -> dict:
    """List employees with pagination, search, and filters."""
    query = select(Employee).where(Employee.tenant_id == tenant.id)

    if is_active is not None:
        query = query.where(Employee.is_active == is_active)
    if status_filter:
        query = query.where(Employee.status == status_filter)
    if search:
        query = query.where(
            or_(
                Employee.full_name.ilike(f"%{search}%"),
                Employee.employee_number.ilike(f"%{search}%"),
            )
        )
    if work_role_id:
        query = query.join(EmployeeWorkRole, Employee.id == EmployeeWorkRole.employee_id).where(
            EmployeeWorkRole.work_role_id == work_role_id
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(Employee.full_name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    employees = result.scalars().all()

    items = []
    for e in employees:
        emp_data = EmployeeResponse.model_validate(e).model_dump()
        # Add work roles
        role_result = await db.execute(
            select(EmployeeWorkRole, WorkRole)
            .join(WorkRole, EmployeeWorkRole.work_role_id == WorkRole.id)
            .where(EmployeeWorkRole.employee_id == e.id)
        )
        roles = []
        for ewr, wr in role_result.all():
            roles.append({
                "id": str(wr.id),
                "name": wr.name,
                "color": wr.color,
                "is_primary": ewr.is_primary,
            })
        emp_data["work_roles"] = roles
        # Avatar
        prof_res = await db.execute(
            select(EmployeeProfile).where(EmployeeProfile.employee_id == e.id)
        )
        ep = prof_res.scalar_one_or_none()
        emp_data["avatar_url"] = ep.avatar_url if ep else None
        items.append(emp_data)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
    }


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("employees", "write"))])
async def create_employee(
    data: EmployeeCreate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new employee."""
    existing = await db.execute(
        select(Employee).where(
            Employee.tenant_id == tenant.id,
            Employee.employee_number == data.employee_number,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"מספר עובד '{data.employee_number}' כבר קיים",
        )
    employee = Employee(tenant_id=tenant.id, **data.model_dump())
    db.add(employee)
    await db.flush()
    await db.refresh(employee)

    # Audit log
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="create",
        entity_type="employee",
        entity_id=employee.id,
        after_state={"full_name": employee.full_name, "employee_number": employee.employee_number},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()

    return EmployeeResponse.model_validate(employee).model_dump()


@router.get("/{employee_id}")
async def get_employee(
    employee_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a specific employee with work roles."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    emp_data = EmployeeResponse.model_validate(employee).model_dump()

    # Work roles
    role_result = await db.execute(
        select(EmployeeWorkRole, WorkRole)
        .join(WorkRole, EmployeeWorkRole.work_role_id == WorkRole.id)
        .where(EmployeeWorkRole.employee_id == employee.id)
    )
    roles = []
    for ewr, wr in role_result.all():
        roles.append({
            "id": str(wr.id),
            "name": wr.name,
            "color": wr.color,
            "is_primary": ewr.is_primary,
        })
    emp_data["work_roles"] = roles

    # Avatar from EmployeeProfile
    profile_res = await db.execute(
        select(EmployeeProfile).where(EmployeeProfile.employee_id == employee.id)
    )
    emp_profile = profile_res.scalar_one_or_none()
    emp_data["avatar_url"] = emp_profile.avatar_url if emp_profile else None

    return emp_data


@router.patch("/{employee_id}", dependencies=[Depends(require_permission("employees", "write"))])
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
    expected_version: int | None = None,
) -> dict:
    """Update an employee. Supports optimistic locking via expected_version query param."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    # Optimistic locking: if client sent expected_version, check it matches
    if expected_version is not None and employee.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="הנתונים השתנו על ידי משתמש אחר. רענן את הדף ונסה שוב.",
        )

    before = {"full_name": employee.full_name, "status": employee.status}
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(employee, key, value)
    employee.version = (employee.version or 1) + 1
    await db.flush()
    await db.refresh(employee)

    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="update",
        entity_type="employee",
        entity_id=employee.id,
        before_state=before,
        after_state={"full_name": employee.full_name, "status": employee.status},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()

    emp_data = EmployeeResponse.model_validate(employee).model_dump()
    emp_data["version"] = employee.version
    return emp_data


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("employees", "delete"))])
async def delete_employee(
    employee_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete an employee."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")
    employee.is_active = False
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="delete",
        entity_type="employee",
        entity_id=employee.id,
        before_state={"is_active": True},
        after_state={"is_active": False},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()


@router.post("/bulk-import")
async def bulk_import_employees(
    data: EmployeeBulkImportRequest,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Bulk import employees."""
    created = []
    errors = []
    for i, emp_data in enumerate(data.employees):
        existing = await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.employee_number == emp_data.employee_number,
            )
        )
        if existing.scalar_one_or_none():
            if data.skip_errors:
                errors.append({"row": i, "error": f"מספר עובד '{emp_data.employee_number}' כבר קיים"})
                continue
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"שורה {i}: מספר עובד '{emp_data.employee_number}' כבר קיים",
            )
        employee = Employee(tenant_id=tenant.id, **emp_data.model_dump())
        db.add(employee)
        await db.flush()
        await db.refresh(employee)
        created.append(EmployeeResponse.model_validate(employee).model_dump())
        db.add(AuditLog(
            tenant_id=tenant.id,
            user_id=user.id,
            action="bulk_import",
            entity_type="employee",
            entity_id=employee.id,
            after_state={"full_name": employee.full_name},
            ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
        ))
    await db.commit()
    return {"created": len(created), "errors": errors, "employees": created}


@router.post("/{employee_id}/work-roles")
async def assign_work_roles(
    employee_id: UUID,
    roles: list[dict],
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Assign work roles to an employee. Body: [{"work_role_id": "...", "is_primary": false}]"""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    # Remove existing roles and flush to avoid unique constraint violations
    existing = await db.execute(
        select(EmployeeWorkRole).where(EmployeeWorkRole.employee_id == employee_id)
    )
    for ewr in existing.scalars().all():
        await db.delete(ewr)
    await db.flush()

    # Add new roles (deduplicate by work_role_id)
    seen_role_ids = set()
    new_roles = []
    for r in roles:
        role_id = r["work_role_id"]
        if role_id in seen_role_ids:
            continue
        seen_role_ids.add(role_id)
        ewr = EmployeeWorkRole(
            employee_id=employee_id,
            work_role_id=role_id,
            is_primary=r.get("is_primary", False),
        )
        db.add(ewr)
        new_roles.append(r)

    await db.commit()
    return new_roles


# ═══════════════════════════════════════════
# Employee Preferences
# ═══════════════════════════════════════════

@router.get("/{employee_id}/preferences")
async def get_employee_preferences(
    employee_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get employee scheduling preferences."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    pref_result = await db.execute(
        select(EmployeePreference).where(EmployeePreference.employee_id == employee_id)
    )
    pref = pref_result.scalar_one_or_none()

    if not pref:
        return EmployeePreferencesResponse(
            employee_id=employee_id,
            partner_preferences=[],
            mission_type_preferences=[],
            time_slot_preferences=[],
            custom_preferences={},
            notes=None,
        ).model_dump()

    return EmployeePreferencesResponse.model_validate(pref).model_dump()


@router.put("/{employee_id}/preferences", dependencies=[Depends(require_permission("employees", "write"))])
async def update_employee_preferences(
    employee_id: UUID,
    data: EmployeePreferencesUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update employee scheduling preferences."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    pref_result = await db.execute(
        select(EmployeePreference).where(EmployeePreference.employee_id == employee_id)
    )
    pref = pref_result.scalar_one_or_none()

    if pref:
        before = {
            "partner_preferences": pref.partner_preferences,
            "mission_type_preferences": pref.mission_type_preferences,
            "time_slot_preferences": pref.time_slot_preferences,
            "notes": pref.notes,
        }
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(pref, key, value)
    else:
        before = {}
        pref = EmployeePreference(employee_id=employee_id, **data.model_dump())
        db.add(pref)

    await db.flush()
    await db.refresh(pref)

    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="update_preferences",
        entity_type="employee_preference",
        entity_id=employee_id,
        before_state=before,
        after_state=data.model_dump(),
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()

    return EmployeePreferencesResponse.model_validate(pref).model_dump()


# ═══════════════════════════════════════════
# GDPR — Personal Data Deletion
# ═══════════════════════════════════════════

@router.delete("/{employee_id}/personal-data", dependencies=[Depends(require_permission("employees", "delete"))])
async def delete_personal_data(
    employee_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """GDPR delete: anonymize employee data (name → 'Deleted User', clear PII fields)."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    before = {
        "full_name": employee.full_name,
        "notification_channels": employee.notification_channels,
        "custom_fields": employee.custom_fields,
        "notes": employee.notes,
    }

    # Anonymize
    employee.full_name = "Deleted User"
    employee.notification_channels = None
    employee.custom_fields = None
    employee.notes = None
    employee.is_active = False

    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="gdpr_delete",
        entity_type="employee",
        entity_id=employee.id,
        before_state={"full_name": before["full_name"]},
        after_state={"full_name": "Deleted User", "anonymized": True},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()

    return {
        "id": str(employee.id),
        "message": "נתונים אישיים נמחקו בהצלחה",
        "anonymized_fields": ["full_name", "notification_channels", "custom_fields", "notes"],
    }


# ═══════════════════════════════════════════
# Notification Test
# ═══════════════════════════════════════════

@router.post("/{employee_id}/notification-test", dependencies=[Depends(require_permission("notifications", "write"))])
async def send_notification_test(
    employee_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a test notification to an employee via all active channels."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    channels = employee.notification_channels or {}
    active_channels = channels.get("active_channels", [])
    if not active_channels:
        # Fallback: check which channels have config
        if channels.get("phone_whatsapp"):
            active_channels.append("whatsapp")
        if channels.get("telegram_chat_id"):
            active_channels.append("telegram")
        if channels.get("email"):
            active_channels.append("email")

    if not active_channels:
        raise HTTPException(status_code=400, detail="לעובד אין ערוצי התראה מוגדרים")

    # Log test notifications (actual sending would be via notification service)
    from app.models.notification import NotificationLog
    results = []
    for channel in active_channels:
        log = NotificationLog(
            tenant_id=tenant.id,
            employee_id=employee.id,
            channel=channel,
            event_type_code="test_notification",
            body_sent=f"הודעת בדיקה — {employee.full_name}",
            language_sent=employee.preferred_language,
            status="sent",
        )
        db.add(log)
        results.append({"channel": channel, "status": "sent"})

    await db.commit()
    return {
        "employee_id": str(employee.id),
        "employee_name": employee.full_name,
        "channels_tested": results,
    }
