"""Email notification channel via SMTP."""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_email(
    to: str,
    subject: str,
    body: str,
    html: bool = False,
) -> bool:
    """
    Send an email via SMTP.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Email body (plain text or HTML).
        html: If True, send as HTML email.

    Returns:
        True if sent successfully, False otherwise.
    """
    settings = get_settings()

    smtp_host = settings.smtp_host
    smtp_port = settings.smtp_port
    smtp_user = settings.smtp_user
    smtp_password = settings.smtp_password

    if not smtp_host or not smtp_user:
        logger.error("SMTP not configured — missing SMTP_HOST or SMTP_USER")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = smtp_user
        msg["To"] = to
        msg["Subject"] = subject

        if html:
            msg.attach(MIMEText(body, "html", "utf-8"))
        else:
            msg.attach(MIMEText(body, "plain", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=smtp_host,
            port=smtp_port,
            username=smtp_user,
            password=smtp_password,
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
