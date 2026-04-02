"""Email notification channel via SMTP — reads config from DB first, env fallback."""

import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def _get_smtp_config(db: AsyncSession | None = None) -> dict:
    """Get SMTP config from DB or env."""
    config = {"host": "", "port": 587, "user": "", "password": "", "sender": ""}

    if db:
        try:
            from app.models.integration_config import IntegrationConfig
            keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_sender_email"]
            for key in keys:
                result = await db.execute(
                    select(IntegrationConfig).where(IntegrationConfig.key == key)
                )
                cfg = result.scalar_one_or_none()
                if cfg and cfg.value:
                    val = cfg.get_decrypted_value()
                    field = key.replace("smtp_", "").replace("sender_email", "sender")
                    if field == "port":
                        config[field] = int(val)
                    else:
                        config[field] = val
        except Exception:
            pass

    # Fallback to env / settings
    if not config["host"]:
        from app.config import get_settings
        settings = get_settings()
        config["host"] = settings.smtp_host or ""
        config["port"] = settings.smtp_port or 587
        config["user"] = settings.smtp_user or ""
        config["password"] = settings.smtp_password or ""
        config["sender"] = config["user"]

    if not config["sender"]:
        config["sender"] = config["user"]

    return config


async def send_email(
    to: str,
    subject: str,
    body: str,
    html: bool = False,
    db: AsyncSession | None = None,
) -> bool:
    """
    Send an email via SMTP.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Email body (plain text or HTML).
        html: If True, send as HTML email.
        db: Optional database session to read config from DB.

    Returns:
        True if sent successfully, False otherwise.
    """
    config = await _get_smtp_config(db)

    if not config["host"] or not config["user"]:
        logger.error("SMTP not configured — missing SMTP_HOST or SMTP_USER")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = config["sender"]
        msg["To"] = to
        msg["Subject"] = subject

        if html:
            msg.attach(MIMEText(body, "html", "utf-8"))
        else:
            msg.attach(MIMEText(body, "plain", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=config["host"],
            port=config["port"],
            username=config["user"],
            password=config["password"],
            start_tls=True,
        )

        logger.info(f"Email sent to {to} — subject: {subject[:50]}")
        return True

    except aiosmtplib.SMTPException as exc:
        logger.error(f"SMTP error sending to {to}: {exc}")
        return False
    except Exception as exc:
        logger.error(f"Unexpected error sending email to {to}: {exc}")
        return False
