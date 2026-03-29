"""Authentication endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    Enable2FAResponse,
    Verify2FARequest,
)
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    """Authenticate with email and password."""
    service = AuthService(db)
    result = await service.authenticate(request.email, request.password)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
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
            detail="Invalid or expired refresh token",
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
            detail="Current password is incorrect",
        )


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a password reset email."""
    service = AuthService(db)
    await service.send_reset_email(request.email)
    return {"detail": "If the email exists, a reset link has been sent."}


@router.get("/sessions")
async def list_sessions(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List active sessions for the current user."""
    service = AuthService(db)
    return await service.list_sessions(user.id)
