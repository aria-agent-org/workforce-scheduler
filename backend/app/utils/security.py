"""Security utilities: token generation, hashing, XSS prevention."""

import re
import html
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


# ─── XSS Prevention ──────────────────────────────

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def sanitize_text(value: str) -> str:
    """Sanitize a text value to prevent stored XSS.

    - Strip HTML tags
    - HTML-encode special characters
    - Strip null bytes
    """
    if not value:
        return value
    value = value.replace("\x00", "")
    value = _HTML_TAG_RE.sub("", value)
    value = html.escape(value, quote=True)
    value = value.replace("&amp;", "&").replace("&#x27;", "'")
    return value


def sanitize_dict_values(data: dict) -> dict:
    """Recursively sanitize all string values in a dict."""
    if not isinstance(data, dict):
        return data
    result = {}
    for k, v in data.items():
        if isinstance(v, str):
            result[k] = sanitize_text(v)
        elif isinstance(v, dict):
            result[k] = sanitize_dict_values(v)
        elif isinstance(v, list):
            result[k] = [
                sanitize_dict_values(item) if isinstance(item, dict)
                else sanitize_text(item) if isinstance(item, str)
                else item
                for item in v
            ]
        else:
            result[k] = v
    return result
