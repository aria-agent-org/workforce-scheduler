"""FastAPI application factory."""

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import json
import structlog

from packaging.version import Version

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

from app.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import setup_logging
from app.database import engine
from app.middleware.metrics import PrometheusMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security import SecurityHeadersMiddleware
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
from app.routers import resources as resources_router
from app.routers import integrations as integrations_router
from app.routers import help_topics as help_topics_router
from app.routers import import_wizard as import_wizard_router
from app.routers import channels_admin as channels_admin_router
from app.routers import onboarding as onboarding_router
from app.routers import integration_settings as integration_settings_router
from app.routers import activity_feed as activity_feed_router
from app.routers import gps_checkin as gps_checkin_router
from app.routers import compliance as compliance_router
from app.routers import notification_templates as notification_templates_router
from app.routers import chat as chat_router
from app.routers import outgoing_webhooks as outgoing_webhooks_router
from app.routers import calendar_sync as calendar_sync_router
from app.routers import data_export as data_export_router
from app.routers import analytics as analytics_router
from app.routers import kiosk as kiosk_router
from app.routers import sso as sso_router
from app.websockets.manager import manager as ws_manager

settings = get_settings()

API_VERSION = "0.2.0"


class APIVersionMiddleware(BaseHTTPMiddleware):
    """Add X-API-Version header to all responses and handle deprecation."""

    async def dispatch(
        self, request: StarletteRequest, call_next: RequestResponseEndpoint
    ) -> StarletteResponse:
        response = await call_next(request)
        response.headers["X-API-Version"] = API_VERSION
        # Deprecation: if client requests an older version, signal deprecation
        requested_version = request.query_params.get("version")
        if requested_version:
            try:
                if Version(requested_version) < Version(API_VERSION):
                    response.headers["Deprecation"] = "true"
            except Exception:
                pass  # Ignore invalid version strings
        return response

# Configure structlog
setup_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    logger.info("starting_api", version="0.2.0")
    # Security: warn about default secret key
    if "INSECURE-DEFAULT" in settings.secret_key or "change" in settings.secret_key.lower():
        logger.warning(
            "insecure_secret_key",
            hint="Set SECRET_KEY environment variable to a random 64-char string in production.",
        )
    yield
    logger.info("shutting_down_api")
    await engine.dispose()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    # Sentry error tracking (optional)
    if settings.sentry_dsn:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
        )

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

    # API versioning header middleware
    app.add_middleware(APIVersionMiddleware)

    # Security headers middleware
    app.add_middleware(SecurityHeadersMiddleware)

    # Rate limiting middleware (Redis-backed)
    redis_client = None
    try:
        import redis.asyncio as aioredis
        redis_client = aioredis.from_url(
            f"redis://{settings.redis_host}:{settings.redis_port}/{settings.redis_db}",
            decode_responses=True,
        )
    except Exception:
        logger.warning("redis_unavailable_for_rate_limiting", hint="Rate limiting disabled")
    app.add_middleware(
        RateLimitMiddleware,
        redis_client=redis_client,
        max_requests=100,
        window_seconds=60,
    )

    # Prometheus metrics middleware (outermost — captures all requests)
    app.add_middleware(PrometheusMiddleware)

    # Tenant extraction middleware
    app.add_middleware(TenantMiddleware)

    # ── Exception Handlers (Spec Section 15) ──────────────────
    @app.exception_handler(AppError)
    async def app_error_handler(request: FastAPIRequest, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                    "retryable": exc.is_retryable,
                }
            },
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: FastAPIRequest, exc: Exception) -> JSONResponse:
        """Catch-all handler: NEVER leak stack traces or internal details to the client."""
        logger.error(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            error=str(exc),
            exc_info=True,
        )
        # In debug mode, show the error message; in production, hide it
        if settings.debug:
            detail = str(exc)
        else:
            detail = "שגיאה פנימית בשרת. נסה שוב מאוחר יותר."
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": detail}},
        )

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
    app.include_router(
        resources_router.router,
        prefix="/api/v1/{tenant_slug}/resources",
        tags=["resources"],
    )
    app.include_router(
        integrations_router.router,
        prefix="/api/v1/{tenant_slug}/integrations",
        tags=["integrations"],
    )
    app.include_router(
        help_topics_router.router,
        prefix="/api/v1/{tenant_slug}/help-topics",
        tags=["help-topics"],
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

    # Import Wizard
    app.include_router(
        import_wizard_router.router,
        prefix="/api/v1/{tenant_slug}/import",
        tags=["import-wizard"],
    )

    # Communication Channels Admin
    app.include_router(
        channels_admin_router.router,
        prefix="/api/v1/{tenant_slug}/channels",
        tags=["channels-admin"],
    )

    # Onboarding progress (per-user wizard state)
    app.include_router(
        onboarding_router.router,
        prefix="/api/v1/{tenant_slug}/onboarding",
        tags=["onboarding"],
    )

    # Integration settings (admin — configure Telegram, WhatsApp, SMTP etc.)
    app.include_router(
        integration_settings_router.router,
        tags=["admin-integrations"],
    )

    # Activity feed (per-tenant dashboard events)
    app.include_router(
        activity_feed_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["activity-feed"],
    )

    # GPS check-in/out (time clock with location)
    app.include_router(
        gps_checkin_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["gps-checkin"],
    )

    # Compliance engine (work law validation)
    app.include_router(
        compliance_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["compliance"],
    )

    # Notification templates editor
    app.include_router(
        notification_templates_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["notification-templates"],
    )

    # In-app chat
    app.include_router(
        chat_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["chat"],
    )

    # Outgoing webhooks
    app.include_router(
        outgoing_webhooks_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["outgoing-webhooks"],
    )

    # Calendar sync / ICS export
    app.include_router(
        calendar_sync_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["calendar"],
    )

    # Data export (GDPR)
    app.include_router(
        data_export_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["data-export"],
    )

    # Analytics dashboard
    app.include_router(
        analytics_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["analytics"],
    )

    # Kiosk mode (no auth for check-in)
    app.include_router(
        kiosk_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["kiosk"],
    )

    # SSO (Google OAuth, SAML)
    app.include_router(
        sso_router.router,
        prefix="/api/v1/{tenant_slug}",
        tags=["sso"],
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

    # Store manager on app state for backward-compat access from routers
    app.state.ws_manager = ws_manager
    # Legacy alias so existing code using app.state.broadcast_event still works
    app.state.broadcast_event = lambda tenant_slug, event: ws_manager.broadcast_to_tenant(
        tenant_slug, event.get("type", "unknown"), {k: v for k, v in event.items() if k != "type"}
    )
    app.state.ws_connections = ws_manager.active_connections

    @app.websocket("/ws/{tenant_slug}")
    async def websocket_endpoint(websocket: WebSocket, tenant_slug: str):
        """
        WebSocket endpoint for real-time events.
        Client sends: {"type": "subscribe", "rooms": ["missions_2026-05-20", "swaps"]}
        Server responds with events: mission.created, mission.updated, assignment.changed, etc.
        """
        await ws_manager.connect(websocket, tenant_slug)
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
                elif msg_type == "user.editing":
                    # Broadcast editing indicator to other clients
                    await ws_manager.broadcast_to_tenant(tenant_slug, "user.editing", {
                        "entity_type": msg.get("entity_type"),
                        "entity_id": msg.get("entity_id"),
                        "user_id": msg.get("user_id"),
                        "user_name": msg.get("user_name"),
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}",
                    })
        except WebSocketDisconnect:
            await ws_manager.disconnect(websocket, tenant_slug)

    return app


app = create_app()
