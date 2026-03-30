"""Health check and metrics endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.common import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check."""
    return HealthResponse(
        status="healthy",
        version="0.1.0",
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/ready", response_model=HealthResponse)
async def readiness_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Readiness check — verifies database connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        return HealthResponse(
            status="ready",
            version="0.1.0",
            timestamp=datetime.now(timezone.utc),
        )
    except Exception as e:
        return HealthResponse(
            status=f"not_ready: {str(e)}",
            version="0.1.0",
            timestamp=datetime.now(timezone.utc),
        )


@router.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics() -> PlainTextResponse:
    """Expose Prometheus metrics."""
    return PlainTextResponse(
        content=generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )
