"""Audit logging middleware."""

import logging
import time
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("audit")


class AuditMiddleware(BaseHTTPMiddleware):
    """Log all mutating requests for audit trail."""

    MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
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
                    "ip": request.client.host if request.client else "unknown",
                    "elapsed_ms": round(elapsed_ms, 2),
                },
            )

        return response
