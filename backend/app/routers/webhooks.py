"""Webhook routers for WhatsApp and Telegram bot integrations."""

import hashlib
import hmac
import logging
import os
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.bots.ai_bot import AIBot
from app.services.bots.bot_engine import BotEngine, BotResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# ═══════════════════════════════════════════════════════════════════
# WhatsApp — Meta Cloud API
# ═══════════════════════════════════════════════════════════════════

WHATSAPP_VERIFY_TOKEN_ENV = "WHATSAPP_VERIFY_TOKEN"
WHATSAPP_ACCESS_TOKEN_ENV = "WHATSAPP_ACCESS_TOKEN"
WHATSAPP_PHONE_NUMBER_ID_ENV = "WHATSAPP_PHONE_NUMBER_ID"
WHATSAPP_API_BASE = "https://graph.facebook.com/v18.0"


@router.get("/whatsapp")
async def whatsapp_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
) -> Response:
    """WhatsApp webhook verification challenge (GET)."""
    verify_token = os.environ.get(WHATSAPP_VERIFY_TOKEN_ENV, "")
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        logger.info("WhatsApp webhook verified successfully")
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/whatsapp")
async def whatsapp_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Receive WhatsApp messages (Meta Cloud API format).

    Expected payload:
    {
      "object": "whatsapp_business_account",
      "entry": [{
        "changes": [{
          "value": {
            "metadata": {"phone_number_id": "..."},
            "messages": [{
              "from": "972521234567",
              "type": "text",
              "text": {"body": "שלום"},
              "timestamp": "..."
            }]
          }
        }]
      }]
    }
    """
    body = await request.json()

    if body.get("object") != "whatsapp_business_account":
        return {"status": "ignored"}

    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            messages = value.get("messages", [])
            metadata = value.get("metadata", {})
            phone_number_id = metadata.get("phone_number_id", "")

            for msg in messages:
                sender = msg.get("from", "")
                msg_type = msg.get("type", "")

                # Only handle text messages for now
                if msg_type != "text":
                    continue

                text = msg.get("text", {}).get("body", "")
                if not text:
                    continue

                # Resolve tenant from phone_number_id (mapping stored in env/config)
                tenant_id = _resolve_tenant_for_whatsapp(phone_number_id)
                if tenant_id is None:
                    logger.warning("No tenant mapped for WhatsApp phone_number_id: %s", phone_number_id)
                    continue

                # Process through bot engine
                engine = BotEngine(db)
                response = await engine.process_message(tenant_id, "whatsapp", sender, text)

                # Delegate to AI if needed
                if response.metadata.get("delegate_to_ai"):
                    ai_bot = AIBot(db)
                    employee_id = UUID(response.metadata["employee_id"])
                    ai_reply = await ai_bot.chat(tenant_id, employee_id, text)
                    response = BotResponse(text=ai_reply)

                # Send reply
                await _send_whatsapp_message(phone_number_id, sender, response)

    return {"status": "ok"}


async def _send_whatsapp_message(
    phone_number_id: str,
    to: str,
    response: BotResponse,
) -> None:
    """Send a message back via WhatsApp Cloud API."""
    access_token = os.environ.get(WHATSAPP_ACCESS_TOKEN_ENV, "")
    if not access_token:
        logger.warning("WHATSAPP_ACCESS_TOKEN not set — cannot send reply")
        return

    url = f"{WHATSAPP_API_BASE}/{phone_number_id}/messages"

    # Build payload
    payload: dict = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": response.text},
    }

    # If we have buttons (max 3 for WhatsApp interactive)
    if response.buttons and len(response.buttons) <= 3:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": response.text},
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {
                                "id": btn.get("code", str(idx)),
                                "title": btn.get("label", "")[:20],  # WhatsApp 20-char limit
                            },
                        }
                        for idx, btn in enumerate(response.buttons[:3])
                    ]
                },
            },
        }
    elif response.buttons and len(response.buttons) > 3:
        # Use list message for more than 3 options
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "body": {"text": response.text},
                "action": {
                    "button": "בחר אפשרות",
                    "sections": [
                        {
                            "title": "אפשרויות",
                            "rows": [
                                {
                                    "id": btn.get("code", str(idx)),
                                    "title": btn.get("label", "")[:24],  # WhatsApp 24-char limit
                                }
                                for idx, btn in enumerate(response.buttons[:10])
                            ],
                        }
                    ],
                },
            },
        }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                logger.error("WhatsApp send error: %s %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("Failed to send WhatsApp message")


def _resolve_tenant_for_whatsapp(phone_number_id: str) -> UUID | None:
    """
    Resolve tenant_id from WhatsApp phone_number_id.

    Uses env var WHATSAPP_TENANT_MAP: "phone_id1:tenant_uuid1,phone_id2:tenant_uuid2"
    """
    mapping = os.environ.get("WHATSAPP_TENANT_MAP", "")
    for pair in mapping.split(","):
        pair = pair.strip()
        if ":" in pair:
            pid, tid = pair.split(":", 1)
            if pid.strip() == phone_number_id:
                try:
                    return UUID(tid.strip())
                except ValueError:
                    return None
    return None


# ═══════════════════════════════════════════════════════════════════
# Telegram — Bot API (Update format)
# ═══════════════════════════════════════════════════════════════════

TELEGRAM_BOT_TOKEN_ENV = "TELEGRAM_BOT_TOKEN"
TELEGRAM_API_BASE = "https://api.telegram.org"


@router.post("/telegram")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Receive Telegram updates (Update format).

    Expected payload:
    {
      "update_id": 123,
      "message": {
        "message_id": 456,
        "from": {"id": 789, "first_name": "User"},
        "chat": {"id": 789, "type": "private"},
        "text": "/start"
      }
    }
    """
    body = await request.json()
    message = body.get("message")

    if not message:
        # Could be callback_query, edited_message, etc.
        callback = body.get("callback_query")
        if callback:
            return await _handle_telegram_callback(callback, db)
        return {"status": "ignored"}

    chat_id = str(message.get("chat", {}).get("id", ""))
    text = message.get("text", "")
    sender_id = str(message.get("from", {}).get("id", ""))

    if not text or not chat_id:
        return {"status": "ignored"}

    # Resolve tenant from bot token / chat mapping
    tenant_id = _resolve_tenant_for_telegram()
    if tenant_id is None:
        logger.warning("No tenant mapped for Telegram bot")
        return {"status": "no_tenant"}

    # Process through bot engine
    engine = BotEngine(db)
    response = await engine.process_message(tenant_id, "telegram", sender_id, text)

    # Delegate to AI if needed
    if response.metadata.get("delegate_to_ai"):
        ai_bot = AIBot(db)
        employee_id = UUID(response.metadata["employee_id"])
        ai_reply = await ai_bot.chat(tenant_id, employee_id, text)
        response = BotResponse(text=ai_reply)

    # Send reply
    await _send_telegram_message(chat_id, response)

    return {"status": "ok"}


async def _handle_telegram_callback(callback: dict, db: AsyncSession) -> dict:
    """Handle Telegram inline button callbacks."""
    chat_id = str(callback.get("message", {}).get("chat", {}).get("id", ""))
    data = callback.get("data", "")
    sender_id = str(callback.get("from", {}).get("id", ""))

    if not chat_id or not data:
        return {"status": "ignored"}

    tenant_id = _resolve_tenant_for_telegram()
    if tenant_id is None:
        return {"status": "no_tenant"}

    engine = BotEngine(db)
    response = await engine.process_message(tenant_id, "telegram", sender_id, data)

    await _send_telegram_message(chat_id, response)

    # Answer callback query to remove loading state
    bot_token = os.environ.get(TELEGRAM_BOT_TOKEN_ENV, "")
    if bot_token:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{TELEGRAM_API_BASE}/bot{bot_token}/answerCallbackQuery",
                    json={"callback_query_id": callback.get("id")},
                )
        except Exception:
            pass

    return {"status": "ok"}


async def _send_telegram_message(chat_id: str, response: BotResponse) -> None:
    """Send a message back via Telegram Bot API."""
    bot_token = os.environ.get(TELEGRAM_BOT_TOKEN_ENV, "")
    if not bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — cannot send reply")
        return

    url = f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage"

    payload: dict = {
        "chat_id": chat_id,
        "text": response.text,
        "parse_mode": "HTML",
    }

    # Add inline keyboard if we have buttons
    if response.buttons:
        keyboard = []
        for btn in response.buttons:
            keyboard.append([{
                "text": btn.get("label", ""),
                "callback_data": btn.get("code", ""),
            }])
        payload["reply_markup"] = {"inline_keyboard": keyboard}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code >= 400:
                logger.error("Telegram send error: %s %s", resp.status_code, resp.text)
    except Exception:
        logger.exception("Failed to send Telegram message")


def _resolve_tenant_for_telegram() -> UUID | None:
    """
    Resolve tenant_id for Telegram bot.

    Uses env var TELEGRAM_TENANT_ID.
    """
    tid = os.environ.get("TELEGRAM_TENANT_ID", "")
    if tid:
        try:
            return UUID(tid)
        except ValueError:
            return None
    return None
