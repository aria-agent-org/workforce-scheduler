"""Notification endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.notification import NotificationLog, NotificationTemplate

router = APIRouter()


@router.get("/templates")
async def list_notification_templates(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List notification templates."""
    result = await db.execute(
        select(NotificationTemplate)
        .where(NotificationTemplate.tenant_id == tenant.id)
        .order_by(NotificationTemplate.name)
    )
    templates = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "event_type_code": t.event_type_code,
            "is_active": t.is_active,
        }
        for t in templates
    ]


@router.get("/logs")
async def list_notification_logs(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 50,
) -> list[dict]:
    """List notification logs."""
    result = await db.execute(
        select(NotificationLog)
        .where(NotificationLog.tenant_id == tenant.id)
        .order_by(NotificationLog.sent_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "employee_id": str(l.employee_id),
            "channel": l.channel,
            "event_type_code": l.event_type_code,
            "status": l.status,
            "sent_at": str(l.sent_at) if l.sent_at else None,
        }
        for l in logs
    ]
