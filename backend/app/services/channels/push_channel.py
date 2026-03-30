"""Web Push notification channel via pywebpush."""

import json
import logging

from pywebpush import WebPushException, webpush

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_push(
    subscription_info: dict,
    title: str,
    body: str,
) -> bool:
    """
    Send a web push notification.

    Args:
        subscription_info: Push subscription dict with endpoint, keys.p256dh, keys.auth.
        title: Notification title.
        body: Notification body text.

    Returns:
        True if sent successfully, False otherwise.
    """
    settings = get_settings()

    vapid_private_key = settings.vapid_private_key
    vapid_claims_email = settings.vapid_claims_email

    if not vapid_private_key:
        logger.error("Push not configured — missing VAPID_PRIVATE_KEY")
        return False

    try:
        payload = json.dumps({
            "title": title,
            "body": body,
        })

        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": f"mailto:{vapid_claims_email}"},
        )

        logger.info(f"Push sent — title: {title[:50]}")
        return True

    except WebPushException as exc:
        logger.error(f"WebPush error: {exc}")
        return False
    except Exception as exc:
        logger.error(f"Unexpected error sending push: {exc}")
        return False
