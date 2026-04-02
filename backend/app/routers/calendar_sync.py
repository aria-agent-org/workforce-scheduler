"""Calendar sync router — ICS export and Google Calendar integration."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.scheduling import Mission, MissionAssignment
from app.models.employee import Employee
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["calendar"])


@router.get("/calendar/export.ics")
async def export_ics(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Export user's schedule as iCalendar (.ics) file."""
    employee_id = user.employee_id
    if not employee_id:
        raise HTTPException(status_code=400, detail="No employee profile linked")

    # Get all assignments
    result = await db.execute(
        select(Mission, MissionAssignment)
        .join(MissionAssignment, MissionAssignment.mission_id == Mission.id)
        .where(
            Mission.tenant_id == tenant.id,
            MissionAssignment.employee_id == employee_id,
        )
        .order_by(Mission.date)
    )
    assignments = result.all()

    # Build ICS
    cal_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Shavtzak//Workforce Scheduler//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{tenant.name} — משמרות",
    ]

    for mission, assignment in assignments:
        uid = f"{mission.id}@shavtzak.site"
        dtstart = mission.date.strftime("%Y%m%d")
        summary = mission.name or "משימה"

        # Build time strings
        if mission.start_time:
            start_dt = f"{dtstart}T{mission.start_time.strftime('%H%M%S')}"
        else:
            start_dt = dtstart

        if mission.end_time:
            end_dt = f"{dtstart}T{mission.end_time.strftime('%H%M%S')}"
        else:
            end_dt = start_dt

        cal_lines.extend([
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTART:{start_dt}",
            f"DTEND:{end_dt}",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:שבצק — {tenant.name}",
            "STATUS:CONFIRMED",
            "END:VEVENT",
        ])

    cal_lines.append("END:VCALENDAR")
    ics_content = "\r\n".join(cal_lines)

    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="shavtzak-schedule.ics"',
        },
    )


@router.get("/calendar/feed-url")
async def get_feed_url(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
):
    """Get the ICS feed URL for subscribing in Google/Outlook Calendar."""
    # Generate a token-based URL for calendar subscription
    import hashlib
    feed_token = hashlib.sha256(f"{user.id}-{tenant.id}-calendar".encode()).hexdigest()[:32]
    feed_url = f"https://shavtzak.site/api/v1/{tenant.slug}/calendar/export.ics?token={feed_token}"

    return {
        "feed_url": feed_url,
        "instructions": {
            "google": f"Google Calendar → הגדרות → הוסף לוח שנה → מ-URL → {feed_url}",
            "outlook": f"Outlook → לוח שנה → הוסף → מהאינטרנט → {feed_url}",
            "apple": f"Settings → Calendar → Accounts → Add → Subscribed Calendar → {feed_url}",
        },
    }
