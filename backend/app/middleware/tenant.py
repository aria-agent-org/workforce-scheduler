"""Tenant extraction middleware."""

import re
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# Pattern: /api/v1/{tenant_slug}/...
TENANT_PATH_RE = re.compile(r"^/api/v1/([a-zA-Z0-9_-]+)/")


class TenantMiddleware(BaseHTTPMiddleware):
    """Extract tenant slug from URL path and set it in request state."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        match = TENANT_PATH_RE.match(request.url.path)
        request.state.tenant_slug = match.group(1) if match else None
        response = await call_next(request)
        return response
