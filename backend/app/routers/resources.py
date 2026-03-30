"""Resources CRUD endpoints (vehicles, equipment, etc.)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.resource import Resource
from app.permissions import require_permission

router = APIRouter()


# ═══════════════════════════════════════════
# Schemas
# ═══════════════════════════════════════════

class ResourceCreate(BaseModel):
    name: dict
    category: str = "equipment"
    quantity_total: int = 1
    notes: str | None = None


class ResourceUpdate(BaseModel):
    name: dict | None = None
    category: str | None = None
    quantity_total: int | None = None
    notes: str | None = None
    is_active: bool | None = None


class ResourceResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: dict
    category: str
    quantity_total: int
    notes: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════

@router.get("", dependencies=[Depends(require_permission("settings", "read"))])
async def list_resources(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    is_active: bool | None = None,
) -> list[dict]:
    """List all resources for the tenant."""
    query = select(Resource).where(Resource.tenant_id == tenant.id)
    if is_active is not None:
        query = query.where(Resource.is_active == is_active)
    query = query.order_by(Resource.category, Resource.created_at)
    result = await db.execute(query)
    return [ResourceResponse.model_validate(r).model_dump() for r in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("settings", "write"))])
async def create_resource(
    data: ResourceCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new resource."""
    resource = Resource(tenant_id=tenant.id, **data.model_dump())
    db.add(resource)
    await db.flush()
    await db.refresh(resource)
    await db.commit()
    return ResourceResponse.model_validate(resource).model_dump()


@router.get("/{resource_id}", dependencies=[Depends(require_permission("settings", "read"))])
async def get_resource(
    resource_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a specific resource."""
    result = await db.execute(
        select(Resource).where(Resource.id == resource_id, Resource.tenant_id == tenant.id)
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="משאב לא נמצא")
    return ResourceResponse.model_validate(resource).model_dump()


@router.patch("/{resource_id}", dependencies=[Depends(require_permission("settings", "write"))])
async def update_resource(
    resource_id: UUID, data: ResourceUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a resource."""
    result = await db.execute(
        select(Resource).where(Resource.id == resource_id, Resource.tenant_id == tenant.id)
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="משאב לא נמצא")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(resource, key, value)
    await db.flush()
    await db.refresh(resource)
    await db.commit()
    return ResourceResponse.model_validate(resource).model_dump()


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("settings", "write"))])
async def delete_resource(
    resource_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete a resource (set is_active=False)."""
    result = await db.execute(
        select(Resource).where(Resource.id == resource_id, Resource.tenant_id == tenant.id)
    )
    resource = result.scalar_one_or_none()
    if not resource:
        raise HTTPException(status_code=404, detail="משאב לא נמצא")
    resource.is_active = False
    await db.commit()
