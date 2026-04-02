"""Outgoing webhooks router — manage and trigger webhooks."""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.outgoing_webhook import OutgoingWebhook, WebhookDelivery
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["outgoing-webhooks"])

AVAILABLE_EVENTS = [
    "mission.created", "mission.updated", "mission.deleted",
    "mission.assigned", "mission.unassigned",
    "swap.requested", "swap.approved", "swap.rejected",
    "attendance.recorded",
    "employee.created", "employee.updated",
    "checkin.recorded",
]


class WebhookCreate(BaseModel):
    name: str
    url: str
    secret: str | None = None
    events: list[str]


class WebhookUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    events: list[str] | None = None
    is_active: bool | None = None


@router.get("/outgoing-webhooks")
async def list_webhooks(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List outgoing webhooks for this tenant."""
    result = await db.execute(
        select(OutgoingWebhook)
        .where(OutgoingWebhook.tenant_id == tenant.id)
        .order_by(OutgoingWebhook.created_at)
    )
    webhooks = result.scalars().all()

    return {
        "items": [
            {
                "id": str(w.id),
                "name": w.name,
                "url": w.url,
                "events": w.events,
                "is_active": w.is_active,
                "failure_count": w.failure_count,
                "last_triggered_at": w.last_triggered_at.isoformat() if w.last_triggered_at else None,
            }
            for w in webhooks
        ],
        "available_events": AVAILABLE_EVENTS,
    }


@router.post("/outgoing-webhooks")
async def create_webhook(
    body: WebhookCreate,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create an outgoing webhook."""
    webhook = OutgoingWebhook(
        tenant_id=tenant.id,
        name=body.name,
        url=body.url,
        secret=body.secret,
        events=body.events,
    )
    db.add(webhook)
    await db.commit()
    return {"id": str(webhook.id), "message": "Webhook created"}


@router.put("/outgoing-webhooks/{webhook_id}")
async def update_webhook(
    webhook_id: str,
    body: WebhookUpdate,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Update an outgoing webhook."""
    result = await db.execute(
        select(OutgoingWebhook).where(
            OutgoingWebhook.id == UUID(webhook_id),
            OutgoingWebhook.tenant_id == tenant.id,
        )
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if body.name is not None:
        webhook.name = body.name
    if body.url is not None:
        webhook.url = body.url
    if body.events is not None:
        webhook.events = body.events
    if body.is_active is not None:
        webhook.is_active = body.is_active

    await db.commit()
    return {"message": "Webhook updated"}


@router.delete("/outgoing-webhooks/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Delete an outgoing webhook."""
    result = await db.execute(
        select(OutgoingWebhook).where(
            OutgoingWebhook.id == UUID(webhook_id),
            OutgoingWebhook.tenant_id == tenant.id,
        )
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    await db.delete(webhook)
    await db.commit()
    return {"message": "Webhook deleted"}


@router.get("/outgoing-webhooks/{webhook_id}/deliveries")
async def list_deliveries(
    webhook_id: str,
    limit: int = Query(20, ge=1, le=100),
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List recent delivery attempts for a webhook."""
    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == UUID(webhook_id))
        .order_by(desc(WebhookDelivery.created_at))
        .limit(limit)
    )
    deliveries = result.scalars().all()

    return {
        "items": [
            {
                "id": str(d.id),
                "event_type": d.event_type,
                "status_code": d.status_code,
                "success": d.success,
                "attempt": d.attempt,
                "created_at": d.created_at.isoformat(),
            }
            for d in deliveries
        ]
    }


@router.post("/outgoing-webhooks/{webhook_id}/test")
async def test_webhook(
    webhook_id: str,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Send a test event to the webhook."""
    result = await db.execute(
        select(OutgoingWebhook).where(
            OutgoingWebhook.id == UUID(webhook_id),
            OutgoingWebhook.tenant_id == tenant.id,
        )
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    test_payload = {
        "event": "test",
        "tenant_id": str(tenant.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {"message": "Test webhook from Shavtzak"},
    }

    success, status_code, response_body = await _deliver_webhook(webhook, "test", test_payload)

    return {
        "success": success,
        "status_code": status_code,
        "message": "✅ Webhook works!" if success else f"❌ Failed: {status_code}",
    }


# --- Dispatcher (called from event handlers) ---

async def dispatch_webhook_event(db: AsyncSession, tenant_id: UUID, event_type: str, data: dict):
    """Dispatch an event to all matching webhooks for a tenant."""
    result = await db.execute(
        select(OutgoingWebhook).where(
            OutgoingWebhook.tenant_id == tenant_id,
            OutgoingWebhook.is_active.is_(True),
        )
    )
    webhooks = result.scalars().all()

    for webhook in webhooks:
        if event_type in (webhook.events or []):
            payload = {
                "event": event_type,
                "tenant_id": str(tenant_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": data,
            }
            success, status_code, body = await _deliver_webhook(webhook, event_type, payload)

            # Log delivery
            delivery = WebhookDelivery(
                webhook_id=webhook.id,
                event_type=event_type,
                payload=payload,
                status_code=status_code,
                response_body=body[:500] if body else None,
                success=success,
            )
            db.add(delivery)

            # Update webhook state
            webhook.last_triggered_at = datetime.now(timezone.utc)
            if not success:
                webhook.failure_count = (webhook.failure_count or 0) + 1
            else:
                webhook.failure_count = 0

    await db.commit()


async def _deliver_webhook(webhook, event_type: str, payload: dict) -> tuple[bool, int, str]:
    """Deliver a webhook with optional HMAC signature."""
    headers = {"Content-Type": "application/json"}

    if webhook.secret:
        body_bytes = json.dumps(payload).encode()
        signature = hmac.new(webhook.secret.encode(), body_bytes, hashlib.sha256).hexdigest()
        headers["X-Webhook-Signature"] = f"sha256={signature}"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook.url, json=payload, headers=headers)
            return resp.status_code < 400, resp.status_code, resp.text[:500]
    except Exception as e:
        return False, 0, str(e)[:500]
