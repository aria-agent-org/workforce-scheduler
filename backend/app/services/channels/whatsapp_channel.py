"""WhatsApp notification channel via Meta Cloud API — reads config from DB first, env fallback."""

import logging
import os

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0"


async def _get_whatsapp_config(db: AsyncSession | None = None) -> tuple[str, str]:
    """Get WhatsApp API token and phone number ID from DB or env."""
    api_token = ""
    phone_number_id = ""

    if db:
        try:
            from app.models.integration_config import IntegrationConfig
            for key in ("whatsapp_api_token", "whatsapp_phone_number_id"):
                result = await db.execute(
                    select(IntegrationConfig).where(IntegrationConfig.key == key)
                )
                config = result.scalar_one_or_none()
                if config and config.value:
                    val = config.get_decrypted_value()
                    if key == "whatsapp_api_token":
                        api_token = val
                    else:
                        phone_number_id = val
        except Exception:
            pass

    # Fallback to env
    if not api_token:
        from app.config import get_settings
        settings = get_settings()
        api_token = settings.whatsapp_api_token or ""
    if not phone_number_id:
        from app.config import get_settings
        settings = get_settings()
        phone_number_id = settings.whatsapp_phone_number_id or ""

    return api_token, phone_number_id


async def send_whatsapp(phone: str, message: str, db: AsyncSession | None = None) -> bool:
    """
    Send a WhatsApp message via the Meta Cloud API.

    Args:
        phone: Recipient phone number in international format (no +).
        message: Message text.
        db: Optional database session to read config from DB.

    Returns:
        True if sent successfully, False otherwise.
    """
    api_token, phone_number_id = await _get_whatsapp_config(db)

    if not api_token or not phone_number_id:
        logger.error("WhatsApp not configured — missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID")
        return False

    phone = phone.lstrip("+")

    url = f"{WHATSAPP_API_BASE}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"body": message},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            msg_id = data.get("messages", [{}])[0].get("id", "unknown")
            logger.info(f"WhatsApp sent to {phone} — message_id: {msg_id}")
            return True
        else:
            logger.error(
                f"WhatsApp API error — status={response.status_code} body={response.text[:200]}"
            )
            return False

    except httpx.HTTPError as exc:
        logger.error(f"HTTP error sending WhatsApp to {phone}: {exc}")
        return False
    except Exception as exc:
        logger.error(f"Unexpected error sending WhatsApp to {phone}: {exc}")
        return False
