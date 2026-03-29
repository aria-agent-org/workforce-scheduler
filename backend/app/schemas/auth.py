"""Authentication schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


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


class ForgotPasswordRequest(BaseModel):
    """Forgot password — send reset email."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password with token."""
    token: str
    new_password: str = Field(min_length=8, max_length=128)


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
    """Login response with tokens and user info."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class Enable2FAResponse(BaseModel):
    """2FA setup response."""
    secret: str
    qr_code_uri: str
    backup_codes: list[str]


class Verify2FARequest(BaseModel):
    """2FA verification."""
    code: str = Field(min_length=6, max_length=6)
