"""Health check and metrics endpoints."""

import time
from datetime import datetime, timezone

import aioredis
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.schemas.common import HealthResponse, DetailedHealthResponse

router = APIRouter()

API_VERSION = "0.2.0"


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Basic health check matching spec: status, db, redis, version."""
    settings = get_settings()

    # DB check
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    # Redis check
    redis_status = "ok"
    try:
        r = aioredis.from_url(
            f"redis://{settings.redis_host}:{settings.redis_port}/{settings.redis_db}",
            socket_connect_timeout=2,
        )
        await r.ping()
        await r.close()
    except Exception:
        redis_status = "error"

    overall = "ok" if db_status == "ok" and redis_status == "ok" else "degraded"

    return HealthResponse(
        status=overall,
        db=db_status,
        redis=redis_status,
        version=API_VERSION,
    )


@router.get("/health/detailed", response_model=DetailedHealthResponse)
async def health_detailed(db: AsyncSession = Depends(get_db)) -> DetailedHealthResponse:
    """Detailed health with per-service latency (DB, Redis, Celery)."""
    settings = get_settings()
    services: dict = {}

    # DB ping with latency
    try:
        t0 = time.monotonic()
        await db.execute(text("SELECT 1"))
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        services["db"] = {"status": "ok", "latency_ms": latency_ms}
    except Exception as e:
        services["db"] = {"status": "error", "error": str(e)}

    # Redis ping with latency
    try:
        r = aioredis.from_url(
            f"redis://{settings.redis_host}:{settings.redis_port}/{settings.redis_db}",
            socket_connect_timeout=2,
        )
        t0 = time.monotonic()
        await r.ping()
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        await r.close()
        services["redis"] = {"status": "ok", "latency_ms": latency_ms}
    except Exception as e:
        services["redis"] = {"status": "error", "error": str(e)}

    # Celery ping via Redis broker
    try:
        from celery import Celery
        t0 = time.monotonic()
        celery_app = Celery(broker=settings.celery_broker_url)
        inspector = celery_app.control.inspect(timeout=2)
        ping_result = inspector.ping()
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        if ping_result:
            services["celery"] = {
                "status": "ok",
                "latency_ms": latency_ms,
                "workers": len(ping_result),
            }
        else:
            services["celery"] = {"status": "no_workers", "latency_ms": latency_ms}
    except Exception as e:
        services["celery"] = {"status": "error", "error": str(e)}

    all_ok = all(s.get("status") == "ok" for s in services.values())
    return DetailedHealthResponse(
        status="ok" if all_ok else "degraded",
        version=API_VERSION,
        services=services,
    )


@router.get("/ready", response_model=HealthResponse)
async def readiness_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Readiness check — verifies database connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        return HealthResponse(
            status="ready",
            version=API_VERSION,
            timestamp=datetime.now(timezone.utc),
        )
    except Exception as e:
        return HealthResponse(
            status=f"not_ready: {str(e)}",
            version=API_VERSION,
            timestamp=datetime.now(timezone.utc),
        )


@router.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics() -> PlainTextResponse:
    """Expose Prometheus metrics."""
    return PlainTextResponse(
        content=generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )
