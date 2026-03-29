"""Security utilities: token generation, hashing."""

import secrets
import hashlib


def generate_token(length: int = 64) -> str:
    """Generate a cryptographically secure URL-safe token."""
    return secrets.token_urlsafe(length)


def hash_token(token: str) -> str:
    """Hash a token using SHA-256 (for storage)."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_verification_code(length: int = 6) -> str:
    """Generate a numeric verification code."""
    return "".join(str(secrets.randbelow(10)) for _ in range(length))
