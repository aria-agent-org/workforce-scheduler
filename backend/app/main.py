"""FastAPI application factory."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine
from app.middleware.tenant import TenantMiddleware
from app.routers import auth, admin, health, employees, scheduling, attendance, rules, notifications, reports
from app.routers import settings as settings_router
from app.routers import audit as audit_router
from app.routers import invitations as invitations_router
from app.routers import users as users_router
from app.routers import self_service as self_service_router
from app.routers import registration as registration_router
from app.routers import work_roles as work_roles_router
from app.routers import push as push_router
from app.routers import webhooks as webhooks_router
from app.routers import board as board_router

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
    # Security: warn about default secret key
    if "INSECURE-DEFAULT" in settings.secret_key or "change" in settings.secret_key.lower():
        logger.warning(
            "⚠️  SECURITY WARNING: Using default JWT secret key! "
            "Set SECRET_KEY environment variable to a random 64-char string in production."
        )
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
    app.include_router(
        users_router.router,
        prefix="/api/v1/{tenant_slug}/users",
        tags=["users"],
    )
    app.include_router(
        self_service_router.router,
        prefix="/api/v1/{tenant_slug}/my",
        tags=["self-service"],
    )
    app.include_router(
        registration_router.router,
        prefix="/api/v1/{tenant_slug}/registration",
        tags=["registration"],
    )
    app.include_router(
        work_roles_router.router,
        prefix="/api/v1/{tenant_slug}/work-roles",
        tags=["work-roles"],
    )
    app.include_router(
        push_router.router,
        prefix="/api/v1/{tenant_slug}/push",
        tags=["push-notifications"],
    )

    # Public registration endpoint (no tenant required)
    app.include_router(
        registration_router.router,
        prefix="/auth",
        tags=["auth-registration"],
        include_in_schema=False,
    )

    # Daily Board (employee-facing)
    app.include_router(
        board_router.router,
        prefix="/api/v1/{tenant_slug}/board",
        tags=["board"],
    )

    # Webhooks (WhatsApp / Telegram bots)
    app.include_router(
        webhooks_router.router,
        prefix="/webhooks",
        tags=["webhooks"],
    )



    # ═══════════════════════════════════════════
    # WebSocket — Real-Time (Spec Section 13)
    # ═══════════════════════════════════════════
    @app.websocket("/ws/{tenant_slug}")
    async def websocket_endpoint(websocket: WebSocket, tenant_slug: str):
        """
        WebSocket stub for real-time events.
        Client sends: {"type": "subscribe", "rooms": ["missions_2026-05-20", "swaps"]}
        Server responds with events: mission.created, mission.updated, assignment.changed, etc.
        """
        await websocket.accept()
        logger.info(f"WebSocket connected for tenant: {tenant_slug}")
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                    continue

                msg_type = msg.get("type")
                if msg_type == "subscribe":
                    rooms = msg.get("rooms", [])
                    await websocket.send_json({
                        "type": "subscribed",
                        "rooms": rooms,
                    })
                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}",
                    })
        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected for tenant: {tenant_slug}")

    return app


app = create_app()
