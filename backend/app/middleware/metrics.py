"""Prometheus metrics middleware for FastAPI."""

import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from prometheus_client import Counter, Histogram, Gauge


# ── Metrics ──────────────────────────────────────────────────────────────────

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

http_requests_in_progress = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests currently being processed",
)


# ── Helpers ──────────────────────────────────────────────────────────────────

# Paths to exclude from metrics (health checks, metrics itself)
_EXCLUDE_PATHS = frozenset({"/metrics", "/health", "/ready"})


def _normalize_path(path: str) -> str:
    """Collapse path IDs to reduce cardinality.

    e.g.  /api/v1/employees/123  →  /api/v1/employees/:id
    """
    parts = path.rstrip("/").split("/")
    normalised = []
    for part in parts:
        if part.isdigit():
            normalised.append(":id")
        else:
            normalised.append(part)
    return "/".join(normalised) or "/"


# ── Middleware ───────────────────────────────────────────────────────────────

class PrometheusMiddleware(BaseHTTPMiddleware):
    """Collect request count, duration, and in-progress gauge."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.url.path in _EXCLUDE_PATHS:
            return await call_next(request)

        method = request.method
        path = _normalize_path(request.url.path)

        http_requests_in_progress.inc()
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            http_requests_total.labels(method=method, path=path, status="500").inc()
            http_requests_in_progress.dec()
            raise

        duration = time.perf_counter() - start
        status = str(response.status_code)

        http_requests_total.labels(method=method, path=path, status=status).inc()
        http_request_duration_seconds.labels(method=method, path=path).observe(duration)
        http_requests_in_progress.dec()

        return response
