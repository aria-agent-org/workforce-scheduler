"""Telegram notification channel via Bot API."""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


async def send_telegram(chat_id: str, message: str) -> bool:
    """
    Send a Telegram message via the Bot API.

    Args:
        chat_id: Telegram chat ID or username.
        message: Message text (supports Markdown).

    Returns:
        True if sent successfully, False otherwise.
    """
    settings = get_settings()

    bot_token = settings.telegram_bot_token

    if not bot_token:
        logger.error("Telegram not configured — missing TELEGRAM_BOT_TOKEN")
        return False

    url = f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=payload)

        if response.status_code == 200:
            data = response.json()
            if data.get("ok"):
                msg_id = data.get("result", {}).get("message_id", "unknown")
                logger.info(f"Telegram sent to {chat_id} — message_id: {msg_id}")
                return True
            else:
                logger.error(f"Telegram API returned ok=false: {data.get('description')}")
                return False
        else:
            logger.error(
                f"Telegram API error — status={response.status_code} body={response.text[:200]}"
            )
            return False

    except httpx.HTTPError as exc:
        logger.error(f"HTTP error sending Telegram to {chat_id}: {exc}")
        return False
    except Exception as exc:
        logger.error(f"Unexpected error sending Telegram to {chat_id}: {exc}")
        return False
