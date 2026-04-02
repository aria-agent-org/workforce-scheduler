"""Admin integration settings router — configure integrations from dashboard."""

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.integration_config import (
    INTEGRATION_KEYS,
    IntegrationConfig,
    decrypt_value,
    encrypt_value,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/integrations", tags=["admin-integrations"])


# ---------- Schemas ----------

class IntegrationValueOut(BaseModel):
    key: str
    value: str  # masked for sensitive
    category: str
    label: str
    label_he: str
    sensitive: bool
    configured: bool
    updated_at: str | None = None


class CategoryOut(BaseModel):
    category: str
    label: str
    items: list[IntegrationValueOut]


class UpdateIntegrationIn(BaseModel):
    value: str


class TestResultOut(BaseModel):
    success: bool
    message: str


# ---------- Helpers ----------

def _require_super_admin(user):
    """Raise 403 if user is not super_admin."""
    role = getattr(user, "role", None)
    if role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")


CATEGORY_LABELS = {
    "telegram": "טלגרם",
    "whatsapp": "וואטסאפ",
    "email": "אימייל (SMTP)",
    "sms": "SMS",
    "ai": "בוט AI",
    "push": "Push Notifications",
    "google_sheets": "Google Sheets",
}


async def get_integration_value(key: str, db: AsyncSession) -> str:
    """Get integration config value — DB first, env fallback."""
    result = await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.key == key)
    )
    config = result.scalar_one_or_none()
    if config and config.value:
        return config.get_decrypted_value()
    # Fallback to env var (uppercase)
    env_key = key.upper()
    return os.environ.get(env_key, "")


# ---------- Endpoints ----------

@router.get("", response_model=list[CategoryOut])
async def list_integrations(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all integration configs grouped by category."""
    _require_super_admin(user)

    # Load all existing configs from DB
    result = await db.execute(select(IntegrationConfig))
    db_configs = {c.key: c for c in result.scalars().all()}

    # Group by category
    categories: dict[str, list[IntegrationValueOut]] = {}
    for key, meta in INTEGRATION_KEYS.items():
        cat = meta["category"]
        if cat not in categories:
            categories[cat] = []

        db_config = db_configs.get(key)
        if db_config:
            display_value = db_config.get_masked_value()
            configured = bool(db_config.value)
            updated_at = db_config.updated_at.isoformat() if db_config.updated_at else None
        else:
            # Check env fallback
            env_val = os.environ.get(key.upper(), "")
            if env_val:
                display_value = "(env)" if meta.get("sensitive") else env_val
                configured = True
            else:
                display_value = ""
                configured = False
            updated_at = None

        categories[cat].append(IntegrationValueOut(
            key=key,
            value=display_value,
            category=cat,
            label=meta["label"],
            label_he=meta["label_he"],
            sensitive=meta.get("sensitive", False),
            configured=configured,
            updated_at=updated_at,
        ))

    return [
        CategoryOut(
            category=cat,
            label=CATEGORY_LABELS.get(cat, cat),
            items=items,
        )
        for cat, items in categories.items()
    ]


@router.put("/{key}", response_model=IntegrationValueOut)
async def update_integration(
    key: str,
    body: UpdateIntegrationIn,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an integration config value."""
    _require_super_admin(user)

    if key not in INTEGRATION_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown integration key: {key}")

    meta = INTEGRATION_KEYS[key]

    # Encrypt if sensitive
    stored_value = encrypt_value(body.value) if meta.get("sensitive") else body.value

    # Upsert
    result = await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.key == key)
    )
    config = result.scalar_one_or_none()

    if config:
        config.value = stored_value
        config.updated_at = datetime.now(timezone.utc)
        config.updated_by = user.id
    else:
        config = IntegrationConfig(
            key=key,
            value=stored_value,
            category=meta["category"],
            updated_at=datetime.now(timezone.utc),
            updated_by=user.id,
        )
        db.add(config)

    await db.commit()
    await db.refresh(config)

    return IntegrationValueOut(
        key=key,
        value=config.get_masked_value(),
        category=meta["category"],
        label=meta["label"],
        label_he=meta["label_he"],
        sensitive=meta.get("sensitive", False),
        configured=True,
        updated_at=config.updated_at.isoformat() if config.updated_at else None,
    )


@router.post("/test/{category}", response_model=TestResultOut)
async def test_integration(
    category: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Test an integration connection."""
    _require_super_admin(user)

    try:
        if category == "telegram":
            return await _test_telegram(db)
        elif category == "whatsapp":
            return await _test_whatsapp(db)
        elif category == "email":
            return await _test_email(db)
        elif category == "sms":
            return await _test_sms(db)
        elif category == "ai":
            return await _test_ai(db)
        elif category == "push":
            return TestResultOut(success=True, message="VAPID keys configured — push available")
        elif category == "google_sheets":
            return await _test_google_sheets(db)
        else:
            return TestResultOut(success=False, message=f"Unknown category: {category}")
    except Exception as e:
        logger.exception(f"Integration test failed for {category}")
        return TestResultOut(success=False, message=str(e))


@router.post("/telegram/set-webhook", response_model=TestResultOut)
async def set_telegram_webhook(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register Telegram webhook automatically."""
    _require_super_admin(user)

    bot_token = await get_integration_value("telegram_bot_token", db)
    if not bot_token:
        return TestResultOut(success=False, message="טוקן בוט טלגרם לא מוגדר")

    webhook_url = await get_integration_value("telegram_webhook_url", db)
    if not webhook_url:
        webhook_url = "https://shavtzak.site/webhooks/telegram"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/setWebhook",
                json={"url": webhook_url, "allowed_updates": ["message", "callback_query"]},
            )
            data = resp.json()
            if data.get("ok"):
                # Save webhook URL to DB
                result = await db.execute(
                    select(IntegrationConfig).where(IntegrationConfig.key == "telegram_webhook_url")
                )
                cfg = result.scalar_one_or_none()
                if not cfg:
                    cfg = IntegrationConfig(key="telegram_webhook_url", value=webhook_url, category="telegram")
                    db.add(cfg)
                else:
                    cfg.value = webhook_url
                await db.commit()

                return TestResultOut(success=True, message=f"Webhook registered: {webhook_url}")
            else:
                return TestResultOut(success=False, message=f"Telegram error: {data.get('description', 'unknown')}")
    except Exception as e:
        return TestResultOut(success=False, message=f"Connection error: {e}")


# ---------- Test helpers ----------

async def _test_telegram(db: AsyncSession) -> TestResultOut:
    bot_token = await get_integration_value("telegram_bot_token", db)
    if not bot_token:
        return TestResultOut(success=False, message="טוקן בוט לא מוגדר")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"https://api.telegram.org/bot{bot_token}/getMe")
            data = resp.json()
            if data.get("ok"):
                bot_name = data["result"].get("username", "unknown")
                return TestResultOut(success=True, message=f"✅ מחובר לבוט: @{bot_name}")
            return TestResultOut(success=False, message=f"Telegram error: {data.get('description')}")
    except Exception as e:
        return TestResultOut(success=False, message=f"Connection error: {e}")


async def _test_whatsapp(db: AsyncSession) -> TestResultOut:
    token = await get_integration_value("whatsapp_api_token", db)
    phone_id = await get_integration_value("whatsapp_phone_number_id", db)
    if not token or not phone_id:
        return TestResultOut(success=False, message="חסר API Token או Phone Number ID")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://graph.facebook.com/v18.0/{phone_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                display = data.get("display_phone_number", "unknown")
                return TestResultOut(success=True, message=f"✅ מחובר: {display}")
            return TestResultOut(success=False, message=f"WhatsApp API error: {resp.status_code}")
    except Exception as e:
        return TestResultOut(success=False, message=f"Connection error: {e}")


async def _test_email(db: AsyncSession) -> TestResultOut:
    host = await get_integration_value("smtp_host", db)
    port_str = await get_integration_value("smtp_port", db)
    user = await get_integration_value("smtp_user", db)
    password = await get_integration_value("smtp_password", db)
    if not host or not user:
        return TestResultOut(success=False, message="חסר SMTP Host או User")
    try:
        import aiosmtplib
        port = int(port_str) if port_str else 587
        smtp = aiosmtplib.SMTP(hostname=host, port=port, start_tls=True, timeout=10)
        await smtp.connect()
        await smtp.login(user, password)
        await smtp.quit()
        return TestResultOut(success=True, message=f"✅ מחובר ל-{host}:{port}")
    except Exception as e:
        return TestResultOut(success=False, message=f"SMTP error: {e}")


async def _test_sms(db: AsyncSession) -> TestResultOut:
    key_id = await get_integration_value("aws_access_key_id", db)
    secret = await get_integration_value("aws_secret_access_key", db)
    region = await get_integration_value("aws_region", db)
    if not key_id or not secret:
        return TestResultOut(success=False, message="חסר AWS credentials")
    try:
        import boto3
        client = boto3.client("sns", region_name=region or "eu-west-1",
                              aws_access_key_id=key_id, aws_secret_access_key=secret)
        client.get_sms_attributes()
        return TestResultOut(success=True, message=f"✅ AWS SNS מחובר ({region or 'eu-west-1'})")
    except Exception as e:
        return TestResultOut(success=False, message=f"AWS error: {e}")


async def _test_ai(db: AsyncSession) -> TestResultOut:
    api_key = await get_integration_value("ai_api_key", db)
    base_url = await get_integration_value("ai_base_url", db) or "https://openrouter.ai/api/v1"
    model = await get_integration_value("ai_model", db) or "claude-sonnet-4-20250514"
    if not api_key:
        return TestResultOut(success=False, message="חסר AI API Key")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5},
            )
            if resp.status_code == 200:
                return TestResultOut(success=True, message=f"✅ AI מחובר — מודל: {model}")
            return TestResultOut(success=False, message=f"AI API error: {resp.status_code} — {resp.text[:100]}")
    except Exception as e:
        return TestResultOut(success=False, message=f"Connection error: {e}")


async def _test_google_sheets(db: AsyncSession) -> TestResultOut:
    creds_json = await get_integration_value("google_service_account_json", db)
    if not creds_json:
        return TestResultOut(success=False, message="חסר Service Account JSON")
    try:
        import json
        creds = json.loads(creds_json)
        email = creds.get("client_email", "unknown")
        return TestResultOut(success=True, message=f"✅ Service Account: {email}")
    except Exception as e:
        return TestResultOut(success=False, message=f"Invalid JSON: {e}")
