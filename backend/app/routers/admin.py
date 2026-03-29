"""Admin endpoints (super_admin only)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser
from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate, TenantResponse, TenantUpdate

router = APIRouter()


def require_super_admin(user: CurrentUser) -> None:
    """Verify user is super_admin."""
    if user.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin access required",
        )


@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[TenantResponse]:
    """List all tenants."""
    require_super_admin(user)
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    tenants = result.scalars().all()
    return [TenantResponse.model_validate(t) for t in tenants]


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    data: TenantCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TenantResponse:
    """Create a new tenant."""
    require_super_admin(user)
    existing = await db.execute(select(Tenant).where(Tenant.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant slug '{data.slug}' already exists",
        )
    tenant = Tenant(**data.model_dump())
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return TenantResponse.model_validate(tenant)


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TenantResponse:
    """Get a specific tenant."""
    require_super_admin(user)
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return TenantResponse.model_validate(tenant)


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: UUID,
    data: TenantUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> TenantResponse:
    """Update a tenant."""
    require_super_admin(user)
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, key, value)
    await db.flush()
    await db.refresh(tenant)
    return TenantResponse.model_validate(tenant)
