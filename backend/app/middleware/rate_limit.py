"""Redis-based rate limiting middleware with auth-specific rules."""

import json
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Auth-specific rate limit rules
AUTH_RATE_LIMITS = {
    "/api/auth/login": {
        "max_requests": 5,
        "window_seconds": 900,  # 15 min
        "key_fields": ["ip", "email"],
        "lockout_threshold": 10,
        "lockout_seconds": 1800,  # 30 min
        "detail_he": "חריגה ממספר ניסיונות ההתחברות. נסה שוב בעוד 15 דקות",
    },
    "/api/auth/magic-link": {
        "max_requests": 3,
        "window_seconds": 3600,  # 1 hour
        "key_fields": ["email"],
        "detail_he": "חריגה ממספר בקשות הקישור. נסה שוב בעוד שעה",
    },
    "/api/auth/2fa/verify": {
        "max_requests": 5,
        "window_seconds": 900,  # 15 min
        "key_fields": ["ip"],
        "lockout_threshold": 5,
        "lockout_seconds": 1800,  # 30 min
        "detail_he": "חשבון נעול עקב ניסיונות אימות חוזרים. נסה שוב בעוד 30 דקות",
    },
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter backed by Redis.

    Generic rate limiting on all endpoints plus stricter rules for auth endpoints.
    """

    def __init__(self, app, redis_client=None, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.redis = redis_client
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if self.redis is None:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Check auth-specific rate limits first (POST only)
        if request.method == "POST":
            auth_rule = AUTH_RATE_LIMITS.get(path)
            if auth_rule:
                blocked = await self._check_auth_rate_limit(
                    request, client_ip, path, auth_rule
                )
                if blocked:
                    return blocked

        # Generic rate limit
        key = f"rate_limit:{client_ip}:{path}"
        now = time.time()

        try:
            pipe = self.redis.pipeline()
            pipe.zremrangebyscore(key, 0, now - self.window_seconds)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, self.window_seconds)
            results = await pipe.execute()
            request_count = results[2]
        except Exception:
            logger.warning("Rate limit Redis error, allowing request")
            return await call_next(request)

        if request_count > self.max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "בקשות רבות מדי. נסה שוב מאוחר יותר"},
                headers={"Retry-After": str(self.window_seconds)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(
            max(0, self.max_requests - request_count)
        )
        return response

    async def _check_auth_rate_limit(
        self, request: Request, client_ip: str, path: str, rule: dict
    ) -> JSONResponse | None:
        """Check auth-specific rate limits. Returns JSONResponse if blocked, None if OK."""
        max_req = rule["max_requests"]
        window = rule["window_seconds"]
        key_fields = rule.get("key_fields", ["ip"])
        lockout_threshold = rule.get("lockout_threshold")
        lockout_seconds = rule.get("lockout_seconds", 1800)
        detail_he = rule.get("detail_he", "חריגה ממגבלת בקשות")

        # Extract email from body if needed
        email = None
        if "email" in key_fields:
            try:
                body = await request.body()
                body_json = json.loads(body) if body else {}
                email = body_json.get("email", "")
            except Exception:
                email = ""

        now = time.time()

        try:
            # Check account lockout first
            if lockout_threshold:
                lockout_key = f"auth_lockout:{path}:{client_ip}"
                if email:
                    lockout_key += f":{email}"
                is_locked = await self.redis.get(lockout_key)
                if is_locked:
                    ttl = await self.redis.ttl(lockout_key)
                    return JSONResponse(
                        status_code=429,
                        content={"detail": detail_he},
                        headers={"Retry-After": str(max(ttl, 0))},
                    )

            # Build rate limit keys based on key_fields
            keys_to_check = []
            if "ip" in key_fields:
                keys_to_check.append(f"auth_rl:{path}:ip:{client_ip}")
            if "email" in key_fields and email:
                keys_to_check.append(f"auth_rl:{path}:email:{email}")

            for key in keys_to_check:
                pipe = self.redis.pipeline()
                pipe.zremrangebyscore(key, 0, now - window)
                pipe.zadd(key, {str(now): now})
                pipe.zcard(key)
                pipe.expire(key, window)
                results = await pipe.execute()
                request_count = results[2]

                if request_count > max_req:
                    # Set lockout if threshold exceeded
                    if lockout_threshold and request_count >= lockout_threshold:
                        lockout_key = f"auth_lockout:{path}:{client_ip}"
                        if email:
                            lockout_key += f":{email}"
                        await self.redis.setex(lockout_key, lockout_seconds, "1")
                        logger.warning(
                            "Account lockout: path=%s ip=%s email=%s for %ds",
                            path, client_ip, email or "N/A", lockout_seconds,
                        )

                    return JSONResponse(
                        status_code=429,
                        content={"detail": detail_he},
                        headers={"Retry-After": str(window)},
                    )

        except Exception:
            logger.warning("Auth rate limit Redis error, allowing request")

        return None
