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
    """Send a notification to specified employees. For push channel, sends real webpush."""
    from datetime import datetime

    from app.models.user import User
    from app.routers.push import send_push_to_user

    sent = 0
    now = datetime.utcnow()
    for emp_id in data.employee_ids:
        push_sent = 0
        if data.channel == "push" and data.body:
            # Find linked user and send real push
            user_result = await db.execute(
                select(User).where(User.employee_id == emp_id, User.is_active.is_(True))
            )
            linked_user = user_result.scalar_one_or_none()
            if linked_user:
                push_sent = await send_push_to_user(
                    db, linked_user.id,
                    title=data.event_type_code,
                    body=data.body,
                )

        log = NotificationLog(
            tenant_id=tenant.id,
            employee_id=emp_id,
            channel=data.channel,
            event_type_code=data.event_type_code,
            template_id=data.template_id,
            body_sent=data.body,
            language_sent="he",
            status="sent" if (data.channel != "push" or push_sent > 0) else "failed",
            sent_at=now,
        )
        db.add(log)
        if data.channel != "push" or push_sent > 0:
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
    """Send a broadcast push notification to targeted soldiers.

    Flow: employees → linked users → push_subscriptions → webpush().
    """
    import json
    import logging
    from datetime import datetime

    from app.models.push_subscription import PushSubscription
    from app.models.user import User
    from app.routers.push import VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_CLAIMS_EMAIL

    logger = logging.getLogger(__name__)

    from app.models.employee import EmployeeWorkRole
    from app.models.scheduling import ScheduleWindowEmployee

    # Determine target employees — always scoped to current tenant
    base_query = select(Employee).where(
        Employee.tenant_id == tenant.id,
        Employee.is_active.is_(True),
    )

    if data.target == "all":
        result = await db.execute(base_query)
        employees = result.scalars().all()
    elif data.target == "present":
        result = await db.execute(base_query.where(Employee.status == "present"))
        employees = result.scalars().all()
    elif data.target == "by_status":
        if not data.status_filter:
            raise HTTPException(status_code=400, detail="יש לבחור סטטוס לסינון")
        result = await db.execute(base_query.where(Employee.status == data.status_filter))
        employees = result.scalars().all()
    elif data.target == "by_work_role":
        if not data.work_role_id:
            raise HTTPException(status_code=400, detail="יש לבחור תפקיד עבודה")
        result = await db.execute(
            base_query.join(EmployeeWorkRole, Employee.id == EmployeeWorkRole.employee_id)
            .where(EmployeeWorkRole.work_role_id == data.work_role_id)
        )
        employees = result.scalars().all()
    elif data.target == "by_window":
        if not data.schedule_window_id:
            raise HTTPException(status_code=400, detail="יש לבחור לוח עבודה")
        result = await db.execute(
            base_query.join(ScheduleWindowEmployee, Employee.id == ScheduleWindowEmployee.employee_id)
            .where(ScheduleWindowEmployee.schedule_window_id == data.schedule_window_id)
        )
        employees = result.scalars().all()
    elif data.target == "custom":
        if not data.soldier_ids:
            raise HTTPException(status_code=400, detail="יש לבחור חיילים לשליחה")
        result = await db.execute(
            base_query.where(Employee.id.in_(data.soldier_ids))
        )
        employees = result.scalars().all()
    else:
        raise HTTPException(status_code=400, detail="סוג יעד לא תקין")

    body_text = f"{data.title}: {data.body}"
    now = datetime.utcnow()
    sent_push = 0
    failed_push = 0
    no_subscription = 0
    stale_subs_to_delete: list = []

    for emp in employees:
        # Step 1: Find the linked user for this employee
        user_result = await db.execute(
            select(User).where(User.employee_id == emp.id, User.is_active.is_(True))
        )
        linked_user = user_result.scalar_one_or_none()

        if not linked_user:
            # No linked user — log as failed (no user account)
            db.add(NotificationLog(
                tenant_id=tenant.id, employee_id=emp.id, channel="push",
                event_type_code="broadcast", body_sent=body_text,
                language_sent="he", status="failed", sent_at=now,
                error_message="no_linked_user",
            ))
            no_subscription += 1
            continue

        # Step 2: Find push subscriptions for this user
        subs_result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == linked_user.id)
        )
        subscriptions = subs_result.scalars().all()

        if not subscriptions:
            db.add(NotificationLog(
                tenant_id=tenant.id, employee_id=emp.id, channel="push",
                event_type_code="broadcast", body_sent=body_text,
                language_sent="he", status="failed", sent_at=now,
                error_message="no_push_subscription",
            ))
            no_subscription += 1
            continue

        # Step 3: Send webpush to each subscription
        emp_sent = False
        if VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY:
            from pywebpush import webpush, WebPushException

            payload = json.dumps({
                "title": data.title,
                "body": data.body,
                "url": "/dashboard",
            })

            for sub in subscriptions:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": sub.endpoint,
                            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                        },
                        data=payload,
                        vapid_private_key=VAPID_PRIVATE_KEY,
                        vapid_claims={"sub": f"mailto:{VAPID_CLAIMS_EMAIL}"},
                    )
                    emp_sent = True
                except Exception as e:
                    error_msg = str(e)
                    logger.warning(
                        f"Push failed for employee {emp.full_name} "
                        f"(user {linked_user.id}): {error_msg[:200]}"
                    )
                    # Remove stale subscriptions (410 Gone / 404)
                    if "410" in error_msg or "404" in error_msg:
                        stale_subs_to_delete.append(sub)
        else:
            logger.warning("VAPID keys not configured — cannot send push")

        # Step 4: Log result
        if emp_sent:
            db.add(NotificationLog(
                tenant_id=tenant.id, employee_id=emp.id, channel="push",
                event_type_code="broadcast", body_sent=body_text,
                language_sent="he", status="sent", sent_at=now,
            ))
            sent_push += 1
        else:
            db.add(NotificationLog(
                tenant_id=tenant.id, employee_id=emp.id, channel="push",
                event_type_code="broadcast", body_sent=body_text,
                language_sent="he", status="failed", sent_at=now,
                error_message="webpush_failed",
            ))
            failed_push += 1

    # Clean up stale subscriptions
    for stale_sub in stale_subs_to_delete:
        await db.delete(stale_sub)

    # Audit log — record who sent what to whom
    recipient_names = [emp.full_name for emp in employees]
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
            "status_filter": data.status_filter,
            "work_role_id": str(data.work_role_id) if data.work_role_id else None,
            "schedule_window_id": str(data.schedule_window_id) if data.schedule_window_id else None,
            "sent": sent_push,
            "failed": failed_push,
            "no_subscription": no_subscription,
            "total_recipients": len(employees),
            "recipient_names": recipient_names[:50],  # Limit to 50 for audit log size
        },
        ip_address=request.client.host if request.client else None,
    ))

    await db.commit()
    return {
        "sent": sent_push,
        "failed": failed_push,
        "no_subscription": no_subscription,
        "total_employees": len(employees),
        "target": data.target,
    }


@router.post("/bulk")
async def bulk_notification(
    data: dict,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send push notifications to a list of employee IDs."""
    import json
    import logging
    from datetime import datetime

    from app.models.push_subscription import PushSubscription
    from app.models.user import User
    from app.routers.push import VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_CLAIMS_EMAIL

    logger = logging.getLogger(__name__)
    employee_ids = data.get("employee_ids", [])
    event_type = data.get("event_type", "general")
    title = data.get("title", "שבצק — התראה")
    body = data.get("body", "יש לך התראה חדשה")

    if not employee_ids:
        raise HTTPException(status_code=400, detail="יש לבחור חיילים")

    result = await db.execute(
        select(Employee).where(
            Employee.tenant_id == tenant.id,
            Employee.id.in_(employee_ids),
            Employee.is_active.is_(True),
        )
    )
    employees = result.scalars().all()
    now = datetime.utcnow()
    sent = 0

    for emp in employees:
        user_result = await db.execute(
            select(User).where(User.employee_id == emp.id, User.is_active.is_(True))
        )
        linked_user = user_result.scalar_one_or_none()
        if not linked_user:
            continue

        subs_result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == linked_user.id)
        )
        subscriptions = subs_result.scalars().all()

        if VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY and subscriptions:
            from pywebpush import webpush

            payload = json.dumps({"title": title, "body": body, "url": "/dashboard"})
            for sub in subscriptions:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": sub.endpoint,
                            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                        },
                        data=payload,
                        vapid_private_key=VAPID_PRIVATE_KEY,
                        vapid_claims={"sub": f"mailto:{VAPID_CLAIMS_EMAIL}"},
                    )
                    sent += 1
                    break  # One successful delivery per employee is enough
                except Exception as e:
                    logger.warning(f"Push failed for {emp.full_name}: {str(e)[:100]}")

        db.add(NotificationLog(
            tenant_id=tenant.id, employee_id=emp.id, channel="push",
            event_type_code=event_type, body_sent=f"{title}: {body}",
            language_sent="he", status="sent" if sent else "queued", sent_at=now,
        ))

    await db.commit()
    return {"sent": sent, "total": len(employees)}
