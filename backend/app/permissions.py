"""Permission checking utilities for RBAC."""

from typing import Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser
from app.models.resource import RoleDefinition


# System roles that bypass permission checks
SUPER_ADMIN_ROLES = {"super_admin"}
ADMIN_ROLES = {"super_admin", "tenant_admin"}

# All possible resources and actions (must match role_definitions.permissions keys)
RESOURCES = [
    "employees", "missions", "rules", "attendance", "settings",
    "reports", "audit_log", "notifications", "users",
]
ACTIONS = ["read", "write", "delete", "approve", "export"]
SPECIAL_PERMISSIONS = ["override_soft", "override_hard"]


async def get_user_permissions(user, db: AsyncSession) -> dict:
    """Get the effective permissions dict for a user."""
    if user.role_definition_id is None:
        # Legacy global admin (no tenant) — full permissions
        if user.tenant_id is None:
            perms = {r: ACTIONS[:] for r in RESOURCES}
            perms["override_soft"] = True
            perms["override_hard"] = True
            return perms
        # User with no role in a tenant — minimal read-only (dashboard only)
        return {}

    result = await db.execute(
        select(RoleDefinition).where(RoleDefinition.id == user.role_definition_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        return {}

    # Super admin / tenant_admin get full access
    if role.name in SUPER_ADMIN_ROLES:
        perms = {r: ACTIONS[:] for r in RESOURCES}
        perms["override_soft"] = True
        perms["override_hard"] = True
        return perms

    if role.name == "tenant_admin":
        perms = {r: ACTIONS[:] for r in RESOURCES}
        perms["override_soft"] = True
        perms["override_hard"] = False
        return perms

    return role.permissions or {}


def require_permission(resource: str, action: str):
    """
    FastAPI dependency factory: check that current user has permission for resource+action.
    Usage: Depends(require_permission("soldiers", "write"))
    """
    async def checker(
        user: CurrentUser,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        perms = await get_user_permissions(user, db)
        resource_perms = perms.get(resource, [])
        if isinstance(resource_perms, list) and action in resource_perms:
            return
        # Check by role name fallback for system admins
        if user.role_definition_id:
            result = await db.execute(
                select(RoleDefinition).where(RoleDefinition.id == user.role_definition_id)
            )
            role = result.scalar_one_or_none()
            if role and role.name in ADMIN_ROLES:
                return
        # Global admin fallback
        if user.tenant_id is None and user.role_definition_id is None:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"אין הרשאה: {resource}.{action}",
        )

    return checker


def require_super_admin():
    """Dependency: require system-level super_admin role."""
    async def checker(
        user: CurrentUser,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        # Global admin (no tenant)
        if user.tenant_id is None and user.role_definition_id is None:
            return
        if user.role_definition_id:
            result = await db.execute(
                select(RoleDefinition).where(RoleDefinition.id == user.role_definition_id)
            )
            role = result.scalar_one_or_none()
            if role and role.name in SUPER_ADMIN_ROLES:
                return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="נדרשת הרשאת מנהל מערכת",
        )

    return checker


def require_tenant_admin():
    """Dependency: require at least tenant_admin role."""
    async def checker(
        user: CurrentUser,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        if user.tenant_id is None and user.role_definition_id is None:
            return
        if user.role_definition_id:
            result = await db.execute(
                select(RoleDefinition).where(RoleDefinition.id == user.role_definition_id)
            )
            role = result.scalar_one_or_none()
            if role and role.name in ADMIN_ROLES:
                return
            # Also check if they have settings.write
            if role and isinstance(role.permissions, dict):
                if "write" in (role.permissions.get("settings") or []):
                    return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="נדרשת הרשאת מנהל",
        )

    return checker
