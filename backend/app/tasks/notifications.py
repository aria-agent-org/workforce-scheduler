"""Notification-related Celery tasks."""

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select

from app.database import async_session_factory
from app.models.employee import Employee
from app.services.notification_service import NotificationService
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


@celery_app.task(name="app.tasks.notifications.send_notification")
def send_notification(
    tenant_id: str,
    employee_id: str,
    event_type_code: str,
    variables: dict | None = None,
) -> dict:
    """Send a notification asynchronously via all configured channels."""

    async def _send():
        async with async_session_factory() as session:
            svc = NotificationService(session)
            sent = await svc.send(
                tenant_id=UUID(tenant_id),
                employee_id=UUID(employee_id),
                event_type_code=event_type_code,
                variables=variables,
            )
            await session.commit()
            return sent

    logger.info(f"Sending {event_type_code} to employee {employee_id}")
    sent_channels = _run_async(_send())
    return {
        "status": "sent" if sent_channels else "no_channels",
        "event_type_code": event_type_code,
        "channels": sent_channels,
    }


@celery_app.task(name="app.tasks.notifications.send_daily_whatsapp_reminders")
def send_daily_whatsapp_reminders() -> dict:
    """Send daily WhatsApp session reminders to employees with expiring sessions."""

    async def _send_reminders():
        sent_count = 0
        async with async_session_factory() as session:
            # Find employees with WhatsApp configured
            result = await session.execute(
                select(Employee).where(
                    Employee.is_active.is_(True),
                    Employee.whatsapp_verified.is_(True),
                )
            )
            employees = result.scalars().all()

            svc = NotificationService(session)
            for emp in employees:
                try:
                    sent = await svc.send(
                        tenant_id=emp.tenant_id,
                        employee_id=emp.id,
                        event_type_code="whatsapp_session_reminder",
                    )
                    if sent:
                        sent_count += 1
                except Exception as exc:
                    logger.error(f"Failed to send reminder to {emp.full_name}: {exc}")

            await session.commit()
        return sent_count

    logger.info("Sending daily WhatsApp session reminders")
    sent = _run_async(_send_reminders())
    return {"status": "completed", "sent": sent}


@celery_app.task(name="app.tasks.notifications.cleanup_expired_tokens")
def cleanup_expired_tokens() -> dict:
    """Clean up expired magic link tokens and invitation tokens."""
    logger.info("Cleaning up expired tokens")
    # Token cleanup logic depends on auth model — placeholder
    return {"status": "completed", "cleaned": 0}
