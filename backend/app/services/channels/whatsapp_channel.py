"""WhatsApp notification channel via Meta Cloud API."""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0"


async def send_whatsapp(phone: str, message: str) -> bool:
    """
    Send a WhatsApp message via the Meta Cloud API.

    Args:
        phone: Recipient phone number in international format (no +).
        message: Message text.

    Returns:
        True if sent successfully, False otherwise.
    """
    settings = get_settings()

    api_token = settings.whatsapp_api_token
    phone_number_id = settings.whatsapp_phone_number_id

    if not api_token or not phone_number_id:
        logger.error("WhatsApp not configured — missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID")
        return False

    # Strip leading + if present
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
