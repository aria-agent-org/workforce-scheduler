"""Security headers middleware — enterprise/military-grade.

Adds standard security headers to every HTTP response:
- Content-Security-Policy (strict)
- X-Frame-Options (DENY)
- X-Content-Type-Options (nosniff)
- Strict-Transport-Security (HSTS)
- Referrer-Policy
- Permissions-Policy
- X-XSS-Protection (legacy browsers)
- Cache-Control for sensitive responses
"""

import os

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject security headers into all responses."""

    def __init__(self, app, **kwargs):
        super().__init__(app, **kwargs)
        # HSTS: 1 year, include subdomains, allow preload
        self.hsts_value = "max-age=31536000; includeSubDomains; preload"
        # In debug mode, relax CSP for hot-reload
        debug = os.getenv("DEBUG", "false").lower() in ("1", "true", "yes")
        if debug:
            self.csp = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self' data:; "
                "connect-src 'self' ws: wss:; "
                "frame-ancestors 'none'"
            )
        else:
            self.csp = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; "
                "font-src 'self'; "
                "connect-src 'self' wss:; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'; "
                "upgrade-insecure-requests"
            )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # Core security headers
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-XSS-Protection", "1; mode=block")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        response.headers.setdefault("Content-Security-Policy", self.csp)
        response.headers.setdefault("Strict-Transport-Security", self.hsts_value)

        # Prevent caching of API responses with sensitive data
        if request.url.path.startswith("/api/") or request.url.path.startswith("/auth/"):
            response.headers.setdefault("Cache-Control", "no-store, no-cache, must-revalidate, private")
            response.headers.setdefault("Pragma", "no-cache")

        # Remove server identification
        if "server" in response.headers:
            del response.headers["server"]

        return response
