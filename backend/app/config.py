"""Application configuration via environment variables."""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "shavtzak"
    postgres_user: str = "shavtzak"
    postgres_password: str = "changeme_in_production"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # App
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    secret_key: str = "INSECURE-DEFAULT-CHANGE-ME-TO-RANDOM-64-CHARS-IN-PRODUCTION-NOW"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    debug: bool = False
    log_level: str = "INFO"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # AWS (optional)
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "eu-west-1"
    s3_bucket: str = "shavtzak-assets"

    # Sentry (optional)
    sentry_dsn: str | None = None

    # SMTP (email notifications)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None

    # Web Push (VAPID)
    vapid_private_key: str | None = None
    vapid_public_key: str | None = None
    vapid_claims_email: str = "admin@shavtzak.site"

    # WhatsApp Business (Meta Cloud API)
    whatsapp_api_token: str | None = None
    whatsapp_phone_number_id: str | None = None

    # Telegram Bot
    telegram_bot_token: str | None = None

    # WebAuthn / Passkey
    webauthn_rp_id: str = "localhost"
    webauthn_rp_name: str = "שבצק"
    webauthn_origin: str = "http://localhost:3000"
    # Comma-separated list of allowed origins (for multi-environment support)
    webauthn_allowed_origins: str = "http://localhost:3000,http://localhost:5173,https://shavtzak.site"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    # SAML SSO
    saml_idp_entity_id: str = ""
    saml_idp_sso_url: str = ""
    saml_idp_certificate: str = ""

    # Default timezone (Israel)
    default_timezone: str = "Asia/Jerusalem"

    # Google Sheets
    google_service_account_json: str | None = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def database_url(self) -> str:
        """Async PostgreSQL connection URL."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync PostgreSQL connection URL (for Alembic)."""
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        """Redis connection URL."""
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string.

        SECURITY: Never allow '*' as origin. Each origin must be explicit.
        """
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        # Reject wildcard in production
        if not self.debug and "*" in origins:
            raise ValueError("CORS wildcard '*' is not allowed in production. Set explicit origins.")
        return origins

    @property
    def cookie_secure(self) -> bool:
        """Whether cookies should be Secure (HTTPS only)."""
        return not self.debug

    @property
    def cookie_samesite(self) -> str:
        """Cookie SameSite attribute."""
        return "Lax"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
