"""Authentication endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.auth import (
    BackupCodesResponse,
    ChangePasswordRequest,
    Disable2FARequest,
    Enable2FAResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    TwoFactorLoginRequest,
    UserResponse,
    Verify2FARequest,
)
from app.services.auth_service import AuthService

router = APIRouter()


# ── Login & Tokens ──────────────────────────────────────────────


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """Authenticate with email and password.

    If user has 2FA enabled, returns requires_2fa=True with a temp_token.
    Use /auth/2fa/login-verify with the temp_token to complete login.
    """
    # TODO: rate limit — max 5 attempts per email per 15 min
    service = AuthService(db)
    result = await service.authenticate(request.email, request.password)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="אימייל או סיסמה שגויים",
        )
    return result


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Refresh an access token."""
    service = AuthService(db)
    result = await service.refresh(request.refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="טוקן רענון לא תקף או פג תוקף",
        )
    return result


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke the current session."""
    service = AuthService(db)
    await service.logout(user.id)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke all sessions for the current user."""
    service = AuthService(db)
    await service.logout_all(user.id)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Get current user info with role and tenant details."""
    service = AuthService(db)
    return await service.build_user_response(user)


# ── Password Management ────────────────────────────────────────


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    request: ChangePasswordRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Change the current user's password."""
    service = AuthService(db)
    success = await service.change_password(
        user.id, request.current_password, request.new_password
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הסיסמה הנוכחית שגויה",
        )


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a password reset email."""
    service = AuthService(db)
    await service.send_reset_email(request.email)
    return {"detail": "אם האימייל קיים במערכת, נשלח קישור לאיפוס סיסמה."}


@router.post("/reset-password/{token}", status_code=status.HTTP_200_OK)
async def reset_password(
    token: str,
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Verify reset token and set a new password.

    Token TTL: 1 hour. After reset, all existing sessions are invalidated.
    """
    service = AuthService(db)
    success = await service.reset_password(token, request.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="קישור האיפוס לא תקף או שפג תוקפו",
        )
    return {"detail": "הסיסמה עודכנה בהצלחה. יש להתחבר מחדש."}


# ── 2FA / TOTP ──────────────────────────────────────────────────


@router.post("/2fa/enable", response_model=Enable2FAResponse)
async def enable_2fa(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> Enable2FAResponse:
    """Generate TOTP secret, QR code URI, and backup codes.

    After calling this, use /auth/2fa/verify with a code from
    the authenticator app to confirm setup.
    """
    service = AuthService(db)
    result = await service.enable_2fa(user.id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="אימות דו-שלבי כבר מופעל",
        )
    return Enable2FAResponse(**result)


@router.post("/2fa/verify", status_code=status.HTTP_200_OK)
async def verify_2fa_setup(
    request: Verify2FARequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Verify TOTP code to complete 2FA setup."""
    service = AuthService(db)
    success = await service.verify_2fa_setup(user.id, request.code)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="קוד האימות שגוי",
        )
    return {"detail": "אימות דו-שלבי הופעל בהצלחה"}


@router.post("/2fa/disable", status_code=status.HTTP_200_OK)
async def disable_2fa(
    request: Disable2FARequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Disable 2FA — requires password confirmation."""
    service = AuthService(db)
    success = await service.disable_2fa(user.id, request.password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הסיסמה שגויה או שאימות דו-שלבי לא מופעל",
        )
    return {"detail": "אימות דו-שלבי בוטל"}


@router.post("/2fa/backup-codes/regen", response_model=BackupCodesResponse)
async def regenerate_backup_codes(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> BackupCodesResponse:
    """Generate 10 new backup codes. Previous codes are invalidated."""
    service = AuthService(db)
    codes = await service.regenerate_backup_codes(user.id)
    if codes is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="אימות דו-שלבי לא מופעל",
        )
    return BackupCodesResponse(backup_codes=codes)


@router.post("/2fa/login-verify", response_model=LoginResponse)
async def verify_2fa_login(
    request: TwoFactorLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """Verify TOTP code (or backup code) with temp_token to complete login."""
    # TODO: rate limit — max 5 attempts per temp_token
    service = AuthService(db)
    result = await service.verify_2fa_login(request.temp_token, request.code)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="קוד האימות שגוי או שהטוקן פג תוקף",
        )
    return result


# ── Sessions ────────────────────────────────────────────────────


@router.get("/sessions")
async def list_sessions(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List active sessions for the current user."""
    service = AuthService(db)
    return await service.list_sessions(user.id)
