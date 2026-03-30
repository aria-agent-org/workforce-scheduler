"""Multi-channel notification dispatcher with budget checking."""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee, EmployeeNotificationPreference
from app.models.notification import (
    NotificationChannelConfig,
    NotificationLog,
    NotificationTemplate,
)
from app.services.channels.email_channel import send_email
from app.services.channels.sms_channel import send_sms
from app.services.channels.telegram_channel import send_telegram
from app.services.channels.whatsapp_channel import send_whatsapp

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

            # Budget check
            budget_ok = await self._check_budget(tenant_id, channel_name)
            if not budget_ok:
                logger.warning(
                    f"Budget exceeded for channel {channel_name} in tenant {tenant_id} — skipping"
                )
                log = NotificationLog(
                    tenant_id=tenant_id,
                    employee_id=employee_id,
                    channel=channel_name,
                    event_type_code=event_type_code,
                    template_id=template.id,
                    body_sent=None,
                    language_sent=lang,
                    status="skipped_budget",
                )
                self.db.add(log)
                continue

            # Render message body
            body_template = channel_config.get("body", {})
            body = body_template.get(lang, body_template.get("he", ""))
            if variables:
                for key, value in variables.items():
                    body = body.replace(f"{{{key}}}", str(value))

            # Get subject for email channel
            subject = channel_config.get("subject", {}).get(lang, "שבצק — התראה")

            # Dispatch to channel
            success = await self._dispatch(channel_name, employee, body, subject)

            # Get cost per message
            cost = await self._get_cost_per_message(tenant_id, channel_name)

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
                cost_usd=cost if success else None,
                sent_at=datetime.now(timezone.utc) if success else None,
            )
            self.db.add(log)

            if success:
                sent_channels.append(channel_name)

        await self.db.flush()
        return sent_channels

    async def _check_budget(self, tenant_id: UUID, channel: str) -> bool:
        """Check if the monthly budget for a channel has been exceeded."""
        config_result = await self.db.execute(
            select(NotificationChannelConfig).where(
                NotificationChannelConfig.tenant_id == tenant_id,
                NotificationChannelConfig.channel == channel,
                NotificationChannelConfig.is_enabled.is_(True),
            )
        )
        config = config_result.scalar_one_or_none()

        if not config:
            # No config means no budget limit — allow
            return True

        if config.monthly_budget_usd is None:
            return True

        # Sum cost_usd for this channel in the current month
        now = datetime.now(timezone.utc)
        first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        spent_result = await self.db.execute(
            select(func.coalesce(func.sum(NotificationLog.cost_usd), Decimal("0"))).where(
                NotificationLog.tenant_id == tenant_id,
                NotificationLog.channel == channel,
                NotificationLog.status == "sent",
                NotificationLog.created_at >= first_of_month,
            )
        )
        spent = spent_result.scalar() or Decimal("0")

        if spent >= config.monthly_budget_usd:
            return False

        return True

    async def _get_cost_per_message(self, tenant_id: UUID, channel: str) -> Decimal | None:
        """Get the cost per message for a channel."""
        config_result = await self.db.execute(
            select(NotificationChannelConfig.cost_per_message_usd).where(
                NotificationChannelConfig.tenant_id == tenant_id,
                NotificationChannelConfig.channel == channel,
            )
        )
        return config_result.scalar_one_or_none()

    async def _dispatch(
        self, channel: str, employee: Employee, body: str, subject: str = ""
    ) -> bool:
        """Dispatch a message to a specific channel."""
        channels = employee.notification_channels or {}

        if channel == "push":
            return await self._dispatch_push(employee)

        elif channel == "whatsapp":
            phone = channels.get("phone_whatsapp")
            if phone:
                return await send_whatsapp(phone, body)
            logger.warning(f"No WhatsApp phone for employee {employee.full_name}")

        elif channel == "telegram":
            chat_id = channels.get("telegram_chat_id")
            if chat_id:
                return await send_telegram(chat_id, body)
            logger.warning(f"No Telegram chat_id for employee {employee.full_name}")

        elif channel == "email":
            email_addr = channels.get("email")
            if email_addr:
                return await send_email(to=email_addr, subject=subject, body=body)
            logger.warning(f"No email for employee {employee.full_name}")

        elif channel == "sms":
            phone = channels.get("phone_sms")
            if phone:
                return await send_sms(phone, body)
            logger.warning(f"No SMS phone for employee {employee.full_name}")

        else:
            logger.warning(f"Unknown notification channel: {channel}")

        return False

    async def _dispatch_push(self, employee: Employee) -> bool:
        """Send push notification via linked user's push subscriptions."""
        try:
            from app.models.user import User
            from app.routers.push import send_push_to_user

            user_result = await self.db.execute(
                select(User).where(
                    User.employee_id == employee.id,
                    User.is_active.is_(True),
                )
            )
            linked_user = user_result.scalar_one_or_none()
            if linked_user:
                sent = await send_push_to_user(
                    self.db,
                    linked_user.id,
                    title="שבצק",
                    body="",
                )
                if sent > 0:
                    return True
                logger.warning(f"No push subscriptions for user {linked_user.id}")
            else:
                logger.warning(f"No linked user for employee {employee.full_name}")
        except Exception as e:
            logger.error(f"Push send error for {employee.full_name}: {e}")
        return False
