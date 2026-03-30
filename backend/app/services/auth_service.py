"""Authentication service: JWT, password hashing, session management, 2FA."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
import pyotp
from jose import jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.resource import RoleDefinition
from app.models.tenant import Tenant
from app.models.user import MagicLinkToken, User, UserSession, UserTOTP
from app.schemas.auth import LoginResponse, TokenResponse, UserResponse

settings = get_settings()


class AuthService:
    """Handle authentication, tokens, and sessions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a plaintext password."""
        return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        """Verify a password against its hash."""
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

    @staticmethod
    def create_access_token(user_id: uuid.UUID) -> tuple[str, int]:
        """Create a JWT access token."""
        expires_delta = timedelta(minutes=settings.jwt_access_token_expire_minutes)
        expire = datetime.now(timezone.utc) + expires_delta
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "type": "access",
        }
        token = jwt.encode(payload, settings.secret_key, algorithm="HS256")
        return token, int(expires_delta.total_seconds())

    @staticmethod
    def create_temp_2fa_token(user_id: uuid.UUID) -> str:
        """Create a short-lived temp token for 2FA verification."""
        expire = datetime.now(timezone.utc) + timedelta(minutes=5)
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "type": "2fa_temp",
        }
        return jwt.encode(payload, settings.secret_key, algorithm="HS256")

    @staticmethod
    def verify_temp_2fa_token(token: str) -> uuid.UUID | None:
        """Verify a temp 2FA token and return user_id."""
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
            if payload.get("type") != "2fa_temp":
                return None
            return uuid.UUID(payload["sub"])
        except Exception:
            return None

    @staticmethod
    def create_refresh_token(user_id: uuid.UUID) -> str:
        """Create a JWT refresh token."""
        expires_delta = timedelta(days=settings.jwt_refresh_token_expire_days)
        expire = datetime.now(timezone.utc) + expires_delta
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "type": "refresh",
            "jti": str(uuid.uuid4()),
        }
        return jwt.encode(payload, settings.secret_key, algorithm="HS256")

    async def build_user_response(self, user: User) -> UserResponse:
        """Build a UserResponse with role_name and tenant_slug resolved."""
        role_name: str | None = None
        tenant_slug: str | None = None

        if user.role_definition_id:
            result = await self.db.execute(
                select(RoleDefinition.name).where(RoleDefinition.id == user.role_definition_id)
            )
            role_name = result.scalar_one_or_none()

        if user.tenant_id:
            result = await self.db.execute(
                select(Tenant.slug).where(Tenant.id == user.tenant_id)
            )
            tenant_slug = result.scalar_one_or_none()

        return UserResponse(
            id=user.id,
            email=user.email,
            tenant_id=user.tenant_id,
            tenant_slug=tenant_slug,
            role_name=role_name,
            employee_id=user.employee_id,
            preferred_language=user.preferred_language,
            is_active=user.is_active,
            two_factor_enabled=user.two_factor_enabled,
            last_login=user.last_login,
            created_at=user.created_at,
        )

    async def authenticate(self, email: str, password: str) -> LoginResponse | None:
        """Authenticate a user and return tokens + user info.

        If the user has 2FA enabled, returns a temp_token + requires_2fa flag
        instead of full JWT tokens.
        """
        # TODO: rate limiting — implement per-IP/email rate limiter
        result = await self.db.execute(
            select(User).where(User.email == email, User.is_active.is_(True))
        )
        user = result.scalar_one_or_none()
        if not user or not user.password_hash:
            return None
        if not self.verify_password(password, user.password_hash):
            return None

        # Check if 2FA is enabled — return challenge instead of tokens
        if user.two_factor_enabled:
            temp_token = self.create_temp_2fa_token(user.id)
            return LoginResponse(
                requires_2fa=True,
                temp_token=temp_token,
            )

        return await self._complete_login(user)

    async def _complete_login(self, user: User) -> LoginResponse:
        """Issue tokens and create session for an authenticated user."""
        access_token, expires_in = self.create_access_token(user.id)
        refresh_token = self.create_refresh_token(user.id)

        # Store session
        session = UserSession(
            user_id=user.id,
            refresh_token_hash=_bcrypt.hashpw(refresh_token.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8"),
            auth_method="password",
            last_active_at=datetime.now(timezone.utc),
        )
        self.db.add(session)

        # Update last login
        user.last_login = datetime.now(timezone.utc)
        await self.db.flush()

        user_response = await self.build_user_response(user)

        return LoginResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            user=user_response,
        )

    async def refresh(self, refresh_token: str) -> TokenResponse | None:
        """Refresh an access token using a refresh token."""
        try:
            payload = jwt.decode(refresh_token, settings.secret_key, algorithms=["HS256"])
            if payload.get("type") != "refresh":
                return None
            user_id = payload.get("sub")
        except Exception:
            return None

        result = await self.db.execute(
            select(User).where(User.id == uuid.UUID(user_id), User.is_active.is_(True))
        )
        user = result.scalar_one_or_none()
        if not user:
            return None

        access_token, expires_in = self.create_access_token(user.id)
        new_refresh = self.create_refresh_token(user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh,
            expires_in=expires_in,
        )

    async def logout(self, user_id: uuid.UUID) -> None:
        """Revoke the most recent session."""
        result = await self.db.execute(
            select(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .order_by(UserSession.created_at.desc())
            .limit(1)
        )
        session = result.scalar_one_or_none()
        if session:
            session.revoked_at = datetime.now(timezone.utc)
            await self.db.flush()

    async def logout_all(self, user_id: uuid.UUID) -> None:
        """Revoke all sessions for a user."""
        await self.db.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await self.db.flush()

    async def change_password(
        self, user_id: uuid.UUID, current: str, new: str
    ) -> bool:
        """Change user password."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.password_hash:
            return False
        if not self.verify_password(current, user.password_hash):
            return False
        user.password_hash = self.hash_password(new)
        await self.db.flush()
        return True

    async def send_reset_email(self, email: str) -> None:
        """Generate a password reset token and send email."""
        result = await self.db.execute(
            select(User).where(User.email == email, User.is_active.is_(True))
        )
        user = result.scalar_one_or_none()
        if not user:
            # Don't reveal whether user exists
            return

        token = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        magic_link = MagicLinkToken(
            user_id=user.id,
            token=token,
            expires_at=expires_at,
        )
        self.db.add(magic_link)
        await self.db.flush()

        # TODO: send actual email via SES/SMTP with reset link containing token
        # For now, token is stored and ready for verification

    async def reset_password(self, token: str, new_password: str) -> bool:
        """Verify reset token and set new password."""
        result = await self.db.execute(
            select(MagicLinkToken).where(
                MagicLinkToken.token == token,
                MagicLinkToken.used_at.is_(None),
                MagicLinkToken.expires_at > datetime.now(timezone.utc),
            )
        )
        magic_link = result.scalar_one_or_none()
        if not magic_link:
            return False

        # Mark token as used
        magic_link.used_at = datetime.now(timezone.utc)

        # Update password
        user_result = await self.db.execute(
            select(User).where(User.id == magic_link.user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            return False

        user.password_hash = self.hash_password(new_password)

        # Invalidate all existing sessions
        await self.db.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )

        await self.db.flush()
        return True

    # ── 2FA / TOTP ──────────────────────────────────────────────

    async def enable_2fa(self, user_id: uuid.UUID) -> dict:
        """Generate TOTP secret, QR URI, and backup codes."""
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return {}

        # Check if already has TOTP record
        totp_result = await self.db.execute(
            select(UserTOTP).where(UserTOTP.user_id == user_id)
        )
        existing = totp_result.scalar_one_or_none()
        if existing and existing.verified_at:
            return {}  # Already enabled

        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        qr_uri = totp.provisioning_uri(name=user.email, issuer_name="שבצק")

        # Generate 10 backup codes
        backup_codes_plain = [secrets.token_hex(4) for _ in range(10)]
        backup_codes_hashed = [
            _bcrypt.hashpw(code.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
            for code in backup_codes_plain
        ]

        if existing:
            existing.secret = secret
            existing.backup_codes = backup_codes_hashed
            existing.verified_at = None
        else:
            totp_record = UserTOTP(
                user_id=user_id,
                secret=secret,
                backup_codes=backup_codes_hashed,
            )
            self.db.add(totp_record)

        await self.db.flush()

        return {
            "secret": secret,
            "qr_code_uri": qr_uri,
            "backup_codes": backup_codes_plain,
        }

    async def verify_2fa_setup(self, user_id: uuid.UUID, code: str) -> bool:
        """Verify TOTP code during setup and mark 2FA as enabled."""
        result = await self.db.execute(
            select(UserTOTP).where(UserTOTP.user_id == user_id)
        )
        totp_record = result.scalar_one_or_none()
        if not totp_record or totp_record.verified_at:
            return False

        totp = pyotp.TOTP(totp_record.secret)
        if not totp.verify(code, valid_window=1):
            return False

        totp_record.verified_at = datetime.now(timezone.utc)

        # Enable 2FA on user
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.two_factor_enabled = True

        await self.db.flush()
        return True

    async def disable_2fa(self, user_id: uuid.UUID, password: str) -> bool:
        """Disable 2FA after password confirmation."""
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user or not user.password_hash:
            return False
        if not self.verify_password(password, user.password_hash):
            return False

        # Remove TOTP record
        totp_result = await self.db.execute(
            select(UserTOTP).where(UserTOTP.user_id == user_id)
        )
        totp_record = totp_result.scalar_one_or_none()
        if totp_record:
            await self.db.delete(totp_record)

        user.two_factor_enabled = False
        user.two_factor_secret = None
        await self.db.flush()
        return True

    async def regenerate_backup_codes(self, user_id: uuid.UUID) -> list[str] | None:
        """Generate 10 new backup codes."""
        result = await self.db.execute(
            select(UserTOTP).where(UserTOTP.user_id == user_id)
        )
        totp_record = result.scalar_one_or_none()
        if not totp_record or not totp_record.verified_at:
            return None

        backup_codes_plain = [secrets.token_hex(4) for _ in range(10)]
        backup_codes_hashed = [
            _bcrypt.hashpw(code.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
            for code in backup_codes_plain
        ]
        totp_record.backup_codes = backup_codes_hashed
        await self.db.flush()
        return backup_codes_plain

    async def verify_2fa_login(self, temp_token: str, code: str) -> LoginResponse | None:
        """Verify 2FA code during login and return full tokens."""
        user_id = self.verify_temp_2fa_token(temp_token)
        if not user_id:
            return None

        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_active.is_(True))
        )
        user = result.scalar_one_or_none()
        if not user:
            return None

        # Try TOTP code first
        totp_result = await self.db.execute(
            select(UserTOTP).where(UserTOTP.user_id == user_id)
        )
        totp_record = totp_result.scalar_one_or_none()
        if not totp_record:
            return None

        totp = pyotp.TOTP(totp_record.secret)
        verified = totp.verify(code, valid_window=1)

        # If TOTP didn't match, try backup codes
        if not verified and totp_record.backup_codes:
            for i, hashed_code in enumerate(totp_record.backup_codes):
                if _bcrypt.checkpw(code.encode("utf-8"), hashed_code.encode("utf-8")):
                    # Remove used backup code
                    remaining = list(totp_record.backup_codes)
                    remaining.pop(i)
                    totp_record.backup_codes = remaining
                    verified = True
                    break

        if not verified:
            return None

        totp_record.last_used_at = datetime.now(timezone.utc)
        await self.db.flush()

        return await self._complete_login(user)

    async def list_sessions(self, user_id: uuid.UUID) -> list[dict]:
        """List active sessions."""
        result = await self.db.execute(
            select(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .order_by(UserSession.created_at.desc())
        )
        sessions = result.scalars().all()
        return [
            {
                "id": str(s.id),
                "device_info": s.device_info,
                "ip_address": s.ip_address,
                "auth_method": s.auth_method,
                "created_at": str(s.created_at),
                "last_active_at": str(s.last_active_at) if s.last_active_at else None,
            }
            for s in sessions
        ]
