"""SSO router — Google OAuth and SAML integration."""

import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.tenant import Tenant
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sso"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class SSOConfigUpdate(BaseModel):
    provider: str
    client_id: str | None = None
    client_secret: str | None = None
    domain_hint: str | None = None
    auto_provision: bool = False
    allow_password_login: bool = True
    is_active: bool = True


@router.get("/sso/google/login")
async def google_sso_login(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Initiate Google OAuth flow."""
    from app.routers.integration_settings import get_integration_value

    # Try to get Google OAuth config
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise HTTPException(status_code=400, detail="Google SSO not configured")

    redirect_uri = f"https://shavtzak.site/api/v1/{tenant.slug}/sso/google/callback"

    auth_url = (
        f"{GOOGLE_AUTH_URL}"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=openid email profile"
        f"&access_type=offline"
    )

    return {"auth_url": auth_url}


@router.get("/sso/google/callback")
async def google_sso_callback(
    code: str = Query(...),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = f"https://shavtzak.site/api/v1/{tenant.slug}/sso/google/callback"

    # Exchange code for token
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })

    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange code for token")

    tokens = token_resp.json()
    access_token = tokens.get("access_token")

    # Get user info
    async with httpx.AsyncClient(timeout=10) as client:
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get user info")

    userinfo = userinfo_resp.json()
    email = userinfo.get("email")
    name = userinfo.get("name")

    if not email:
        raise HTTPException(status_code=400, detail="No email in Google response")

    # Find or create user
    result = await db.execute(
        select(User).where(User.email == email, User.tenant_id == tenant.id)
    )
    user = result.scalar_one_or_none()

    if not user:
        # Auto-provision if enabled
        user = User(
            tenant_id=tenant.id,
            email=email,
            full_name=name,
            role="viewer",
            password_hash=None,  # SSO users don't have passwords
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Generate JWT tokens
    from app.services.auth_service import AuthService
    auth = AuthService(db)
    access, refresh = await auth.create_tokens(user)

    # Redirect to frontend with token
    return RedirectResponse(
        url=f"https://shavtzak.site/login?sso_token={access}&refresh_token={refresh}",
    )
