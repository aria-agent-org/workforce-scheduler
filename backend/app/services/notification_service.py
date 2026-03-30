"""Multi-channel notification dispatcher."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee, EmployeeNotificationPreference
from app.models.notification import (
    NotificationChannelConfig,
    NotificationLog,
    NotificationTemplate,
)

logger = logging.getLogger(__name__)


class NotificationService:
    """Dispatch notifications across channels (push, WhatsApp, Telegram, email, SMS)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def send(
        self,
        tenant_id: UUID,
        employee_id: UUID,
        event_type_code: str,
        variables: dict | None = None,
    ) -> list[str]:
        """
        Send a notification to an employee for a given event type.
        Returns list of channels successfully sent to.
        """
        # Get employee
        emp_result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = emp_result.scalar_one_or_none()
        if not employee:
            logger.warning(f"Employee {employee_id} not found for notification")
            return []

        # Get notification template
        tmpl_result = await self.db.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.tenant_id == tenant_id,
                NotificationTemplate.event_type_code == event_type_code,
                NotificationTemplate.is_active.is_(True),
            )
        )
        template = tmpl_result.scalar_one_or_none()
        if not template:
            logger.warning(f"No active template for event {event_type_code}")
            return []

        # Get employee preferences
        pref_result = await self.db.execute(
            select(EmployeeNotificationPreference).where(
                EmployeeNotificationPreference.employee_id == employee_id,
                EmployeeNotificationPreference.event_type_code == event_type_code,
            )
        )
        preference = pref_result.scalar_one_or_none()

        # Determine language
        lang = employee.preferred_language or "he"

        # Send to each enabled channel
        sent_channels = []
        channels = template.channels or {}

        for channel_name, channel_config in channels.items():
            if not channel_config.get("enabled", False):
                continue

            # Check employee preference overrides
            if preference and preference.channel_overrides:
                if not preference.channel_overrides.get(channel_name, True):
                    continue

            # Render message body
            body_template = channel_config.get("body", {})
            body = body_template.get(lang, body_template.get("he", ""))
            if variables:
                for key, value in variables.items():
                    body = body.replace(f"{{{key}}}", str(value))

            # Dispatch to channel (placeholder — real implementations in tasks/)
            success = await self._dispatch(channel_name, employee, body)

            # Log the notification
            log = NotificationLog(
                tenant_id=tenant_id,
                employee_id=employee_id,
                channel=channel_name,
                event_type_code=event_type_code,
                template_id=template.id,
                body_sent=body,
                language_sent=lang,
                status="sent" if success else "failed",
            )
            self.db.add(log)

            if success:
                sent_channels.append(channel_name)

        await self.db.flush()
        return sent_channels

    async def _dispatch(
        self, channel: str, employee: Employee, body: str
    ) -> bool:
        """Dispatch a message to a specific channel. Override per channel."""
        channels = employee.notification_channels or {}

        if channel == "push":
            # Send real push via linked user's push subscriptions
            try:
                from sqlalchemy import select as sa_select
                from app.models.user import User
                from app.routers.push import send_push_to_user

                user_result = await self.db.execute(
                    sa_select(User).where(
                        User.employee_id == employee.id,
                        User.is_active.is_(True),
                    )
                )
                linked_user = user_result.scalar_one_or_none()
                if linked_user:
                    sent = await send_push_to_user(
                        self.db, linked_user.id,
                        title="שבצק",
                        body=body,
                    )
                    if sent > 0:
                        return True
                    logger.warning(f"No push subscriptions for user {linked_user.id}")
                else:
                    logger.warning(f"No linked user for employee {employee.full_name}")
            except Exception as e:
                logger.error(f"Push send error for {employee.full_name}: {e}")
            return False
        elif channel == "whatsapp":
            phone = channels.get("phone_whatsapp")
            if phone:
                # TODO: WhatsApp Business API
                logger.info(f"WhatsApp to {phone}: {body[:50]}")
                return True
        elif channel == "telegram":
            chat_id = channels.get("telegram_chat_id")
            if chat_id:
                # TODO: Telegram Bot API
                logger.info(f"Telegram to {chat_id}: {body[:50]}")
                return True
        elif channel == "email":
            email = channels.get("email")
            if email:
                # TODO: SES/SMTP
                logger.info(f"Email to {email}: {body[:50]}")
                return True
        elif channel == "sms":
            phone = channels.get("phone_sms")
            if phone:
                # TODO: SNS
                logger.info(f"SMS to {phone}: {body[:50]}")
                return True

        return False
