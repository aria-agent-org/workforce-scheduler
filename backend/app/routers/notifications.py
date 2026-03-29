"""Notification endpoints."""

import uuid as _uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.notification import (
    NotificationLog, NotificationTemplate, EventTypeDefinition,
    NotificationChannelConfig,
)
from app.models.audit import AuditLog
from app.schemas.notification import (
    NotificationTemplateCreate, NotificationTemplateUpdate, NotificationTemplateResponse,
    NotificationLogResponse, EventTypeResponse, NotificationSend,
    BroadcastNotificationRequest, BroadcastNotificationResponse,
)
from app.models.employee import Employee

router = APIRouter()


# ═══════════════════════════════════════════
# Notification Templates
# ═══════════════════════════════════════════

@router.get("/templates")
async def list_templates(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(NotificationTemplate)
        .where(NotificationTemplate.tenant_id == tenant.id)
        .order_by(NotificationTemplate.name)
    )
    return [NotificationTemplateResponse.model_validate(t).model_dump() for t in result.scalars().all()]


@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    data: NotificationTemplateCreate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    tmpl = NotificationTemplate(tenant_id=tenant.id, **data.model_dump())
    db.add(tmpl)
    await db.flush()
    await db.refresh(tmpl)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="notification_template", entity_id=tmpl.id,
        after_state={"name": tmpl.name, "event_type_code": tmpl.event_type_code},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return NotificationTemplateResponse.model_validate(tmpl).model_dump()


@router.get("/templates/{tmpl_id}")
async def get_template(
    tmpl_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.id == tmpl_id, NotificationTemplate.tenant_id == tenant.id
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="תבנית התראה לא נמצאה")
    return NotificationTemplateResponse.model_validate(tmpl).model_dump()


@router.patch("/templates/{tmpl_id}")
async def update_template(
    tmpl_id: UUID, data: NotificationTemplateUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.id == tmpl_id, NotificationTemplate.tenant_id == tenant.id
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="תבנית התראה לא נמצאה")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tmpl, key, value)
    await db.flush()
    await db.refresh(tmpl)
    await db.commit()
    return NotificationTemplateResponse.model_validate(tmpl).model_dump()


@router.delete("/templates/{tmpl_id}", status_code=204)
async def delete_template(
    tmpl_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.id == tmpl_id, NotificationTemplate.tenant_id == tenant.id
        )
    )
    tmpl = result.scalar_one_or_none()
    if tmpl:
        tmpl.is_active = False
        await db.commit()


# ═══════════════════════════════════════════
# Event Types
# ═══════════════════════════════════════════

@router.get("/event-types")
async def list_event_types(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(EventTypeDefinition)
        .where(EventTypeDefinition.tenant_id == tenant.id)
        .order_by(EventTypeDefinition.code)
    )
    return [EventTypeResponse.model_validate(et).model_dump() for et in result.scalars().all()]


# ═══════════════════════════════════════════
# Notification Logs
# ═══════════════════════════════════════════

@router.get("/logs")
async def list_logs(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    page: int = 1, page_size: int = 50,
    channel: str | None = None, status_filter: str | None = None,
) -> dict:
    query = select(NotificationLog).where(NotificationLog.tenant_id == tenant.id)
    if channel:
        query = query.where(NotificationLog.channel == channel)
    if status_filter:
        query = query.where(NotificationLog.status == status_filter)

    count = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    query = query.order_by(NotificationLog.sent_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)

    return {
        "items": [NotificationLogResponse.model_validate(l).model_dump() for l in result.scalars().all()],
        "total": count,
        "page": page,
        "page_size": page_size,
    }


# ═══════════════════════════════════════════
# Send Notification (in-app)
# ═══════════════════════════════════════════

@router.post("/send")
async def send_notification(
    data: NotificationSend, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send an in-app notification to specified employees."""
    from datetime import datetime
    sent = 0
    for emp_id in data.employee_ids:
        log = NotificationLog(
            tenant_id=tenant.id,
            employee_id=emp_id,
            channel=data.channel,
            event_type_code=data.event_type_code,
            template_id=data.template_id,
            body_sent=data.body,
            language_sent="he",
            status="sent",
            sent_at=datetime.utcnow(),
        )
        db.add(log)
        sent += 1
    await db.commit()
    return {"sent": sent}


# ═══════════════════════════════════════════
# Channel Config
# ═══════════════════════════════════════════

@router.get("/channels")
async def list_channel_configs(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(NotificationChannelConfig)
        .where(NotificationChannelConfig.tenant_id == tenant.id)
    )
    return [
        {
            "id": str(c.id),
            "channel": c.channel,
            "is_enabled": c.is_enabled,
            "cost_per_message_usd": float(c.cost_per_message_usd) if c.cost_per_message_usd else None,
            "monthly_budget_usd": float(c.monthly_budget_usd) if c.monthly_budget_usd else None,
        }
        for c in result.scalars().all()
    ]


# ═══════════════════════════════════════════
# Broadcast Notification
# ═══════════════════════════════════════════

@router.post("/broadcast")
async def broadcast_notification(
    data: BroadcastNotificationRequest,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a broadcast push notification to targeted soldiers."""
    from datetime import datetime

    # Determine target employees
    if data.target == "all":
        result = await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.is_active.is_(True),
            )
        )
        employees = result.scalars().all()
    elif data.target == "present":
        result = await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.is_active.is_(True),
                Employee.status == "present",
            )
        )
        employees = result.scalars().all()
    elif data.target == "custom":
        if not data.soldier_ids:
            raise HTTPException(status_code=400, detail="יש לבחור חיילים לשליחה")
        result = await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.id.in_(data.soldier_ids),
                Employee.is_active.is_(True),
            )
        )
        employees = result.scalars().all()
    else:
        raise HTTPException(status_code=400, detail="סוג יעד לא תקין")

    body_text = f"{data.title}: {data.body}"
    sent = 0
    now = datetime.utcnow()

    for emp in employees:
        log = NotificationLog(
            tenant_id=tenant.id,
            employee_id=emp.id,
            channel="push",
            event_type_code="broadcast",
            body_sent=body_text,
            language_sent="he",
            status="sent",
            sent_at=now,
        )
        db.add(log)
        sent += 1

    # Audit log
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="broadcast_notification",
        entity_type="notification",
        entity_id=_uuid.uuid4(),
        after_state={
            "title": data.title,
            "body": data.body,
            "target": data.target,
            "sent_count": sent,
        },
        ip_address=request.client.host if request.client else None,
    ))

    await db.commit()
    return {"sent": sent, "target": data.target}
