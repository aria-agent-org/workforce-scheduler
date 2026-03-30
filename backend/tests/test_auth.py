"""Authentication service unit tests — password, JWT, 2FA, backup codes."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import bcrypt
import pyotp
import pytest
from jose import jwt

from app.services.auth_service import AuthService


# ---------------------------------------------------------------------------
# Password hashing / verification
# ---------------------------------------------------------------------------

class TestPasswordHashing:
    def test_hash_returns_different_string(self):
        hashed = AuthService.hash_password("secret123")
        assert hashed != "secret123"
        assert hashed.startswith("$2")

    def test_verify_correct_password(self):
        hashed = AuthService.hash_password("mypassword")
        assert AuthService.verify_password("mypassword", hashed) is True

    def test_verify_wrong_password(self):
        hashed = AuthService.hash_password("mypassword")
        assert AuthService.verify_password("wrong", hashed) is False

    def test_different_passwords_different_hashes(self):
        h1 = AuthService.hash_password("pass1")
        h2 = AuthService.hash_password("pass2")
        assert h1 != h2

    def test_same_password_different_salts(self):
        h1 = AuthService.hash_password("same")
        h2 = AuthService.hash_password("same")
        assert h1 != h2  # bcrypt uses random salt

    def test_unicode_password(self):
        hashed = AuthService.hash_password("סיסמה123!")
        assert AuthService.verify_password("סיסמה123!", hashed) is True

    def test_empty_password(self):
        hashed = AuthService.hash_password("")
        assert AuthService.verify_password("", hashed) is True
        assert AuthService.verify_password("x", hashed) is False


# ---------------------------------------------------------------------------
# JWT token creation / validation
# ---------------------------------------------------------------------------

class TestJWTTokens:
    @patch("app.services.auth_service.settings")
    def test_access_token_structure(self, mock_settings):
        mock_settings.jwt_access_token_expire_minutes = 15
        mock_settings.secret_key = "test-secret-key-for-unit-tests"

        user_id = uuid.uuid4()
        token, expires_in = AuthService.create_access_token(user_id)

        assert isinstance(token, str)
        assert expires_in == 15 * 60

        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])
        assert payload["sub"] == str(user_id)
        assert payload["type"] == "access"
        assert "exp" in payload

    @patch("app.services.auth_service.settings")
    def test_refresh_token_structure(self, mock_settings):
        mock_settings.jwt_refresh_token_expire_days = 7
        mock_settings.secret_key = "test-secret-key-for-unit-tests"

        user_id = uuid.uuid4()
        token = AuthService.create_refresh_token(user_id)

        payload = jwt.decode(token, "test-secret-key-for-unit-tests", algorithms=["HS256"])
        assert payload["sub"] == str(user_id)
        assert payload["type"] == "refresh"
        assert "jti" in payload  # unique token ID

    @patch("app.services.auth_service.settings")
    def test_access_token_different_users_different_tokens(self, mock_settings):
        mock_settings.jwt_access_token_expire_minutes = 15
        mock_settings.secret_key = "test-secret-key-for-unit-tests"

        t1, _ = AuthService.create_access_token(uuid.uuid4())
        t2, _ = AuthService.create_access_token(uuid.uuid4())
        assert t1 != t2

    @patch("app.services.auth_service.settings")
    def test_temp_2fa_token_roundtrip(self, mock_settings):
        mock_settings.secret_key = "test-secret-key-for-unit-tests"

        user_id = uuid.uuid4()
        token = AuthService.create_temp_2fa_token(user_id)
        recovered = AuthService.verify_temp_2fa_token(token)
        assert recovered == user_id

    @patch("app.services.auth_service.settings")
    def test_temp_2fa_invalid_token(self, mock_settings):
        mock_settings.secret_key = "test-secret-key-for-unit-tests"

        result = AuthService.verify_temp_2fa_token("garbage.token.here")
        assert result is None

    @patch("app.services.auth_service.settings")
    def test_temp_2fa_wrong_type_rejected(self, mock_settings):
        """An access token should not pass as 2FA temp token."""
        mock_settings.secret_key = "test-secret-key-for-unit-tests"
        mock_settings.jwt_access_token_expire_minutes = 15

        user_id = uuid.uuid4()
        access_token, _ = AuthService.create_access_token(user_id)
        result = AuthService.verify_temp_2fa_token(access_token)
        assert result is None


# ---------------------------------------------------------------------------
# 2FA / TOTP verification logic
# ---------------------------------------------------------------------------

class TestTOTPVerification:
    def test_totp_code_valid(self):
        """A freshly generated TOTP code should verify."""
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        code = totp.now()
        assert totp.verify(code, valid_window=1) is True

    def test_totp_code_wrong(self):
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        assert totp.verify("000000", valid_window=1) is False

    def test_totp_provisioning_uri(self):
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name="user@test.com", issuer_name="שבצק")
        assert "otpauth://totp/" in uri
        assert secret in uri


# ---------------------------------------------------------------------------
# Backup code logic
# ---------------------------------------------------------------------------

class TestBackupCodes:
    def test_backup_code_hash_and_verify(self):
        """Backup codes are hashed with bcrypt; verify one."""
        plain = "a1b2c3d4"
        hashed = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        assert bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

    def test_backup_code_wrong_code(self):
        plain = "a1b2c3d4"
        hashed = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        assert not bcrypt.checkpw(b"wrong", hashed.encode("utf-8"))

    def test_backup_code_consumption_removes_from_list(self):
        """Simulate consuming a backup code (pop from list)."""
        codes = ["aaa", "bbb", "ccc"]
        hashed_codes = [
            bcrypt.hashpw(c.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            for c in codes
        ]

        code_to_use = "bbb"
        remaining = list(hashed_codes)
        consumed = False
        for i, hc in enumerate(hashed_codes):
            if bcrypt.checkpw(code_to_use.encode("utf-8"), hc.encode("utf-8")):
                remaining.pop(i)
                consumed = True
                break

        assert consumed is True
        assert len(remaining) == 2

    def test_each_backup_code_unique_hash(self):
        """Same plaintext code hashes differently each time."""
        plain = "deadbeef"
        h1 = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        h2 = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        assert h1 != h2
        # But both verify
        assert bcrypt.checkpw(plain.encode("utf-8"), h1.encode("utf-8"))
        assert bcrypt.checkpw(plain.encode("utf-8"), h2.encode("utf-8"))
