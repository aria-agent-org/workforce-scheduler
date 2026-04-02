"""Scheduled reports — auto-send daily/weekly reports via email/Telegram."""

import logging
from datetime import date, datetime, timedelta, timezone

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="tasks.send_scheduled_reports")
def send_scheduled_reports():
    """
    Check for scheduled reports and send them.
    Called by Celery Beat (daily at 07:00 and weekly on Sunday).
    """
    import asyncio
    asyncio.run(_send_reports())


async def _send_reports():
    """Async implementation of scheduled report sending."""
    from sqlalchemy import select
    from app.database import async_session_factory
    from app.models.tenant import Tenant

    logger.info("Starting scheduled reports run...")

    async with async_session_factory() as db:
        # Get all active tenants
        result = await db.execute(
            select(Tenant).where(Tenant.is_active.is_(True))
        )
        tenants = result.scalars().all()

        for tenant in tenants:
            try:
                await _generate_tenant_report(db, tenant)
            except Exception as e:
                logger.error(f"Failed to generate report for tenant {tenant.slug}: {e}")

    logger.info(f"Scheduled reports completed for {len(tenants)} tenants")


async def _generate_tenant_report(db, tenant):
    """Generate and send report for a single tenant."""
    from sqlalchemy import select, func
    from app.models.scheduling import Mission, MissionAssignment, ScheduleWindow
    from app.models.attendance import AttendanceSchedule
    from app.models.employee import Employee

    today = date.today()
    week_ago = today - timedelta(days=7)

    # Count stats
    # Active employees
    emp_result = await db.execute(
        select(func.count(Employee.id)).where(
            Employee.tenant_id == tenant.id,
            Employee.is_active.is_(True),
        )
    )
    total_employees = emp_result.scalar() or 0

    # Missions this week
    mission_result = await db.execute(
        select(func.count(Mission.id)).where(
            Mission.tenant_id == tenant.id,
            Mission.date >= week_ago,
            Mission.date <= today,
        )
    )
    total_missions = mission_result.scalar() or 0

    # Assignments this week
    assign_result = await db.execute(
        select(func.count(MissionAssignment.id)).where(
            MissionAssignment.mission_id.in_(
                select(Mission.id).where(
                    Mission.tenant_id == tenant.id,
                    Mission.date >= week_ago,
                    Mission.date <= today,
                )
            )
        )
    )
    total_assignments = assign_result.scalar() or 0

    # Coverage rate
    coverage_pct = round((total_assignments / max(total_missions, 1)) * 100, 1)

    # Build report text (Hebrew)
    report = f"""📊 דוח שבועי — {tenant.name}
📅 {week_ago.strftime('%d/%m')} — {today.strftime('%d/%m/%Y')}

👥 חיילים פעילים: {total_employees}
📋 משימות השבוע: {total_missions}
👤 שיבוצים: {total_assignments}
📈 כיסוי: {coverage_pct}%

{'✅ כיסוי טוב!' if coverage_pct >= 80 else '⚠️ כיסוי נמוך — נדרשת תשומת לב'}
"""

    logger.info(f"Report generated for {tenant.slug}: {total_missions} missions, {coverage_pct}% coverage")

    # Send via configured channels
    # Check if tenant has email/telegram configured for reports
    from app.routers.integration_settings import get_integration_value

    # Try Telegram
    telegram_token = await get_integration_value("telegram_bot_token", db)
    tenant_admin_chat_id = None  # TODO: add admin chat ID to tenant config

    if telegram_token and tenant_admin_chat_id:
        from app.services.channels.telegram_channel import send_telegram
        await send_telegram(tenant_admin_chat_id, report, db)

    # Try Email
    smtp_host = await get_integration_value("smtp_host", db)
    if smtp_host:
        # TODO: get tenant admin email and send
        pass

    return report
