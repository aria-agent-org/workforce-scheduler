"""Web Push notification endpoints."""

import json
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.push_subscription import PushSubscription

router = APIRouter()

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "admin@shavtzak.site")


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: dict  # {p256dh: str, auth: str}


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


class PushTestRequest(BaseModel):
    title: str = "שבצק — בדיקת התראה"
    body: str = "אם אתה רואה הודעה זו, התראות Push עובדות! 🎉"


@router.get("/vapid-public-key")
async def get_vapid_public_key() -> dict:
    """Return VAPID public key for frontend push subscription."""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=503,
            detail="VAPID keys not configured on server"
        )
    return {"public_key": VAPID_PUBLIC_KEY}


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe_push(
    data: PushSubscribeRequest,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Save a push subscription for the current user."""
    # Check if subscription already exists (by endpoint)
    existing = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    )
    sub = existing.scalar_one_or_none()

    if sub:
        # Update existing subscription (might be different user or refreshed keys)
        sub.user_id = user.id
        sub.p256dh = data.keys.get("p256dh", "")
        sub.auth = data.keys.get("auth", "")
        sub.user_agent = request.headers.get("user-agent")
    else:
        sub = PushSubscription(
            user_id=user.id,
            endpoint=data.endpoint,
            p256dh=data.keys.get("p256dh", ""),
            auth=data.keys.get("auth", ""),
            user_agent=request.headers.get("user-agent"),
        )
        db.add(sub)

    await db.commit()
    return {"status": "subscribed", "endpoint": data.endpoint[:50] + "..."}


@router.post("/unsubscribe")
async def unsubscribe_push(
    data: PushUnsubscribeRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a push subscription."""
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == data.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()
    return {"status": "unsubscribed"}


@router.post("/test")
async def send_test_push(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a test push notification to the current user."""
    data = PushTestRequest()

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user.id)
    )
    subscriptions = result.scalars().all()

    if not subscriptions:
        raise HTTPException(
            status_code=404,
            detail="אין מנויי Push רשומים. יש להפעיל התראות קודם."
        )

    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=503,
            detail="VAPID keys not configured on server"
        )

    sent = 0
    failed = 0
    errors = []

    for sub in subscriptions:
        try:
            from pywebpush import webpush, WebPushException

            payload = json.dumps({
                "title": data.title,
                "body": data.body,
                "url": "/dashboard",
            })

            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth,
                    },
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{VAPID_CLAIMS_EMAIL}"},
            )
            sent += 1
        except Exception as e:
            failed += 1
            error_msg = str(e)
            errors.append(error_msg[:200])
            # If subscription is invalid (410 Gone), remove it
            if "410" in error_msg or "404" in error_msg:
                await db.delete(sub)

    if failed > 0:
        await db.commit()

    return {
        "sent": sent,
        "failed": failed,
        "total_subscriptions": len(subscriptions),
        "errors": errors[:3] if errors else [],
    }


async def send_push_to_user(
    db: AsyncSession, user_id: UUID, title: str, body: str, url: str = "/",
) -> int:
    """Utility: send push notification to all subscriptions of a user. Returns sent count."""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return 0

    result = await db.execute(
        select(PushSubscription).where(PushSubscription.user_id == user_id)
    )
    subscriptions = result.scalars().all()
    sent = 0

    for sub in subscriptions:
        try:
            from pywebpush import webpush

            payload = json.dumps({"title": title, "body": body, "url": url})
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
        except Exception:
            pass

    return sent
