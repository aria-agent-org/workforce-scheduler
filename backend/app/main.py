"""FastAPI application factory."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine
from app.middleware.tenant import TenantMiddleware
from app.routers import auth, admin, health, employees, scheduling, attendance, rules, notifications, reports
from app.routers import settings as settings_router
from app.routers import audit as audit_router
from app.routers import invitations as invitations_router

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    logger.info("Starting Shavtzak API...")
    yield
    logger.info("Shutting down Shavtzak API...")
    await engine.dispose()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="שבצק — Shavtzak API",
        description="Multi-Tenant Workforce Scheduling System",
        version="0.2.0",
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Tenant extraction middleware
    app.add_middleware(TenantMiddleware)

    # Routers
    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(admin.router, prefix="/admin", tags=["admin"])
    app.include_router(
        employees.router,
        prefix="/api/v1/{tenant_slug}/employees",
        tags=["employees"],
    )
    app.include_router(
        scheduling.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["scheduling"],
    )
    app.include_router(
        attendance.router,
        prefix="/api/v1/{tenant_slug}/attendance",
        tags=["attendance"],
    )
    app.include_router(
        rules.router,
        prefix="/api/v1/{tenant_slug}/rules",
        tags=["rules"],
    )
    app.include_router(
        notifications.router,
        prefix="/api/v1/{tenant_slug}/notifications",
        tags=["notifications"],
    )
    app.include_router(
        reports.router,
        prefix="/api/v1/{tenant_slug}/reports",
        tags=["reports"],
    )
    app.include_router(
        settings_router.router,
        prefix="/api/v1/{tenant_slug}/settings",
        tags=["settings"],
    )
    app.include_router(
        audit_router.router,
        prefix="/api/v1/{tenant_slug}/audit-logs",
        tags=["audit"],
    )
    app.include_router(
        invitations_router.router,
        prefix="/api/v1/{tenant_slug}/invitations",
        tags=["invitations"],
    )

    return app


app = create_app()
