"""Bot engine — processes incoming messages and routes to actions."""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bot import BotConfig, BotRegistrationToken
from app.models.employee import Employee

logger = logging.getLogger(__name__)


@dataclass
class BotResponse:
    """Structured response from the bot engine."""

    text: str
    buttons: list[dict] | None = None
    quick_replies: list[str] | None = None
    metadata: dict = field(default_factory=dict)


# Default Hebrew messages
MESSAGES = {
    "welcome": "שלום! 👋 ברוכים הבאים לשבצק. במה אוכל לעזור?",
    "not_registered": "לא זיהיתי אותך. אנא הירשם באמצעות קוד הרישום שקיבלת.",
    "invalid_token": "קוד הרישום אינו תקין או שפג תוקפו.",
    "registered_ok": "✅ נרשמת בהצלחה! כעת תוכל להשתמש בבוט.",
    "bot_disabled": "הבוט אינו פעיל כרגע. פנה למנהל שלך.",
    "unknown_action": "לא הבנתי את הבקשה. הנה התפריט הראשי:",
    "error": "אירעה שגיאה. אנא נסה שוב מאוחר יותר.",
    "menu_header": "📋 תפריט ראשי:",
}

# Known action codes
ACTION_MY_SHIFTS = "my_shifts"
ACTION_SWAP_REQUEST = "swap_request"
ACTION_REPORT_ABSENCE = "report_absence"
ACTION_CONTACT_MANAGER = "contact_manager"
ACTION_REGISTER = "register"
ACTION_MENU = "menu"

DEFAULT_MENU = [
    {"code": ACTION_MY_SHIFTS, "label": "📅 המשמרות שלי"},
    {"code": ACTION_SWAP_REQUEST, "label": "🔄 בקשת החלפה"},
    {"code": ACTION_REPORT_ABSENCE, "label": "🏥 דיווח היעדרות"},
    {"code": ACTION_CONTACT_MANAGER, "label": "📞 פנייה למנהל"},
]


class BotEngine:
    """Core bot engine — parses messages, navigates menus, dispatches actions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_message(
        self,
        tenant_id: UUID,
        platform: str,
        sender_id: str,
        message_text: str,
    ) -> BotResponse:
        """Main entry point: process an incoming chat message."""
        try:
            # Load bot config for this tenant + platform
            config = await self._get_config(tenant_id, platform)
            if config is None or not config.is_enabled:
                return BotResponse(text=MESSAGES["bot_disabled"])

            # Try to identify the employee by phone/sender_id
            employee = await self.get_employee_by_phone(tenant_id, sender_id)

            # Registration flow
            if employee is None:
                return await self._handle_unregistered(tenant_id, platform, sender_id, message_text)

            # Normalize input
            text = message_text.strip().lower()

            # Check for menu / help triggers
            if text in ("menu", "תפריט", "עזרה", "help", "/start"):
                return self._build_menu(config)

            # Try matching to an action code
            action_code = self._match_action(text, config)
            if action_code:
                return await self.handle_action(tenant_id, employee.id, action_code, {})

            # If AI mode is enabled, return a marker so the router can delegate to AIBot
            if config.ai_mode_enabled:
                return BotResponse(
                    text="",
                    metadata={"delegate_to_ai": True, "employee_id": str(employee.id)},
                )

            # Fallback
            fallback = config.fallback_message or {}
            fallback_text = fallback.get("text", MESSAGES["unknown_action"])
            menu = self._build_menu(config)
            return BotResponse(
                text=fallback_text,
                buttons=menu.buttons,
                quick_replies=menu.quick_replies,
            )

        except Exception:
            logger.exception("BotEngine.process_message error")
            return BotResponse(text=MESSAGES["error"])

    async def handle_action(
        self,
        tenant_id: UUID,
        employee_id: UUID,
        action_code: str,
        params: dict,
    ) -> BotResponse:
        """Execute a specific action for an identified employee."""
        if action_code == ACTION_MY_SHIFTS:
            return await self._action_my_shifts(tenant_id, employee_id)
        elif action_code == ACTION_SWAP_REQUEST:
            return BotResponse(
                text="🔄 כדי לבקש החלפה, שלח את שם המשמרת או התאריך שברצונך להחליף.",
                metadata={"flow": "swap", "step": "start"},
            )
        elif action_code == ACTION_REPORT_ABSENCE:
            return BotResponse(
                text="🏥 אנא ציין את התאריך ואת סיבת ההיעדרות.",
                metadata={"flow": "absence", "step": "start"},
            )
        elif action_code == ACTION_CONTACT_MANAGER:
            return BotResponse(
                text="📞 ההודעה שלך תועבר למנהל. אנא כתוב את הודעתך:",
                metadata={"flow": "contact_manager", "step": "start"},
            )
        elif action_code == ACTION_MENU:
            config = await self._get_config(tenant_id, "whatsapp")
            return self._build_menu(config)
        else:
            return BotResponse(text=MESSAGES["unknown_action"])

    async def get_employee_by_phone(
        self,
        tenant_id: UUID,
        phone: str,
    ) -> Employee | None:
        """Look up an employee by phone number in notification_channels."""
        # notification_channels is JSONB: {"whatsapp": "+972...", "telegram": "123456"}
        result = await self.db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant_id,
                Employee.is_active.is_(True),
                Employee.notification_channels.op("->>")(  # type: ignore[union-attr]
                    "phone"
                ) == phone,
            )
        )
        employee = result.scalar_one_or_none()
        if employee:
            return employee

        # Also try matching on whatsapp / telegram keys
        for key in ("whatsapp", "telegram"):
            result = await self.db.execute(
                select(Employee).where(
                    Employee.tenant_id == tenant_id,
                    Employee.is_active.is_(True),
                    Employee.notification_channels.op("->>")(key) == phone,  # type: ignore[union-attr]
                )
            )
            employee = result.scalar_one_or_none()
            if employee:
                return employee

        return None

    async def verify_registration_token(
        self,
        token: str,
    ) -> Employee | None:
        """Validate a one-time registration token and return the linked employee."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(BotRegistrationToken).where(
                BotRegistrationToken.token == token,
                BotRegistrationToken.expires_at > now,
                BotRegistrationToken.used_at.is_(None),
            )
        )
        reg = result.scalar_one_or_none()
        if reg is None:
            return None

        # Mark as used
        reg.used_at = now
        self.db.add(reg)

        # Fetch the employee
        emp_result = await self.db.execute(
            select(Employee).where(Employee.id == reg.employee_id)
        )
        return emp_result.scalar_one_or_none()

    # ── Private helpers ─────────────────────────────────────────────

    async def _get_config(self, tenant_id: UUID, platform: str) -> BotConfig | None:
        """Load bot config for tenant + platform."""
        result = await self.db.execute(
            select(BotConfig).where(
                BotConfig.tenant_id == tenant_id,
                BotConfig.platform == platform,
            )
        )
        return result.scalar_one_or_none()

    async def _handle_unregistered(
        self,
        tenant_id: UUID,
        platform: str,
        sender_id: str,
        message_text: str,
    ) -> BotResponse:
        """Handle messages from unregistered senders — try token registration."""
        text = message_text.strip()

        # If it looks like a registration token (alphanumeric, 6+ chars)
        if len(text) >= 6 and text.replace("-", "").isalnum():
            employee = await self.verify_registration_token(text)
            if employee:
                # Save sender_id to employee's notification_channels
                channels = employee.notification_channels or {}
                channels[platform] = sender_id
                employee.notification_channels = channels
                if platform == "whatsapp":
                    employee.whatsapp_verified = True
                elif platform == "telegram":
                    employee.telegram_verified = True
                self.db.add(employee)
                return BotResponse(text=MESSAGES["registered_ok"])
            else:
                return BotResponse(text=MESSAGES["invalid_token"])

        return BotResponse(text=MESSAGES["not_registered"])

    def _build_menu(self, config: BotConfig | None) -> BotResponse:
        """Build the main menu response from config or defaults."""
        if config and config.menu_structure:
            items = config.menu_structure.get("items", DEFAULT_MENU)
        else:
            items = DEFAULT_MENU

        lines = [MESSAGES["menu_header"]]
        buttons = []
        for item in items:
            label = item.get("label", item.get("code", ""))
            code = item.get("code", "")
            lines.append(f"• {label}")
            buttons.append({"code": code, "label": label})

        return BotResponse(
            text="\n".join(lines),
            buttons=buttons,
            quick_replies=[item.get("label", "") for item in items],
        )

    def _match_action(self, text: str, config: BotConfig) -> str | None:
        """Try to match user text to a known action code."""
        allowed = config.allowed_actions or {}
        action_list = allowed.get("actions", [])

        # Direct code match
        for action in action_list:
            code = action.get("code", "")
            if text == code:
                return code
            # Match by keywords
            keywords = action.get("keywords", [])
            for kw in keywords:
                if kw.lower() in text:
                    return code

        # Match default menu items by label substring
        for item in DEFAULT_MENU:
            if item["code"] in text or item["label"].lower() in text:
                return item["code"]

        # Numeric shortcuts (1-based)
        if text.isdigit():
            idx = int(text) - 1
            menu_items = (
                config.menu_structure.get("items", DEFAULT_MENU)
                if config.menu_structure
                else DEFAULT_MENU
            )
            if 0 <= idx < len(menu_items):
                return menu_items[idx].get("code")

        return None

    async def _action_my_shifts(self, tenant_id: UUID, employee_id: UUID) -> BotResponse:
        """Return upcoming shifts for the employee."""
        from app.models.scheduling import Mission, MissionAssignment

        now = datetime.now(timezone.utc).date()
        result = await self.db.execute(
            select(Mission)
            .join(MissionAssignment, MissionAssignment.mission_id == Mission.id)
            .where(
                Mission.tenant_id == tenant_id,
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.in_(["assigned", "confirmed"]),
                Mission.date >= now,
            )
            .order_by(Mission.date, Mission.start_time)
            .limit(10)
        )
        missions = result.scalars().all()

        if not missions:
            return BotResponse(text="📅 אין לך משמרות קרובות.")

        lines = ["📅 המשמרות הקרובות שלך:"]
        for m in missions:
            day = m.date.strftime("%d/%m/%Y")
            start = m.start_time.strftime("%H:%M")
            end = m.end_time.strftime("%H:%M")
            lines.append(f"• {m.name} — {day} {start}-{end}")

        return BotResponse(text="\n".join(lines))
