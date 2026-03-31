"""Authentication schemas."""

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


def validate_password_complexity(password: str) -> str:
    """Enforce password complexity: min 8 chars, 1 uppercase, 1 lowercase, 1 digit.

    Enterprise/military-grade password requirements.
    """
    if len(password) < 8:
        raise ValueError("הסיסמה חייבת להכיל לפחות 8 תווים")
    if not re.search(r"[A-Z]", password):
        raise ValueError("הסיסמה חייבת להכיל לפחות אות גדולה אחת באנגלית (A-Z)")
    if not re.search(r"[a-z]", password):
        raise ValueError("הסיסמה חייבת להכיל לפחות אות קטנה אחת באנגלית (a-z)")
    if not re.search(r"[0-9]", password):
        raise ValueError("הסיסמה חייבת להכיל לפחות ספרה אחת (0-9)")
    return password


class LoginRequest(BaseModel):
    """Login with email and password."""
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    """JWT token pair response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    """Token refresh request."""
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    """Change password request."""
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return validate_password_complexity(v)


class ForgotPasswordRequest(BaseModel):
    """Forgot password — send reset email."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password with token."""
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return validate_password_complexity(v)


class UserResponse(BaseModel):
    """User info response."""
    id: UUID
    email: str
    tenant_id: UUID | None = None
    tenant_slug: str | None = None
    role_name: str | None = None
    employee_id: UUID | None = None
    preferred_language: str
    is_active: bool
    two_factor_enabled: bool
    last_login: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    """Login response — either full tokens or 2FA challenge."""
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int | None = None
    user: UserResponse | None = None
    requires_2fa: bool = False
    temp_token: str | None = None


class Enable2FAResponse(BaseModel):
    """2FA setup response."""
    secret: str
    qr_code_uri: str
    backup_codes: list[str]


class Verify2FARequest(BaseModel):
    """2FA verification."""
    code: str = Field(min_length=6, max_length=6)


class Disable2FARequest(BaseModel):
    """Disable 2FA — requires password confirmation."""
    password: str


class TwoFactorLoginRequest(BaseModel):
    """2FA login verification with temp token."""
    temp_token: str
    code: str = Field(min_length=6, max_length=8)  # 6 for TOTP, 8 for backup codes


class BackupCodesResponse(BaseModel):
    """Regenerated backup codes."""
    backup_codes: list[str]
