"""WebSocket connection manager for real-time event broadcasting."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# All supported event types (Spec Section 13)
WS_EVENT_TYPES = [
    # Missions
    "mission.created",
    "mission.updated",
    "mission.cancelled",
    "mission.approved",
    # Assignments
    "assignment.changed",
    "assignment.created",
    "assignment.removed",
    # Swaps
    "swap.requested",
    "swap.approved",
    "swap.rejected",
    "swap.status_changed",
    # Schedule windows
    "schedule_window.status_changed",
    # Real-time collaboration
    "user.editing",
    # System events
    "conflict.detected",
    "notification.sent",
    "sheets.synced",
]


class ConnectionManager:
    """Manages WebSocket connections per tenant for real-time broadcasting."""

    def __init__(self) -> None:
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, tenant_slug: str) -> None:
        """Accept and register a WebSocket connection for a tenant."""
        await websocket.accept()
        self.active_connections.setdefault(tenant_slug, set()).add(websocket)
        logger.info("WebSocket connected for tenant: %s", tenant_slug)

    async def disconnect(self, websocket: WebSocket, tenant_slug: str) -> None:
        """Remove a WebSocket connection for a tenant."""
        connections = self.active_connections.get(tenant_slug, set())
        connections.discard(websocket)
        logger.info("WebSocket disconnected for tenant: %s", tenant_slug)

    async def broadcast_to_tenant(
        self, tenant_slug: str, event_type: str, data: dict[str, Any]
    ) -> None:
        """Broadcast a JSON event to all WebSocket clients for a tenant."""
        connections = self.active_connections.get(tenant_slug, set())
        if not connections:
            return

        message = {"type": event_type, **data}
        dead: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            connections.discard(ws)


# Singleton instance — importable from routers
manager = ConnectionManager()
