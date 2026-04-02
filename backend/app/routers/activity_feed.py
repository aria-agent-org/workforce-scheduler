"""Activity feed router — real-time events for dashboard."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.audit import AuditLog
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["activity-feed"])


@router.get("/activity-feed")
async def get_activity_feed(
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(50, ge=1, le=200),
    event_type: str | None = None,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Get recent activity feed for the tenant dashboard.

    Returns audit log entries formatted as activity feed items.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    query = (
        select(AuditLog)
        .where(
            AuditLog.tenant_id == tenant.id,
            AuditLog.created_at >= since,
        )
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
    )

    if event_type:
        query = query.where(AuditLog.action == event_type)

    result = await db.execute(query)
    entries = result.scalars().all()

    # Format as activity feed items
    items = []
    for entry in entries:
        items.append({
            "id": str(entry.id),
            "action": entry.action,
            "description": _format_action(entry),
            "icon": _get_action_icon(entry.action),
            "user_id": str(entry.user_id) if entry.user_id else None,
            "user_name": entry.details.get("user_name", "") if entry.details else "",
            "entity_type": entry.entity_type,
            "entity_id": str(entry.entity_id) if entry.entity_id else None,
            "timestamp": entry.created_at.isoformat() if entry.created_at else None,
            "metadata": entry.details or {},
        })

    # Also get summary stats
    stats_query = (
        select(
            AuditLog.action,
            func.count(AuditLog.id).label("count"),
        )
        .where(
            AuditLog.tenant_id == tenant.id,
            AuditLog.created_at >= since,
        )
        .group_by(AuditLog.action)
    )
    stats_result = await db.execute(stats_query)
    stats = {row.action: row.count for row in stats_result}

    return {
        "items": items,
        "total": len(items),
        "since": since.isoformat(),
        "stats": stats,
    }


def _format_action(entry: AuditLog) -> str:
    """Format audit log entry as human-readable Hebrew description."""
    action_map = {
        "mission.created": "משימה חדשה נוצרה",
        "mission.updated": "משימה עודכנה",
        "mission.deleted": "משימה נמחקה",
        "mission.assigned": "חייל שובץ למשימה",
        "mission.unassigned": "חייל הוסר ממשימה",
        "swap.requested": "בקשת החלפה חדשה",
        "swap.approved": "בקשת החלפה אושרה",
        "swap.rejected": "בקשת החלפה נדחתה",
        "attendance.recorded": "נוכחות דווחה",
        "attendance.updated": "נוכחות עודכנה",
        "employee.created": "חייל חדש נוסף",
        "employee.updated": "פרטי חייל עודכנו",
        "employee.deleted": "חייל הוסר",
        "user.login": "כניסה למערכת",
        "user.created": "משתמש חדש נוצר",
        "rule.created": "כלל חדש נוצר",
        "rule.updated": "כלל עודכן",
        "window.created": "חלון שיבוץ חדש",
        "window.activated": "חלון שיבוץ הופעל",
        "window.published": "שיבוץ פורסם",
        "notification.sent": "התראה נשלחה",
        "settings.updated": "הגדרות עודכנו",
    }

    details = getattr(entry, "details", None) or getattr(entry, "after_state", None) or {}
    base = action_map.get(entry.action, entry.action)

    # Add context from details
    name = details.get("name") or details.get("employee_name") or details.get("mission_name", "")
    if name:
        base = f"{base}: {name}"

    return base


def _get_action_icon(action: str) -> str:
    """Get emoji icon for action type."""
    icons = {
        "mission.created": "📋",
        "mission.updated": "✏️",
        "mission.deleted": "🗑️",
        "mission.assigned": "👤",
        "mission.unassigned": "🔄",
        "swap.requested": "🔄",
        "swap.approved": "✅",
        "swap.rejected": "❌",
        "attendance.recorded": "📍",
        "attendance.updated": "📍",
        "employee.created": "👤",
        "employee.updated": "✏️",
        "employee.deleted": "🗑️",
        "user.login": "🔑",
        "user.created": "👤",
        "rule.created": "📏",
        "rule.updated": "📏",
        "window.created": "📅",
        "window.activated": "▶️",
        "window.published": "📢",
        "notification.sent": "🔔",
        "settings.updated": "⚙️",
    }
    return icons.get(action, "📌")
