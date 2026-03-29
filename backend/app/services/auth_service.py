"""Authentication service: JWT, password hashing, session management."""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from jose import jwt
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.resource import RoleDefinition
from app.models.tenant import Tenant
from app.models.user import User, UserSession
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
        """Authenticate a user and return tokens + user info."""
        result = await self.db.execute(
            select(User).where(User.email == email, User.is_active.is_(True))
        )
        user = result.scalar_one_or_none()
        if not user or not user.password_hash:
            return None
        if not self.verify_password(password, user.password_hash):
            return None

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
        """Send password reset email (placeholder)."""
        # In production: generate token, send via SES/SMTP
        pass

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
