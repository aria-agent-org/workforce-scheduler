"""FastAPI dependency injection."""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.tenant import Tenant
from app.models.user import User

settings = get_settings()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from JWT."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate token",
        )

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    request.state.user_id = user.id
    return user


async def get_tenant(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    """Resolve tenant from URL slug AND verify user belongs to it."""
    slug = getattr(request.state, "tenant_slug", None)
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant slug is required",
        )

    result = await db.execute(select(Tenant).where(Tenant.slug == slug, Tenant.is_active.is_(True)))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant '{slug}' not found",
        )

    # SECURITY: Verify user belongs to this tenant
    # Super admins can access any tenant
    is_super_admin = False
    if user.role_definition_id:
        from app.models.resource import RoleDefinition
        role_result = await db.execute(
            select(RoleDefinition.name).where(RoleDefinition.id == user.role_definition_id)
        )
        role_name = role_result.scalar_one_or_none()
        is_super_admin = role_name == "super_admin"

    # Allow: super_admin, no tenant_id (global admin), or matching tenant
    if not is_super_admin and user.tenant_id is not None and user.tenant_id != tenant.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="אין גישה לטננט זה",
        )

    return tenant


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentTenant = Annotated[Tenant, Depends(get_tenant)]
DB = Annotated[AsyncSession, Depends(get_db)]
