"""AI Bot — Claude/OpenRouter integration for natural-language conversations."""

import logging
import os
from datetime import date
from decimal import Decimal
from uuid import UUID

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bot import AIUsageConfig, AIUsageLog, BotConfig
from app.models.employee import Employee

logger = logging.getLogger(__name__)

# Defaults
DEFAULT_AI_MODEL = "claude-sonnet-4-20250514"
DEFAULT_SYSTEM_PROMPT = (
    "אתה עוזר חכם של מערכת שבצק — מערכת ניהול כוח אדם ומשמרות. "
    "ענה בעברית בצורה קצרה וברורה. "
    "אם נשאלת שאלה שאינה קשורה לעבודה, הסבר בנימוס שאתה יכול לעזור רק בנושאי עבודה ומשמרות."
)

# Environment variables
AI_API_KEY_ENV = "AI_API_KEY"
AI_BASE_URL_ENV = "AI_BASE_URL"
AI_MODEL_ENV = "AI_MODEL"

# Default base URL (OpenRouter)
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"


class AIBot:
    """AI-powered conversational bot backed by Claude or OpenRouter."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.api_key = os.environ.get(AI_API_KEY_ENV, "")
        self.base_url = os.environ.get(AI_BASE_URL_ENV, DEFAULT_BASE_URL)
        self.model = os.environ.get(AI_MODEL_ENV, DEFAULT_AI_MODEL)

    async def chat(
        self,
        tenant_id: UUID,
        employee_id: UUID,
        message: str,
        conversation_history: list[dict] | None = None,
    ) -> str:
        """Send a message to the AI and return the response text."""
        if not self.api_key:
            logger.warning("AI_API_KEY not set — AI bot disabled")
            return "🤖 שירות ה-AI אינו מוגדר כרגע. פנה למנהל."

        # Check usage limits
        can_proceed = await self.check_limits(tenant_id)
        if not can_proceed:
            return "⚠️ הגעת למגבלת השימוש ב-AI. פנה למנהל לשדרוג."

        # Build system prompt
        system_prompt = await self._build_system_prompt(tenant_id, employee_id)

        # Build messages array
        messages: list[dict] = []
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": message})

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            *messages,
                        ],
                        "max_tokens": 1024,
                        "temperature": 0.7,
                    },
                )
                response.raise_for_status()
                data = response.json()

            # Extract reply
            reply = data["choices"][0]["message"]["content"]

            # Track usage
            tokens_used = data.get("usage", {}).get("total_tokens", 0)
            await self._log_usage(tenant_id, employee_id, tokens_used)

            return reply

        except httpx.HTTPStatusError as exc:
            logger.error("AI API HTTP error: %s %s", exc.response.status_code, exc.response.text)
            return "🤖 אירעה שגיאה בשירות ה-AI. אנא נסה שוב."
        except Exception:
            logger.exception("AI API unexpected error")
            return "🤖 אירעה שגיאה בשירות ה-AI. אנא נסה שוב."

    async def check_limits(self, tenant_id: UUID) -> bool:
        """Check if the tenant is within AI usage limits. Returns True if OK."""
        result = await self.db.execute(
            select(AIUsageConfig).where(AIUsageConfig.tenant_id == tenant_id)
        )
        config = result.scalar_one_or_none()

        # No config = no limits = allow
        if config is None or not config.is_enabled:
            return True

        today = date.today()

        # Daily limit
        if config.limit_daily_messages is not None:
            daily_count = await self._count_messages(tenant_id, day=today)
            if daily_count >= config.limit_daily_messages:
                if config.on_limit_reached == "block":
                    return False

        # Monthly limit
        if config.limit_monthly_messages is not None:
            monthly_count = await self._count_messages(
                tenant_id,
                month_start=today.replace(day=config.reset_day_of_month)
                if today.day >= config.reset_day_of_month
                else today.replace(day=config.reset_day_of_month, month=today.month - 1 if today.month > 1 else 12),
            )
            if monthly_count >= config.limit_monthly_messages:
                if config.on_limit_reached == "block":
                    return False

        # Total limit
        if config.limit_total_messages is not None:
            total_count = await self._count_messages(tenant_id)
            if total_count >= config.limit_total_messages:
                if config.on_limit_reached == "block":
                    return False

        return True

    # ── Private helpers ─────────────────────────────────────────────

    async def _build_system_prompt(self, tenant_id: UUID, employee_id: UUID) -> str:
        """Build the system prompt from bot config + employee context."""
        # Load bot config AI prompt
        result = await self.db.execute(
            select(BotConfig).where(
                BotConfig.tenant_id == tenant_id,
                BotConfig.ai_mode_enabled.is_(True),
            )
        )
        config = result.scalar_one_or_none()
        base_prompt = (config.ai_system_prompt if config and config.ai_system_prompt else DEFAULT_SYSTEM_PROMPT)

        # Add employee context
        emp_result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = emp_result.scalar_one_or_none()

        context_parts = [base_prompt]
        if employee:
            context_parts.append(
                f"\nפרטי העובד: שם: {employee.full_name}, "
                f"מספר עובד: {employee.employee_number}, "
                f"סטטוס: {employee.status}."
            )

        context_parts.append(f"\nתאריך היום: {date.today().isoformat()}")

        return "\n".join(context_parts)

    async def _log_usage(
        self,
        tenant_id: UUID,
        employee_id: UUID,
        tokens_used: int,
    ) -> None:
        """Log AI usage for the day — upsert into AIUsageLog."""
        today = date.today()
        result = await self.db.execute(
            select(AIUsageLog).where(
                AIUsageLog.tenant_id == tenant_id,
                AIUsageLog.employee_id == employee_id,
                AIUsageLog.date == today,
            )
        )
        log = result.scalar_one_or_none()

        if log:
            log.messages_count += 1
            log.tokens_used += tokens_used
        else:
            log = AIUsageLog(
                tenant_id=tenant_id,
                employee_id=employee_id,
                date=today,
                messages_count=1,
                tokens_used=tokens_used,
                cost_usd=Decimal("0"),
            )
        self.db.add(log)

    async def _count_messages(
        self,
        tenant_id: UUID,
        day: date | None = None,
        month_start: date | None = None,
    ) -> int:
        """Count total AI messages for a tenant, optionally filtered by date range."""
        query = select(func.coalesce(func.sum(AIUsageLog.messages_count), 0)).where(
            AIUsageLog.tenant_id == tenant_id,
        )
        if day is not None:
            query = query.where(AIUsageLog.date == day)
        elif month_start is not None:
            query = query.where(AIUsageLog.date >= month_start)

        result = await self.db.execute(query)
        return int(result.scalar_one())
