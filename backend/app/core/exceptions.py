"""Standardized application exceptions (Spec Section 15).

All error responses follow:
    {"error": {"code": "...", "message": "...", "details": {}, "retryable": false}}
"""

from __future__ import annotations


class AppError(Exception):
    """Base application error with bilingual message and structured details."""

    def __init__(
        self,
        code: str,
        message: dict,
        http_status: int = 400,
        details: dict | None = None,
        is_retryable: bool = False,
    ):
        self.code = code
        self.message = message  # {"he": "...", "en": "..."}
        self.http_status = http_status
        self.details = details or {}
        self.is_retryable = is_retryable
        super().__init__(message.get("he") or message.get("en", code))


class ValidationError(AppError):
    """Input / schema validation failure (422)."""

    def __init__(self, code: str = "VALIDATION_ERROR", **kwargs):
        kwargs.setdefault("http_status", 422)
        super().__init__(code=code, **kwargs)


class ConflictError(AppError):
    """Resource conflict (409)."""

    def __init__(self, code: str = "CONFLICT", **kwargs):
        kwargs.setdefault("http_status", 409)
        super().__init__(code=code, **kwargs)


class PermissionError(AppError):
    """Forbidden — insufficient permissions (403)."""

    def __init__(self, code: str = "FORBIDDEN", **kwargs):
        kwargs.setdefault("http_status", 403)
        super().__init__(code=code, **kwargs)


class NotFoundError(AppError):
    """Resource not found (404)."""

    def __init__(self, code: str = "NOT_FOUND", **kwargs):
        kwargs.setdefault("http_status", 404)
        super().__init__(code=code, **kwargs)


class RateLimitError(AppError):
    """Too many requests (429)."""

    def __init__(self, code: str = "RATE_LIMITED", **kwargs):
        kwargs.setdefault("http_status", 429)
        kwargs.setdefault("is_retryable", True)
        super().__init__(code=code, **kwargs)


class ExternalServiceError(AppError):
    """Upstream / external service failure (502)."""

    def __init__(self, code: str = "EXTERNAL_ERROR", **kwargs):
        kwargs.setdefault("http_status", 502)
        kwargs.setdefault("is_retryable", True)
        super().__init__(code=code, **kwargs)
