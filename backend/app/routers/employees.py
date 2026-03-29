"""Employee CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee, EmployeeWorkRole
from app.models.resource import WorkRole
from app.models.audit import AuditLog
from app.schemas.employee import (
    EmployeeCreate, EmployeeResponse, EmployeeUpdate, EmployeeBulkImportRequest,
)

router = APIRouter()


@router.get("")
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
        items.append(emp_data)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
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
        ip_address=request.client.host if request.client else None,
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

    return emp_data


@router.patch("/{employee_id}")
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update an employee."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="עובד לא נמצא")

    before = {"full_name": employee.full_name, "status": employee.status}
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(employee, key, value)
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
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return EmployeeResponse.model_validate(employee).model_dump()


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
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
        ip_address=request.client.host if request.client else None,
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
            ip_address=request.client.host if request.client else None,
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
