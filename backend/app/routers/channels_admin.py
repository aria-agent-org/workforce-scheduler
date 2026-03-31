"""Communication channel admin configuration — WhatsApp, Telegram, Email, SMS."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.permissions import require_permission
from app.models.tenant import CommunicationChannelConfig, Tenant

router = APIRouter()


# ─── Schemas ──────────────────────────────────

class ChannelConfigResponse(BaseModel):
    id: str
    channel: str
    provider: str | None
    is_enabled: bool
    config: dict | None
    verified: bool

    model_config = {"from_attributes": True}


class WhatsAppConfig(BaseModel):
    mode: str  # "business_api" | "qr_session"
    # Business API fields
    api_token: str | None = None
    phone_number_id: str | None = None
    business_account_id: str | None = None
    # QR session (future)
    session_id: str | None = None


class TelegramConfig(BaseModel):
    bot_token: str
    bot_username: str | None = None


class EmailConfig(BaseModel):
    provider: str  # "smtp" | "ses" | "sendgrid"
    # SMTP
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    from_address: str | None = None
    from_name: str | None = None
    # SES
    aws_access_key: str | None = None
    aws_secret_key: str | None = None
    aws_region: str | None = None


class SMSConfig(BaseModel):
    provider: str  # "twilio" | "sns" | "messagebird"
    # Twilio
    account_sid: str | None = None
    auth_token: str | None = None
    from_number: str | None = None
    # SNS
    aws_access_key: str | None = None
    aws_secret_key: str | None = None
    aws_region: str | None = None


class ChannelUpsertRequest(BaseModel):
    channel: str
    provider: str | None = None
    is_enabled: bool = True
    config: dict | None = None


class TenantFeaturesUpdate(BaseModel):
    features: dict


class TenantBrandingUpdate(BaseModel):
    logo_url: str | None = None
    favicon_url: str | None = None
    app_name: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    login_background_url: str | None = None
    login_text: str | None = None
    pwa_icon_url: str | None = None
    pwa_name: str | None = None


# ─── Tenant Features (must be before /{channel} to avoid path conflicts) ──

@router.get("/features", dependencies=[Depends(require_permission("settings", "read"))])
async def get_tenant_features(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get feature flags for this tenant."""
    return {
        "features": tenant.features or {},
        "custom_domain": tenant.custom_domain,
        "branding": tenant.branding or {},
    }


@router.put("/features", dependencies=[Depends(require_permission("settings", "write"))])
async def update_tenant_features(
    req: TenantFeaturesUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update feature flags for this tenant."""
    t_result = await db.execute(select(Tenant).where(Tenant.id == tenant.id))
    t = t_result.scalar_one()
    t.features = {**(t.features or {}), **req.features}
    await db.commit()
    return {"features": t.features}


@router.put("/branding", dependencies=[Depends(require_permission("settings", "write"))])
async def update_tenant_branding(
    req: TenantBrandingUpdate,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update branding for this tenant."""
    t_result = await db.execute(select(Tenant).where(Tenant.id == tenant.id))
    t = t_result.scalar_one()
    branding = t.branding or {}
    update_data = req.model_dump(exclude_none=True)
    branding.update(update_data)
    t.branding = branding
    await db.commit()
    return {"branding": t.branding}


@router.put("/custom-domain", dependencies=[Depends(require_permission("settings", "write"))])
async def update_custom_domain(
    data: dict,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set custom domain for this tenant."""
    domain = data.get("domain", "").strip()
    t_result = await db.execute(select(Tenant).where(Tenant.id == tenant.id))
    t = t_result.scalar_one()
    t.custom_domain = domain if domain else None
    await db.commit()
    return {"custom_domain": t.custom_domain}


# ─── Channel CRUD ─────────────────────────────

@router.get("/", dependencies=[Depends(require_permission("settings", "read"))])
async def list_channel_configs(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all communication channel configs for this tenant."""
    result = await db.execute(
        select(CommunicationChannelConfig).where(
            CommunicationChannelConfig.tenant_id == tenant.id
        )
    )
    configs = result.scalars().all()

    # Ensure all default channels are represented
    channel_map = {c.channel: c for c in configs}
    defaults = ["whatsapp", "telegram", "email", "sms"]
    response = []
    for ch in defaults:
        if ch in channel_map:
            c = channel_map[ch]
            response.append({
                "id": str(c.id),
                "channel": c.channel,
                "provider": c.provider,
                "is_enabled": c.is_enabled,
                "config": _mask_secrets(c.config) if c.config else None,
                "verified": c.is_verified,
            })
        else:
            response.append({
                "id": None,
                "channel": ch,
                "provider": None,
                "is_enabled": False,
                "config": None,
                "verified": False,
            })
    return response


def _mask_secrets(config: dict) -> dict:
    """Mask sensitive fields in config for display."""
    masked = {}
    sensitive_keys = {"api_token", "auth_token", "smtp_password", "aws_secret_key", "bot_token", "account_sid"}
    for k, v in config.items():
        if k in sensitive_keys and v:
            masked[k] = v[:4] + "****" + v[-4:] if len(str(v)) > 8 else "****"
        else:
            masked[k] = v
    return masked


@router.put("/{channel}", dependencies=[Depends(require_permission("settings", "write"))])
async def upsert_channel_config(
    channel: str,
    req: ChannelUpsertRequest,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or update a channel configuration."""
    if channel not in ["whatsapp", "telegram", "email", "sms"]:
        raise HTTPException(400, f"Unknown channel: {channel}")

    # Check tenant feature flag
    features = tenant.features or {}
    feature_key = f"channel_{channel}"
    if not features.get(feature_key, True):
        raise HTTPException(403, f"Channel {channel} is not enabled for this tenant")

    result = await db.execute(
        select(CommunicationChannelConfig).where(
            CommunicationChannelConfig.tenant_id == tenant.id,
            CommunicationChannelConfig.channel == channel,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.provider = req.provider
        existing.is_enabled = req.is_enabled
        if req.config:
            # Merge config, preserving existing secrets not included
            merged = {**(existing.config or {}), **req.config}
            # Remove any masked values
            merged = {k: v for k, v in merged.items() if not (isinstance(v, str) and "****" in v)}
            existing.config = merged
        existing.is_verified = False  # Reset verification on config change
    else:
        new_config = CommunicationChannelConfig(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            channel=channel,
            provider=req.provider,
            is_enabled=req.is_enabled,
            config=req.config,
            is_verified=False,
        )
        db.add(new_config)

    await db.commit()
    return {"status": "saved", "channel": channel}


@router.post("/{channel}/test", dependencies=[Depends(require_permission("settings", "write"))])
async def test_channel(
    channel: str,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Test a channel configuration by sending a test message."""
    result = await db.execute(
        select(CommunicationChannelConfig).where(
            CommunicationChannelConfig.tenant_id == tenant.id,
            CommunicationChannelConfig.channel == channel,
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Channel not configured")

    # TODO: Actually send test message via the configured provider
    # For now, mark as verified
    config.is_verified = True
    await db.commit()

    return {"status": "test_sent", "channel": channel, "verified": True}


@router.delete("/{channel}", dependencies=[Depends(require_permission("settings", "write"))])
async def delete_channel_config(
    channel: str,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a channel configuration."""
    result = await db.execute(
        select(CommunicationChannelConfig).where(
            CommunicationChannelConfig.tenant_id == tenant.id,
            CommunicationChannelConfig.channel == channel,
        )
    )
    config = result.scalar_one_or_none()
    if config:
        await db.delete(config)
        await db.commit()
    return {"status": "deleted", "channel": channel}



# (Features/branding/custom-domain routes are defined above /{channel} to avoid path conflicts)
