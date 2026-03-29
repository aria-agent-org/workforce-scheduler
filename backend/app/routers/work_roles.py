"""Standalone Work Roles CRUD endpoints (also available under /settings/work-roles)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.resource import WorkRole
from app.schemas.settings import WorkRoleCreate, WorkRoleUpdate, WorkRoleResponse

router = APIRouter()


@router.get("")
async def list_work_roles(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all work roles for the tenant."""
    result = await db.execute(
        select(WorkRole).where(WorkRole.tenant_id == tenant.id).order_by(WorkRole.sort_order)
    )
    return [WorkRoleResponse.model_validate(wr).model_dump() for wr in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_work_role(
    data: WorkRoleCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new work role."""
    wr = WorkRole(tenant_id=tenant.id, **data.model_dump())
    db.add(wr)
    await db.flush()
    await db.refresh(wr)
    await db.commit()
    return WorkRoleResponse.model_validate(wr).model_dump()


@router.get("/{role_id}")
async def get_work_role(
    role_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a specific work role."""
    result = await db.execute(
        select(WorkRole).where(WorkRole.id == role_id, WorkRole.tenant_id == tenant.id)
    )
    wr = result.scalar_one_or_none()
    if not wr:
        raise HTTPException(status_code=404, detail="תפקיד לא נמצא")
    return WorkRoleResponse.model_validate(wr).model_dump()


@router.patch("/{role_id}")
async def update_work_role(
    role_id: UUID, data: WorkRoleUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a work role."""
    result = await db.execute(
        select(WorkRole).where(WorkRole.id == role_id, WorkRole.tenant_id == tenant.id)
    )
    wr = result.scalar_one_or_none()
    if not wr:
        raise HTTPException(status_code=404, detail="תפקיד לא נמצא")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(wr, key, value)
    await db.flush()
    await db.refresh(wr)
    await db.commit()
    return WorkRoleResponse.model_validate(wr).model_dump()


@router.delete("/{role_id}", status_code=204)
async def delete_work_role(
    role_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a work role."""
    result = await db.execute(
        select(WorkRole).where(WorkRole.id == role_id, WorkRole.tenant_id == tenant.id)
    )
    wr = result.scalar_one_or_none()
    if wr:
        await db.delete(wr)
        await db.commit()
