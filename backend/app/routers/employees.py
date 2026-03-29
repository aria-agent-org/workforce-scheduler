"""Employee CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate

router = APIRouter()


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    is_active: bool | None = None,
) -> list[EmployeeResponse]:
    """List employees for the current tenant."""
    query = select(Employee).where(Employee.tenant_id == tenant.id)
    if is_active is not None:
        query = query.where(Employee.is_active == is_active)
    if search:
        query = query.where(Employee.full_name.ilike(f"%{search}%"))
    query = query.order_by(Employee.full_name).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    employees = result.scalars().all()
    return [EmployeeResponse.model_validate(e) for e in employees]


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    data: EmployeeCreate,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EmployeeResponse:
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
            detail=f"Employee number '{data.employee_number}' already exists",
        )
    employee = Employee(tenant_id=tenant.id, **data.model_dump())
    db.add(employee)
    await db.flush()
    await db.refresh(employee)
    return EmployeeResponse.model_validate(employee)


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EmployeeResponse:
    """Get a specific employee."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return EmployeeResponse.model_validate(employee)


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> EmployeeResponse:
    """Update an employee."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(employee, key, value)
    await db.flush()
    await db.refresh(employee)
    return EmployeeResponse.model_validate(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete an employee (set is_active=False)."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    employee.is_active = False
    await db.flush()
