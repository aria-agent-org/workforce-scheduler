"""Tenant-scoped user management endpoints."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.user import User, UserSession
from app.models.employee import Employee
from app.models.resource import RoleDefinition
from app.models.audit import AuditLog
from app.services.auth_service import AuthService

router = APIRouter()


class TenantUserCreate(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=6, max_length=128)
    role_definition_id: UUID | None = None
    employee_id: UUID | None = None
    preferred_language: str = "he"


class TenantUserUpdate(BaseModel):
    email: str | None = None
    role_definition_id: UUID | None = None
    employee_id: UUID | None = None
    preferred_language: str | None = None
    is_active: bool | None = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


# ═══════════════════════════════════════════
# Tenant User CRUD
# ═══════════════════════════════════════════

@router.get("")
async def list_tenant_users(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1, page_size: int = 50,
    search: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
) -> dict:
    """List all users within the current tenant."""
    query = select(User).where(User.tenant_id == tenant.id)
    if search:
        query = query.where(User.email.ilike(f"%{search}%"))
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    total_q = await db.execute(
        select(func.count()).select_from(
            query.subquery()
        )
    )
    total = total_q.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    users = result.scalars().all()

    items = []
    for u in users:
        role_name = None
        role_label = None
        if u.role_definition_id:
            rd_res = await db.execute(
                select(RoleDefinition).where(RoleDefinition.id == u.role_definition_id)
            )
            rd = rd_res.scalar_one_or_none()
            if rd:
                role_name = rd.name
                role_label = rd.label

        employee_name = None
        if u.employee_id:
            emp_res = await db.execute(
                select(Employee).where(Employee.id == u.employee_id)
            )
            emp = emp_res.scalar_one_or_none()
            employee_name = emp.full_name if emp else None

        # Count active sessions
        sess_count = (await db.execute(
            select(func.count()).where(
                UserSession.user_id == u.id,
                UserSession.revoked_at.is_(None),
            )
        )).scalar() or 0

        items.append({
            "id": str(u.id),
            "email": u.email,
            "role_definition_id": str(u.role_definition_id) if u.role_definition_id else None,
            "role_name": role_name,
            "role_label": role_label,
            "employee_id": str(u.employee_id) if u.employee_id else None,
            "employee_name": employee_name,
            "preferred_language": u.preferred_language,
            "is_active": u.is_active,
            "two_factor_enabled": u.two_factor_enabled,
            "last_login": str(u.last_login) if u.last_login else None,
            "active_sessions": sess_count,
            "created_at": str(u.created_at),
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tenant_user(
    data: TenantUserCreate,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new user within the tenant."""
    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"האימייל '{data.email}' כבר קיים במערכת")

    # Validate role belongs to this tenant
    if data.role_definition_id:
        rd_res = await db.execute(
            select(RoleDefinition).where(
                RoleDefinition.id == data.role_definition_id,
                RoleDefinition.tenant_id == tenant.id,
            )
        )
        if not rd_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="הגדרת תפקיד לא נמצאה")

    # Validate employee belongs to tenant and is not already linked
    if data.employee_id:
        emp_res = await db.execute(
            select(Employee).where(
                Employee.id == data.employee_id,
                Employee.tenant_id == tenant.id,
            )
        )
        if not emp_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="עובד לא נמצא")

        # Check if another user already has this employee_id
        existing_link = await db.execute(
            select(User).where(User.employee_id == data.employee_id)
        )
        linked_user = existing_link.scalar_one_or_none()
        if linked_user:
            raise HTTPException(
                status_code=409,
                detail=f"חייל זה כבר מקושר למשתמש אחר ({linked_user.email})"
            )

    new_user = User(
        tenant_id=tenant.id,
        email=data.email,
        password_hash=AuthService.hash_password(data.password),
        role_definition_id=data.role_definition_id,
        employee_id=data.employee_id,
        preferred_language=data.preferred_language,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="user", entity_id=new_user.id,
        after_state={"email": new_user.email},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {
        "id": str(new_user.id),
        "email": new_user.email,
        "role_definition_id": str(new_user.role_definition_id) if new_user.role_definition_id else None,
        "employee_id": str(new_user.employee_id) if new_user.employee_id else None,
        "is_active": new_user.is_active,
        "created_at": str(new_user.created_at),
    }


@router.get("/{user_id}")
async def get_tenant_user(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a specific user in the tenant."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    role_name = None
    role_label = None
    if target.role_definition_id:
        rd_res = await db.execute(
            select(RoleDefinition).where(RoleDefinition.id == target.role_definition_id)
        )
        rd = rd_res.scalar_one_or_none()
        if rd:
            role_name = rd.name
            role_label = rd.label

    employee_name = None
    if target.employee_id:
        emp_res = await db.execute(
            select(Employee).where(Employee.id == target.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        employee_name = emp.full_name if emp else None

    # Get sessions
    sess_res = await db.execute(
        select(UserSession).where(
            UserSession.user_id == target.id,
            UserSession.revoked_at.is_(None),
        ).order_by(UserSession.created_at.desc())
    )
    sessions = [
        {
            "id": str(s.id),
            "device_info": s.device_info,
            "ip_address": s.ip_address,
            "auth_method": s.auth_method,
            "last_active_at": str(s.last_active_at) if s.last_active_at else None,
            "created_at": str(s.created_at),
        }
        for s in sess_res.scalars().all()
    ]

    return {
        "id": str(target.id),
        "email": target.email,
        "role_definition_id": str(target.role_definition_id) if target.role_definition_id else None,
        "role_name": role_name,
        "role_label": role_label,
        "employee_id": str(target.employee_id) if target.employee_id else None,
        "employee_name": employee_name,
        "preferred_language": target.preferred_language,
        "is_active": target.is_active,
        "two_factor_enabled": target.two_factor_enabled,
        "last_login": str(target.last_login) if target.last_login else None,
        "sessions": sessions,
        "created_at": str(target.created_at),
    }


@router.patch("/{user_id}")
async def update_tenant_user(
    user_id: UUID,
    data: TenantUserUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a user within the tenant."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    before = {"email": target.email, "is_active": target.is_active}

    # Check employee_id uniqueness if changing
    update_data = data.model_dump(exclude_unset=True)
    if "employee_id" in update_data and update_data["employee_id"] is not None:
        new_emp_id = update_data["employee_id"]
        if new_emp_id != target.employee_id:
            existing_link = await db.execute(
                select(User).where(
                    User.employee_id == new_emp_id,
                    User.id != target.id,
                )
            )
            linked_user = existing_link.scalar_one_or_none()
            if linked_user:
                raise HTTPException(
                    status_code=409,
                    detail=f"חייל זה כבר מקושר למשתמש אחר ({linked_user.email})"
                )

    for key, value in update_data.items():
        setattr(target, key, value)

    # If deactivating user and linked to employee, deactivate employee too
    if data.is_active is False and target.employee_id:
        emp_res = await db.execute(
            select(Employee).where(Employee.id == target.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        if emp:
            emp.is_active = False

    await db.flush()
    await db.refresh(target)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update",
        entity_type="user", entity_id=target.id,
        before_state=before,
        after_state={"email": target.email, "is_active": target.is_active},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {
        "id": str(target.id),
        "email": target.email,
        "role_definition_id": str(target.role_definition_id) if target.role_definition_id else None,
        "employee_id": str(target.employee_id) if target.employee_id else None,
        "is_active": target.is_active,
    }


@router.delete("/{user_id}")
async def deactivate_tenant_user(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Deactivate a user (soft delete)."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    target.is_active = False

    # Also deactivate linked employee
    if target.employee_id:
        emp_res = await db.execute(
            select(Employee).where(Employee.id == target.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        if emp:
            emp.is_active = False

    # Revoke all sessions
    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == target.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="deactivate",
        entity_type="user", entity_id=target.id,
        after_state={"email": target.email, "is_active": False},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {"id": str(target.id), "is_active": False, "message": "משתמש הושבת"}


@router.post("/{user_id}/link-soldier")
async def link_user_to_soldier(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
    employee_id: UUID | None = None,
) -> dict:
    """Link a user to an employee (soldier)."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    if employee_id:
        emp_res = await db.execute(
            select(Employee).where(
                Employee.id == employee_id,
                Employee.tenant_id == tenant.id,
            )
        )
        if not emp_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="עובד לא נמצא")

        # Check if another user already has this employee_id
        existing_link = await db.execute(
            select(User).where(
                User.employee_id == employee_id,
                User.id != user_id,
            )
        )
        linked_user = existing_link.scalar_one_or_none()
        if linked_user:
            raise HTTPException(
                status_code=409,
                detail=f"חייל זה כבר מקושר למשתמש אחר ({linked_user.email})"
            )

    target.employee_id = employee_id
    await db.flush()
    await db.commit()

    return {
        "id": str(target.id),
        "employee_id": str(target.employee_id) if target.employee_id else None,
        "message": "משתמש קושר לעובד בהצלחה" if employee_id else "קישור לעובד הוסר",
    }


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: UUID,
    data: ResetPasswordRequest,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin reset password for a user."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    target.password_hash = AuthService.hash_password(data.new_password)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="reset_password",
        entity_type="user", entity_id=target.id,
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {"message": "סיסמה עודכנה בהצלחה"}


@router.get("/{user_id}/sessions")
async def list_user_sessions(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List active sessions for a user."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    sess_res = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        ).order_by(UserSession.created_at.desc())
    )
    return [
        {
            "id": str(s.id),
            "device_info": s.device_info,
            "ip_address": s.ip_address,
            "auth_method": s.auth_method,
            "last_active_at": str(s.last_active_at) if s.last_active_at else None,
            "created_at": str(s.created_at),
        }
        for s in sess_res.scalars().all()
    ]


@router.post("/{user_id}/force-logout")
async def force_logout_user(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force logout a user from all devices."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    count = (await db.execute(
        select(func.count()).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    )).scalar() or 0

    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="force_logout",
        entity_type="user", entity_id=user_id,
        after_state={"revoked_sessions": count},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {"message": f"{count} sessions נותקו בהצלחה"}
