"""Admin endpoints (super_admin / tenant_admin)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import CurrentUser
from app.models.tenant import Plan, Tenant
from app.models.user import User
from app.models.resource import RoleDefinition
from app.schemas.tenant import TenantCreate, TenantResponse, TenantUpdate
from app.schemas.settings import RoleDefinitionCreate, RoleDefinitionUpdate, RoleDefinitionResponse

router = APIRouter()


ADMIN_ROLES = {"super_admin", "tenant_admin"}


async def require_admin(user: CurrentUser, db: AsyncSession = Depends(get_db)) -> None:
    """Verify user has admin-level permissions (by role name or permissions dict)."""
    if user.role_definition_id is None:
        # Legacy: allow users with no tenant_id (global admin)
        if user.tenant_id is None:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    result = await db.execute(
        select(RoleDefinition).where(RoleDefinition.id == user.role_definition_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    # Check by role name OR by having settings write permission
    is_admin_role = role.name in ADMIN_ROLES
    has_admin_perms = isinstance(role.permissions, dict) and "write" in (role.permissions.get("settings") or [])
    if not is_admin_role and not has_admin_perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


# ═══════════════════════════════════════════
# Tenants CRUD
# ═══════════════════════════════════════════

@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[TenantResponse]:
    """List all tenants."""
    await require_admin(user, db)
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
    await require_admin(user, db)
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
    await require_admin(user, db)
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
    await require_admin(user, db)
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, key, value)
    await db.flush()
    await db.refresh(tenant)
    return TenantResponse.model_validate(tenant)


# ═══════════════════════════════════════════
# Plans CRUD
# ═══════════════════════════════════════════

class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    features: dict = Field(default_factory=dict)


class PlanUpdate(BaseModel):
    name: str | None = None
    features: dict | None = None


class PlanResponse(BaseModel):
    id: UUID
    name: str
    features: dict
    created_at: str | None = None
    updated_at: str | None = None

    model_config = {"from_attributes": True}


@router.get("/plans")
async def list_plans(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all subscription plans."""
    await require_admin(user, db)
    result = await db.execute(select(Plan).order_by(Plan.name))
    plans = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "features": p.features,
            "created_at": str(p.created_at),
            "updated_at": str(p.updated_at),
        }
        for p in plans
    ]


@router.post("/plans", status_code=status.HTTP_201_CREATED)
async def create_plan(
    data: PlanCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a subscription plan."""
    await require_admin(user, db)
    existing = await db.execute(select(Plan).where(Plan.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Plan '{data.name}' already exists")
    plan = Plan(name=data.name, features=data.features)
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return {
        "id": str(plan.id),
        "name": plan.name,
        "features": plan.features,
        "created_at": str(plan.created_at),
        "updated_at": str(plan.updated_at),
    }


@router.patch("/plans/{plan_id}")
async def update_plan(
    plan_id: UUID,
    data: PlanUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a subscription plan."""
    await require_admin(user, db)
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, key, value)
    await db.flush()
    await db.refresh(plan)
    return {
        "id": str(plan.id),
        "name": plan.name,
        "features": plan.features,
        "created_at": str(plan.created_at),
        "updated_at": str(plan.updated_at),
    }


# ═══════════════════════════════════════════
# Users CRUD (cross-tenant)
# ═══════════════════════════════════════════

class AdminUserCreate(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=6, max_length=100)
    tenant_id: UUID | None = None
    role_definition_id: UUID | None = None
    preferred_language: str = "he"


class AdminUserUpdate(BaseModel):
    email: str | None = None
    tenant_id: UUID | None = None
    role_definition_id: UUID | None = None
    preferred_language: str | None = None
    is_active: bool | None = None


@router.get("/users")
async def list_users(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """List all users across tenants."""
    await require_admin(user, db)
    offset = (page - 1) * page_size
    total_q = await db.execute(select(func.count(User.id)))
    total = total_q.scalar() or 0
    result = await db.execute(
        select(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    users = result.scalars().all()
    items = []
    for u in users:
        # Get role name
        role_name = None
        if u.role_definition_id:
            rd_res = await db.execute(
                select(RoleDefinition).where(RoleDefinition.id == u.role_definition_id)
            )
            rd = rd_res.scalar_one_or_none()
            role_name = rd.name if rd else None
        # Get tenant name
        tenant_name = None
        if u.tenant_id:
            t_res = await db.execute(select(Tenant).where(Tenant.id == u.tenant_id))
            t = t_res.scalar_one_or_none()
            tenant_name = t.name if t else None
        items.append({
            "id": str(u.id),
            "email": u.email,
            "tenant_id": str(u.tenant_id) if u.tenant_id else None,
            "tenant_name": tenant_name,
            "role_definition_id": str(u.role_definition_id) if u.role_definition_id else None,
            "role_name": role_name,
            "preferred_language": u.preferred_language,
            "is_active": u.is_active,
            "last_login": str(u.last_login) if u.last_login else None,
            "created_at": str(u.created_at),
        })
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    data: AdminUserCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a user."""
    await require_admin(user, db)
    from app.services.auth_service import AuthService
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Email '{data.email}' already exists")
    new_user = User(
        email=data.email,
        password_hash=AuthService.hash_password(data.password),
        tenant_id=data.tenant_id,
        role_definition_id=data.role_definition_id,
        preferred_language=data.preferred_language,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)
    return {
        "id": str(new_user.id),
        "email": new_user.email,
        "tenant_id": str(new_user.tenant_id) if new_user.tenant_id else None,
        "role_definition_id": str(new_user.role_definition_id) if new_user.role_definition_id else None,
        "is_active": new_user.is_active,
        "created_at": str(new_user.created_at),
    }


@router.patch("/users/{user_id}")
async def update_user(
    user_id: UUID,
    data: AdminUserUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a user."""
    await require_admin(user, db)
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(target, key, value)
    await db.flush()
    await db.refresh(target)
    return {
        "id": str(target.id),
        "email": target.email,
        "tenant_id": str(target.tenant_id) if target.tenant_id else None,
        "role_definition_id": str(target.role_definition_id) if target.role_definition_id else None,
        "is_active": target.is_active,
    }


@router.post("/users/{user_id}/move-tenant")
async def move_user_tenant(
    user_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    new_tenant_id: UUID | None = None,
) -> dict:
    """Move a user to a different tenant."""
    await require_admin(user, db)
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if new_tenant_id:
        t_res = await db.execute(select(Tenant).where(Tenant.id == new_tenant_id))
        if not t_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Target tenant not found")
    target.tenant_id = new_tenant_id
    target.role_definition_id = None  # Reset role when moving
    await db.flush()
    return {
        "id": str(target.id),
        "email": target.email,
        "tenant_id": str(target.tenant_id) if target.tenant_id else None,
        "message": "User moved successfully",
    }


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Deactivate a user (soft delete)."""
    await require_admin(user, db)
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_active = False
    await db.flush()
    return {"id": str(target.id), "is_active": False, "message": "User deactivated"}


# ═══════════════════════════════════════════
# System-Level Role Definitions
# ═══════════════════════════════════════════

@router.get("/role-definitions")
async def list_system_role_definitions(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all role definitions across all tenants (system admin view)."""
    await require_admin(user, db)
    result = await db.execute(
        select(RoleDefinition).order_by(RoleDefinition.is_system.desc(), RoleDefinition.name)
    )
    items = []
    for rd in result.scalars().all():
        # Get tenant name
        tenant_name = None
        if rd.tenant_id:
            t_res = await db.execute(select(Tenant).where(Tenant.id == rd.tenant_id))
            t = t_res.scalar_one_or_none()
            tenant_name = t.name if t else None
        # Count assigned users
        user_count_q = await db.execute(
            select(func.count(User.id)).where(User.role_definition_id == rd.id)
        )
        user_count = user_count_q.scalar() or 0
        items.append({
            "id": str(rd.id),
            "tenant_id": str(rd.tenant_id) if rd.tenant_id else None,
            "tenant_name": tenant_name,
            "name": rd.name,
            "label": rd.label,
            "permissions": rd.permissions,
            "ui_visibility": rd.ui_visibility,
            "is_system": rd.is_system,
            "user_count": user_count,
            "created_at": str(rd.created_at),
            "updated_at": str(rd.updated_at),
        })
    return items


@router.post("/role-definitions", status_code=status.HTTP_201_CREATED)
async def create_system_role_definition(
    data: RoleDefinitionCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    tenant_id: UUID | None = None,
) -> dict:
    """Create a role definition (optionally scoped to a tenant)."""
    await require_admin(user, db)
    # Validate tenant if provided
    if tenant_id:
        t_res = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
        if not t_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Tenant not found")
    rd = RoleDefinition(
        tenant_id=tenant_id or user.tenant_id,
        **data.model_dump(),
    )
    db.add(rd)
    await db.flush()
    await db.refresh(rd)
    await db.commit()
    return RoleDefinitionResponse.model_validate(rd).model_dump()


@router.patch("/role-definitions/{rd_id}")
async def update_system_role_definition(
    rd_id: UUID,
    data: RoleDefinitionUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a role definition (system admin)."""
    await require_admin(user, db)
    result = await db.execute(select(RoleDefinition).where(RoleDefinition.id == rd_id))
    rd = result.scalar_one_or_none()
    if not rd:
        raise HTTPException(status_code=404, detail="Role definition not found")
    if rd.is_system:
        raise HTTPException(status_code=403, detail="לא ניתן לערוך הגדרת מערכת")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rd, key, value)
    await db.flush()
    await db.refresh(rd)
    await db.commit()
    return RoleDefinitionResponse.model_validate(rd).model_dump()


@router.delete("/role-definitions/{rd_id}")
async def delete_system_role_definition(
    rd_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a role definition (system admin)."""
    await require_admin(user, db)
    result = await db.execute(select(RoleDefinition).where(RoleDefinition.id == rd_id))
    rd = result.scalar_one_or_none()
    if not rd:
        raise HTTPException(status_code=404, detail="Role definition not found")
    if rd.is_system:
        raise HTTPException(status_code=403, detail="לא ניתן למחוק הגדרת מערכת")
    # Check if any users assigned
    user_count_q = await db.execute(
        select(func.count(User.id)).where(User.role_definition_id == rd_id)
    )
    count = user_count_q.scalar() or 0
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"לא ניתן למחוק — {count} משתמשים משויכים לתפקיד זה"
        )
    await db.delete(rd)
    await db.commit()
    return {"id": str(rd_id), "deleted": True}


# ═══════════════════════════════════════════
# System Health / Stats
# ═══════════════════════════════════════════

@router.get("/stats")
async def get_system_stats(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get system-wide statistics."""
    await require_admin(user, db)
    tenant_count = (await db.execute(select(func.count(Tenant.id)))).scalar() or 0
    user_count = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await db.execute(
        select(func.count(User.id)).where(User.is_active.is_(True))
    )).scalar() or 0
    role_count = (await db.execute(select(func.count(RoleDefinition.id)))).scalar() or 0
    return {
        "tenants": tenant_count,
        "users": user_count,
        "active_users": active_users,
        "role_definitions": role_count,
    }
