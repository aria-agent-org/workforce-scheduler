"""Notification-related Celery tasks."""

import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.notifications.send_notification")
def send_notification(
    tenant_id: str,
    employee_id: str,
    event_type_code: str,
    variables: dict | None = None,
) -> dict:
    """Send a notification asynchronously."""
    logger.info(f"Sending {event_type_code} to employee {employee_id}")
    # In production: create async DB session and use NotificationService
    return {"status": "sent", "event_type_code": event_type_code}


@celery_app.task(name="app.tasks.notifications.send_daily_whatsapp_reminders")
def send_daily_whatsapp_reminders() -> dict:
    """Send daily WhatsApp session reminders to employees."""
    logger.info("Sending daily WhatsApp session reminders")
    return {"status": "completed", "sent": 0}


@celery_app.task(name="app.tasks.notifications.cleanup_expired_tokens")
def cleanup_expired_tokens() -> dict:
    """Clean up expired magic link tokens and invitation tokens."""
    logger.info("Cleaning up expired tokens")
    return {"status": "completed", "cleaned": 0}
