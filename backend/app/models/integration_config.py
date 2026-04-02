"""Integration configuration model — stores integration credentials in DB."""

import os
from datetime import datetime, timezone
from uuid import uuid4

from cryptography.fernet import Fernet
from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base

# Encryption key for sensitive values
_ENCRYPTION_KEY = os.environ.get("INTEGRATION_ENCRYPTION_KEY", "")


def _get_fernet() -> Fernet | None:
    """Get Fernet cipher for encryption/decryption."""
    key = _ENCRYPTION_KEY
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        return None


def encrypt_value(value: str) -> str:
    """Encrypt a config value. Returns plaintext if no key configured."""
    f = _get_fernet()
    if f and value:
        return f.encrypt(value.encode()).decode()
    return value


def decrypt_value(value: str) -> str:
    """Decrypt a config value. Returns as-is if not encrypted or no key."""
    f = _get_fernet()
    if f and value:
        try:
            return f.decrypt(value.encode()).decode()
        except Exception:
            return value
    return value


# Config key definitions with metadata
INTEGRATION_KEYS = {
    # Telegram
    "telegram_bot_token": {"category": "telegram", "sensitive": True, "label": "Bot Token", "label_he": "טוקן בוט"},
    "telegram_tenant_id": {"category": "telegram", "sensitive": False, "label": "Tenant ID", "label_he": "מזהה טננט"},
    "telegram_webhook_url": {"category": "telegram", "sensitive": False, "label": "Webhook URL", "label_he": "כתובת Webhook"},
    # WhatsApp
    "whatsapp_api_token": {"category": "whatsapp", "sensitive": True, "label": "API Token", "label_he": "טוקן API"},
    "whatsapp_phone_number_id": {"category": "whatsapp", "sensitive": False, "label": "Phone Number ID", "label_he": "מזהה מספר טלפון"},
    "whatsapp_verify_token": {"category": "whatsapp", "sensitive": True, "label": "Verify Token", "label_he": "טוקן אימות"},
    "whatsapp_tenant_map": {"category": "whatsapp", "sensitive": False, "label": "Tenant Map (phone_id:tenant_uuid)", "label_he": "מיפוי טננטים"},
    # SMTP / Email
    "smtp_host": {"category": "email", "sensitive": False, "label": "SMTP Host", "label_he": "שרת SMTP"},
    "smtp_port": {"category": "email", "sensitive": False, "label": "SMTP Port", "label_he": "פורט SMTP"},
    "smtp_user": {"category": "email", "sensitive": False, "label": "SMTP User", "label_he": "משתמש SMTP"},
    "smtp_password": {"category": "email", "sensitive": True, "label": "SMTP Password", "label_he": "סיסמת SMTP"},
    "smtp_sender_email": {"category": "email", "sensitive": False, "label": "Sender Email", "label_he": "כתובת שולח"},
    # SMS (AWS SNS)
    "aws_access_key_id": {"category": "sms", "sensitive": True, "label": "AWS Access Key ID", "label_he": "מפתח AWS"},
    "aws_secret_access_key": {"category": "sms", "sensitive": True, "label": "AWS Secret Key", "label_he": "מפתח סודי AWS"},
    "aws_region": {"category": "sms", "sensitive": False, "label": "AWS Region", "label_he": "אזור AWS"},
    # AI Bot
    "ai_api_key": {"category": "ai", "sensitive": True, "label": "AI API Key", "label_he": "מפתח AI"},
    "ai_base_url": {"category": "ai", "sensitive": False, "label": "AI Base URL", "label_he": "כתובת API"},
    "ai_model": {"category": "ai", "sensitive": False, "label": "AI Model", "label_he": "מודל AI"},
    "ai_system_prompt": {"category": "ai", "sensitive": False, "label": "System Prompt", "label_he": "פרומפט מערכת"},
    # VAPID Push
    "vapid_public_key": {"category": "push", "sensitive": False, "label": "VAPID Public Key", "label_he": "מפתח ציבורי VAPID"},
    "vapid_private_key": {"category": "push", "sensitive": True, "label": "VAPID Private Key", "label_he": "מפתח פרטי VAPID"},
    "vapid_claims_email": {"category": "push", "sensitive": False, "label": "VAPID Email", "label_he": "אימייל VAPID"},
    # Google Sheets
    "google_service_account_json": {"category": "google_sheets", "sensitive": True, "label": "Service Account JSON", "label_he": "JSON חשבון שירות"},
}


class IntegrationConfig(Base):
    """Stores integration configuration key-value pairs."""

    __tablename__ = "integration_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    category = Column(String(50), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(UUID(as_uuid=True), nullable=True)

    def get_decrypted_value(self) -> str:
        """Return decrypted value."""
        if not self.value:
            return ""
        meta = INTEGRATION_KEYS.get(self.key, {})
        if meta.get("sensitive"):
            return decrypt_value(self.value)
        return self.value

    def get_masked_value(self) -> str:
        """Return masked value for display."""
        if not self.value:
            return ""
        meta = INTEGRATION_KEYS.get(self.key, {})
        if meta.get("sensitive"):
            decrypted = self.get_decrypted_value()
            if len(decrypted) <= 8:
                return "••••••••"
            return decrypted[:4] + "••••" + decrypted[-4:]
        return self.value
