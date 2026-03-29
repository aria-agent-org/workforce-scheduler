"""Authentication tests."""

import pytest
from httpx import AsyncClient

from app.services.auth_service import AuthService


def test_password_hashing() -> None:
    """Test password hash and verify."""
    password = "SecurePassword123!"
    hashed = AuthService.hash_password(password)
    assert hashed != password
    assert AuthService.verify_password(password, hashed)
    assert not AuthService.verify_password("wrong", hashed)


def test_access_token_creation() -> None:
    """Test JWT access token creation."""
    import uuid

    user_id = uuid.uuid4()
    token, expires_in = AuthService.create_access_token(user_id)
    assert isinstance(token, str)
    assert len(token) > 0
    assert expires_in > 0


def test_refresh_token_creation() -> None:
    """Test JWT refresh token creation."""
    import uuid

    user_id = uuid.uuid4()
    token = AuthService.create_refresh_token(user_id)
    assert isinstance(token, str)
    assert len(token) > 0


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient) -> None:
    """Test login with invalid credentials returns 401."""
    response = await client.post(
        "/auth/login",
        json={"email": "nobody@test.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_unauthorized(client: AsyncClient) -> None:
    """Test /auth/me without token returns 401."""
    response = await client.get("/auth/me")
    assert response.status_code == 401
