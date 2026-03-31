"""Audit logging middleware."""

import logging
import time
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("audit")


def get_real_ip(request: Request) -> str:
    """Extract real client IP from proxy headers, falling back to request.client.host."""
    # Check X-Forwarded-For first (may contain comma-separated list)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # First IP in the chain is the original client
        return forwarded_for.split(",")[0].strip()

    # Check X-Real-IP (set by Nginx)
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # Check CF-Connecting-IP (Cloudflare)
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    # Fallback to direct connection
    return request.client.host if request.client else "unknown"


class AuditMiddleware(BaseHTTPMiddleware):
    """Log all mutating requests for audit trail."""

    MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Store real IP on request.state for use by route handlers
        request.state.real_ip = get_real_ip(request)

        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = (time.monotonic() - start) * 1000

        if request.method in self.MUTATING_METHODS:
            user_id = getattr(request.state, "user_id", "anonymous")
            tenant = getattr(request.state, "tenant_slug", None)
            logger.info(
                "audit",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "user_id": str(user_id),
                    "tenant": tenant,
                    "ip": request.state.real_ip,
                    "elapsed_ms": round(elapsed_ms, 2),
                },
            )

        return response
