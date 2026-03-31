"""Authentication endpoints."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel as PydanticBaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import CurrentUser
from app.models.user import MagicLinkToken, User, UserWebAuthnCredential
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


# ── Magic Link Authentication ──────────────────────────────────


class MagicLinkRequest(PydanticBaseModel):
    email: EmailStr


@router.post("/magic-link/request", status_code=status.HTTP_200_OK)
async def request_magic_link(
    data: MagicLinkRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a magic link token and (in production) email it to the user.

    Always returns success to prevent email enumeration.
    """
    result = await db.execute(
        select(User).where(User.email == data.email, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()

    if user:
        token_str = secrets.token_urlsafe(48)  # 64-char base64
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        magic_token = MagicLinkToken(
            user_id=user.id,
            token=token_str,
            expires_at=expires_at,
        )
        db.add(magic_token)
        await db.commit()
        # TODO: send email with link containing token_str

    return {
        "status": "ok",
        "message": {
            "he": "אם האימייל קיים במערכת, נשלח קישור כניסה.",
            "en": "If the email exists, a login link has been sent.",
        },
    }


@router.get("/magic-link/{token}")
async def verify_magic_link(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Validate a magic link token, mark it used, and return JWT tokens."""
    result = await db.execute(
        select(MagicLinkToken).where(
            MagicLinkToken.token == token,
            MagicLinkToken.used_at.is_(None),
        )
    )
    magic = result.scalar_one_or_none()
    if not magic or magic.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="קישור הכניסה לא תקף או שפג תוקפו",
        )

    # Mark as used
    magic.used_at = datetime.now(timezone.utc)

    # Get user
    user_result = await db.execute(select(User).where(User.id == magic.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="המשתמש לא פעיל",
        )

    # Create JWT
    service = AuthService(db)
    access_token, expires_in = service.create_access_token(user.id)
    refresh_token = secrets.token_urlsafe(32)

    # Create session
    from app.models.user import UserSession
    import hashlib
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hashlib.sha256(refresh_token.encode()).hexdigest(),
        auth_method="magic_link",
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(session)

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": expires_in,
    }


# ── WebAuthn / Passkey ──────────────────────────────────────────

import json
import base64
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport,
    UserVerificationRequirement,
    RegistrationCredential,
    AuthenticationCredential,
    AuthenticatorAttestationResponse,
    AuthenticatorAssertionResponse,
)
from webauthn.helpers import base64url_to_bytes

# In-memory challenge store (keyed by user_id or session).
# In production, use Redis with TTL. This is safe for single-instance.
_webauthn_challenges: dict[str, bytes] = {}

_settings = get_settings()


class WebAuthnRegisterFinishRequest(PydanticBaseModel):
    """Body for /webauthn/register/finish."""
    id: str
    rawId: str
    type: str
    response: dict
    device_name: str | None = None


class WebAuthnLoginBeginRequest(PydanticBaseModel):
    """Body for /webauthn/login/begin."""
    email: EmailStr | None = None


class WebAuthnLoginFinishRequest(PydanticBaseModel):
    """Body for /webauthn/login/finish."""
    id: str
    rawId: str
    type: str
    response: dict


@router.post("/webauthn/register/begin")
async def webauthn_register_begin(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Begin WebAuthn registration — returns registration options."""
    # Get existing credentials to exclude
    result = await db.execute(
        select(UserWebAuthnCredential).where(
            UserWebAuthnCredential.user_id == user.id
        )
    )
    existing_creds = result.scalars().all()

    exclude_credentials = [
        PublicKeyCredentialDescriptor(
            id=cred.credential_id,
            transports=[AuthenticatorTransport(t) for t in (cred.transports or [])],
        )
        for cred in existing_creds
    ]

    options = generate_registration_options(
        rp_id=_settings.webauthn_rp_id,
        rp_name=_settings.webauthn_rp_name,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.email.split("@")[0],
        exclude_credentials=exclude_credentials,
    )

    # Store challenge for verification
    _webauthn_challenges[f"reg_{user.id}"] = options.challenge

    return json.loads(options_to_json(options))


@router.post("/webauthn/register/finish")
async def webauthn_register_finish(
    data: WebAuthnRegisterFinishRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Finish WebAuthn registration — stores credential."""
    challenge = _webauthn_challenges.pop(f"reg_{user.id}", None)
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא נמצא אתגר רישום פעיל. התחל מחדש.",
        )

    try:
        # Build the RegistrationCredential manually for py_webauthn 2.x
        raw_id_bytes = base64url_to_bytes(data.rawId)
        resp = data.response
        credential = RegistrationCredential(
            id=data.id,
            raw_id=raw_id_bytes,
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(resp["clientDataJSON"]),
                attestation_object=base64url_to_bytes(resp["attestationObject"]),
                transports=resp.get("transports"),
            ),
            type="public-key",
        )

        verification = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=_settings.webauthn_rp_id,
            expected_origin=_settings.webauthn_origin,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"אימות הרישום נכשל: {str(e)}",
        )

    # Save credential to database
    new_cred = UserWebAuthnCredential(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        aaguid=str(verification.aaguid) if verification.aaguid else None,
        device_name=data.device_name or "Passkey",
        backed_up=getattr(verification, "credential_backed_up", False),
    )
    db.add(new_cred)
    await db.commit()

    return {
        "status": "ok",
        "message": {
            "he": "מפתח האבטחה נרשם בהצלחה",
            "en": "Security key registered successfully",
        },
    }


@router.post("/webauthn/login/begin")
async def webauthn_login_begin(
    data: WebAuthnLoginBeginRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Begin WebAuthn login — returns authentication options."""
    allow_credentials = []

    # If email provided, scope to that user's credentials
    if data and data.email:
        user_result = await db.execute(
            select(User).where(User.email == data.email, User.is_active.is_(True))
        )
        user = user_result.scalar_one_or_none()
        if user:
            cred_result = await db.execute(
                select(UserWebAuthnCredential).where(
                    UserWebAuthnCredential.user_id == user.id
                )
            )
            creds = cred_result.scalars().all()
            allow_credentials = [
                PublicKeyCredentialDescriptor(
                    id=c.credential_id,
                    transports=[AuthenticatorTransport(t) for t in (c.transports or [])],
                )
                for c in creds
            ]

    options = generate_authentication_options(
        rp_id=_settings.webauthn_rp_id,
        allow_credentials=allow_credentials if allow_credentials else None,
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    # Store challenge (use a random session key for unauthenticated flow)
    session_key = secrets.token_urlsafe(16)
    _webauthn_challenges[f"auth_{session_key}"] = options.challenge

    response = json.loads(options_to_json(options))
    response["session_key"] = session_key
    return response


@router.post("/webauthn/login/finish")
async def webauthn_login_finish(
    data: WebAuthnLoginFinishRequest,
    session_key: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Finish WebAuthn login — verifies assertion and returns JWT."""
    # Find the credential in the database
    try:
        raw_id_bytes = base64url_to_bytes(data.rawId)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="מזהה credential לא תקין",
        )

    result = await db.execute(
        select(UserWebAuthnCredential).where(
            UserWebAuthnCredential.credential_id == raw_id_bytes
        )
    )
    stored_cred = result.scalar_one_or_none()
    if not stored_cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="מפתח האבטחה לא מוכר",
        )

    # Get user
    user_result = await db.execute(
        select(User).where(User.id == stored_cred.user_id, User.is_active.is_(True))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="המשתמש לא פעיל",
        )

    # Find and validate challenge
    challenge = None
    if session_key:
        challenge = _webauthn_challenges.pop(f"auth_{session_key}", None)
    else:
        # Try to find any matching challenge (fallback)
        for key in list(_webauthn_challenges.keys()):
            if key.startswith("auth_"):
                challenge = _webauthn_challenges.pop(key, None)
                break

    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="אתגר האימות פג תוקף. נסה שוב.",
        )

    try:
        # Build the AuthenticationCredential manually for py_webauthn 2.x
        resp = data.response
        credential = AuthenticationCredential(
            id=data.id,
            raw_id=raw_id_bytes,
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(resp["clientDataJSON"]),
                authenticator_data=base64url_to_bytes(resp["authenticatorData"]),
                signature=base64url_to_bytes(resp["signature"]),
                user_handle=base64url_to_bytes(resp["userHandle"]) if resp.get("userHandle") else None,
            ),
            type="public-key",
        )

        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=_settings.webauthn_rp_id,
            expected_origin=_settings.webauthn_origin,
            credential_public_key=stored_cred.public_key,
            credential_current_sign_count=stored_cred.sign_count,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"אימות נכשל: {str(e)}",
        )

    # Update sign count and last used
    stored_cred.sign_count = verification.new_sign_count
    stored_cred.last_used_at = datetime.now(timezone.utc)

    # Create JWT tokens
    service = AuthService(db)
    access_token, expires_in = service.create_access_token(user.id)
    refresh_token = secrets.token_urlsafe(32)

    # Create session
    from app.models.user import UserSession
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hashlib.sha256(refresh_token.encode()).hexdigest(),
        auth_method="webauthn",
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(session)

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": expires_in,
    }


# ── Google OAuth ────────────────────────────────────────────────

import httpx
import urllib.parse


@router.get("/google")
async def google_oauth_redirect():
    """Redirect to Google OAuth consent URL."""
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        return {"status": "not_configured"}

    state = secrets.token_urlsafe(32)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
        "prompt": "consent",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return JSONResponse(
        content={"redirect_url": url, "state": state},
        status_code=200,
    )


@router.get("/google/callback")
async def google_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Handle Google OAuth callback — create/link user and return JWT."""
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        return {"status": "not_configured"}

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"שגיאת Google OAuth: {error}",
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="חסר קוד אישור מ-Google",
        )

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if token_response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="שגיאה בהחלפת קוד אישור לטוקן",
        )

    token_data = token_response.json()
    access_token_google = token_data.get("access_token")

    if not access_token_google:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא התקבל טוקן גישה מ-Google",
        )

    # Get user info from Google
    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token_google}"},
        )

    if userinfo_response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="שגיאה בקבלת פרטי משתמש מ-Google",
        )

    google_user = userinfo_response.json()
    google_email = google_user.get("email", "").lower().strip()
    google_id = google_user.get("id", "")
    google_name = google_user.get("name", "")
    google_picture = google_user.get("picture", "")

    if not google_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא התקבל אימייל מ-Google",
        )

    # Check if user exists by email
    result = await db.execute(
        select(User).where(User.email == google_email, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()

    if not user:
        # Check if there's an SSO connection for this Google ID
        from app.models.user import UserSSOConnection
        sso_result = await db.execute(
            select(UserSSOConnection).where(
                UserSSOConnection.provider == "google",
                UserSSOConnection.provider_user_id == google_id,
            )
        )
        sso_conn = sso_result.scalar_one_or_none()

        if sso_conn:
            user_result = await db.execute(
                select(User).where(User.id == sso_conn.user_id, User.is_active.is_(True))
            )
            user = user_result.scalar_one_or_none()

    if not user:
        # Create new user (self-signup via Google)
        user = User(
            email=google_email,
            password_hash=None,  # Google OAuth users don't have a password
            is_active=True,
            preferred_language="he",
        )
        db.add(user)
        await db.flush()

    # Upsert SSO connection
    from app.models.user import UserSSOConnection
    sso_result = await db.execute(
        select(UserSSOConnection).where(
            UserSSOConnection.user_id == user.id,
            UserSSOConnection.provider == "google",
        )
    )
    existing_sso = sso_result.scalar_one_or_none()

    if not existing_sso:
        sso_conn = UserSSOConnection(
            user_id=user.id,
            provider="google",
            provider_user_id=google_id,
            email=google_email,
            name=google_name,
            avatar_url=google_picture,
            connected_at=datetime.now(timezone.utc),
        )
        db.add(sso_conn)
    else:
        existing_sso.email = google_email
        existing_sso.name = google_name
        existing_sso.avatar_url = google_picture
        existing_sso.connected_at = datetime.now(timezone.utc)

    # Create JWT tokens
    service = AuthService(db)
    access_token, expires_in = service.create_access_token(user.id)
    refresh_token = secrets.token_urlsafe(32)

    # Create session
    from app.models.user import UserSession
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hashlib.sha256(refresh_token.encode()).hexdigest(),
        auth_method="google",
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(session)

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": {
            "email": google_email,
            "name": google_name,
            "picture": google_picture,
        },
    }


# ── SAML SSO ────────────────────────────────────────────────────

import xml.etree.ElementTree as ET
from fastapi import Request


@router.post("/saml/acs")
async def saml_assertion_consumer_service(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """SAML Assertion Consumer Service endpoint.

    Parses a base64-encoded SAML response, extracts the NameID (email),
    looks up the user, and creates a JWT session.
    """
    settings = get_settings()

    # Check if SAML is configured
    if not settings.saml_idp_entity_id or not settings.saml_idp_certificate:
        return {"status": "not_configured"}

    # Get the SAMLResponse from the form POST
    form_data = await request.form()
    saml_response_b64 = form_data.get("SAMLResponse")
    if not saml_response_b64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="חסר SAMLResponse בבקשה",
        )

    # Decode the base64 SAML response
    try:
        saml_xml = base64.b64decode(saml_response_b64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SAMLResponse לא תקין — שגיאה בפענוח base64",
        )

    # Parse the SAML XML
    try:
        root = ET.fromstring(saml_xml)
    except ET.ParseError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SAMLResponse לא תקין — שגיאת XML",
        )

    # Define SAML namespaces
    ns = {
        "saml2p": "urn:oasis:names:tc:SAML:2.0:protocol",
        "saml2": "urn:oasis:names:tc:SAML:2.0:assertion",
        "saml": "urn:oasis:names:tc:SAML:2.0:assertion",
    }

    # Verify the Issuer matches expected IDP entity ID
    issuer_el = root.find(".//saml2:Issuer", ns) or root.find(".//saml:Issuer", ns)
    if issuer_el is not None and issuer_el.text:
        if issuer_el.text.strip() != settings.saml_idp_entity_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="SAML Issuer לא תואם את ה-IDP המוגדר",
            )

    # Extract NameID (email) from the assertion
    name_id_el = (
        root.find(".//saml2:Assertion/saml2:Subject/saml2:NameID", ns)
        or root.find(".//saml:Assertion/saml:Subject/saml:NameID", ns)
    )
    if name_id_el is None or not name_id_el.text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא נמצא NameID בתגובת SAML",
        )

    email = name_id_el.text.strip().lower()

    # Extract optional attributes (first_name, last_name, etc.)
    attributes: dict[str, str] = {}
    attr_statements = (
        root.findall(".//saml2:Assertion/saml2:AttributeStatement/saml2:Attribute", ns)
        or root.findall(".//saml:Assertion/saml:AttributeStatement/saml:Attribute", ns)
    )
    for attr_el in attr_statements:
        attr_name = attr_el.get("Name", "")
        value_el = attr_el.find("saml2:AttributeValue", ns) or attr_el.find("saml:AttributeValue", ns)
        if value_el is not None and value_el.text:
            attributes[attr_name] = value_el.text.strip()

    # Look up user by email
    result = await db.execute(
        select(User).where(User.email == email, User.is_active.is_(True))
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="משתמש לא נמצא במערכת",
        )

    # Create JWT tokens
    service = AuthService(db)
    access_token, expires_in = service.create_access_token(user.id)
    refresh_token = secrets.token_urlsafe(32)

    # Create session
    from app.models.user import UserSession
    session = UserSession(
        user_id=user.id,
        refresh_token_hash=hashlib.sha256(refresh_token.encode()).hexdigest(),
        auth_method="saml",
        last_active_at=datetime.now(timezone.utc),
    )
    db.add(session)

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": {
            "email": email,
            "attributes": attributes,
        },
    }


@router.get("/saml/metadata")
async def saml_metadata() -> dict:
    """Return SAML SP metadata/config status."""
    settings = get_settings()
    if not settings.saml_idp_entity_id:
        return {"status": "not_configured"}
    return {
        "status": "configured",
        "idp_entity_id": settings.saml_idp_entity_id,
        "idp_sso_url": settings.saml_idp_sso_url,
    }
