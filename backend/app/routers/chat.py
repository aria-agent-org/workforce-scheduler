"""In-app chat router — direct messages and broadcast."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, desc, or_, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.chat import ChatMessage
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


class SendMessageRequest(BaseModel):
    recipient_id: str | None = None
    channel: str = "direct"
    mission_id: str | None = None
    body: str


@router.post("/chat/send")
async def send_message(
    body: SendMessageRequest,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Send a chat message (direct or broadcast)."""
    msg = ChatMessage(
        tenant_id=tenant.id,
        sender_id=user.id,
        recipient_id=UUID(body.recipient_id) if body.recipient_id else None,
        channel=body.channel,
        mission_id=UUID(body.mission_id) if body.mission_id else None,
        body=body.body,
    )
    db.add(msg)
    await db.commit()

    # Push via WebSocket
    try:
        from app.websockets.manager import manager as ws_manager
        event_data = {
            "type": "chat.message",
            "message_id": str(msg.id),
            "sender_id": str(user.id),
            "recipient_id": body.recipient_id,
            "channel": body.channel,
            "body": body.body,
            "timestamp": msg.created_at.isoformat(),
        }
        await ws_manager.broadcast_to_tenant(tenant.slug, "chat.message", event_data)
    except Exception:
        pass

    return {"id": str(msg.id), "timestamp": msg.created_at.isoformat()}


@router.get("/chat/messages")
async def get_messages(
    recipient_id: str | None = None,
    channel: str = "direct",
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get chat messages for the current user."""
    query = (
        select(ChatMessage)
        .where(ChatMessage.tenant_id == tenant.id)
    )

    if channel == "broadcast":
        query = query.where(ChatMessage.channel == "broadcast")
    elif recipient_id:
        # Direct messages: where user is sender or recipient
        other = UUID(recipient_id)
        query = query.where(
            ChatMessage.channel == "direct",
            or_(
                and_(ChatMessage.sender_id == user.id, ChatMessage.recipient_id == other),
                and_(ChatMessage.sender_id == other, ChatMessage.recipient_id == user.id),
            ),
        )
    else:
        # All messages for this user
        query = query.where(
            or_(
                ChatMessage.sender_id == user.id,
                ChatMessage.recipient_id == user.id,
                ChatMessage.recipient_id.is_(None),
            )
        )

    query = query.order_by(desc(ChatMessage.created_at)).limit(limit)
    result = await db.execute(query)
    messages = result.scalars().all()

    return {
        "items": [
            {
                "id": str(m.id),
                "sender_id": str(m.sender_id),
                "recipient_id": str(m.recipient_id) if m.recipient_id else None,
                "channel": m.channel,
                "body": m.body,
                "read_at": m.read_at.isoformat() if m.read_at else None,
                "created_at": m.created_at.isoformat(),
                "is_mine": m.sender_id == user.id,
            }
            for m in reversed(messages)  # oldest first for display
        ],
        "total": len(messages),
    }


@router.post("/chat/read/{message_id}")
async def mark_read(
    message_id: str,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Mark a message as read."""
    result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == UUID(message_id),
            ChatMessage.tenant_id == tenant.id,
            ChatMessage.recipient_id == user.id,
        )
    )
    msg = result.scalar_one_or_none()
    if msg and not msg.read_at:
        msg.read_at = datetime.now(timezone.utc)
        await db.commit()
    return {"status": "ok"}


@router.get("/chat/unread-count")
async def unread_count(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get count of unread messages."""
    result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.tenant_id == tenant.id,
            ChatMessage.recipient_id == user.id,
            ChatMessage.read_at.is_(None),
        )
    )
    count = result.scalar() or 0
    return {"unread": count}
