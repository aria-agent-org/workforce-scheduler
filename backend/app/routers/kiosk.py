"""Kiosk mode router — tablet check-in at entrance."""

import logging
import time
from collections import defaultdict
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.employee import Employee
from app.models.scheduling import Mission, MissionAssignment
from app.models.gps_checkin import GpsCheckin
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["kiosk"])

# ─── Simple In-Memory Rate Limiter ────────────────
# Max 30 requests per minute per IP for kiosk endpoints
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 30
_RATE_WINDOW = 60  # seconds


def _check_rate_limit(request: Request):
    """Raise 429 if IP exceeds rate limit."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    # Clean old entries
    _rate_limit_store[ip] = [t for t in _rate_limit_store[ip] if now - t < _RATE_WINDOW]
    if len(_rate_limit_store[ip]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="יותר מדי בקשות. נסה שוב בעוד דקה.")
    _rate_limit_store[ip].append(now)
    # Periodic cleanup of stale IPs (every ~100 requests)
    if len(_rate_limit_store) > 1000:
        stale = [k for k, v in _rate_limit_store.items() if not v or now - v[-1] > 300]
        for k in stale:
            del _rate_limit_store[k]


class KioskCheckinRequest(BaseModel):
    employee_number: str
    pin: str | None = None


@router.post("/kiosk/checkin", dependencies=[Depends(_check_rate_limit)])
async def kiosk_checkin(
    body: KioskCheckinRequest,
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Kiosk check-in — employee types their number or scans QR.
    No auth required (kiosk endpoint) — but tenant slug required.
    """
    # Find employee by number
    result = await db.execute(
        select(Employee).where(
            Employee.tenant_id == tenant.id,
            Employee.employee_number == body.employee_number,
            Employee.is_active.is_(True),
        )
    )
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(status_code=404, detail="חייל לא נמצא")

    # Find today's assignment
    today = datetime.now(timezone.utc).date()
    assign_result = await db.execute(
        select(Mission)
        .join(MissionAssignment, MissionAssignment.mission_id == Mission.id)
        .where(
            Mission.tenant_id == tenant.id,
            Mission.date == today,
            MissionAssignment.employee_id == employee.id,
        )
        .limit(1)
    )
    today_mission = assign_result.scalar_one_or_none()

    # Record check-in
    checkin = GpsCheckin(
        tenant_id=tenant.id,
        employee_id=employee.id,
        mission_id=today_mission.id if today_mission else None,
        check_type="in",
        latitude=0,
        longitude=0,
        is_within_geofence=True,
        device_info="kiosk",
    )
    db.add(checkin)
    await db.commit()

    return {
        "employee_name": employee.full_name,
        "employee_number": employee.employee_number,
        "mission": today_mission.name if today_mission else None,
        "timestamp": checkin.created_at.isoformat(),
        "message": f"שלום {employee.full_name}! נרשמת בהצלחה ✅",
    }


@router.get("/kiosk/today-board", dependencies=[Depends(_check_rate_limit)])
async def kiosk_today_board(
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Get today's board for kiosk display — no auth needed.
    Shows missions and who's assigned.
    """
    today = datetime.now(timezone.utc).date()

    result = await db.execute(
        select(Mission)
        .where(
            Mission.tenant_id == tenant.id,
            Mission.date == today,
        )
        .order_by(Mission.start_time)
    )
    missions = result.scalars().all()

    board = []
    for mission in missions:
        assign_result = await db.execute(
            select(MissionAssignment, Employee)
            .join(Employee, Employee.id == MissionAssignment.employee_id)
            .where(MissionAssignment.mission_id == mission.id)
        )
        assignments = assign_result.all()

        board.append({
            "id": str(mission.id),
            "name": mission.name,
            "start_time": str(mission.start_time) if mission.start_time else None,
            "end_time": str(mission.end_time) if mission.end_time else None,
            "soldiers": [
                {
                    "name": emp.full_name,
                    "number": emp.employee_number,
                }
                for _, emp in assignments
            ],
        })

    return {
        "date": str(today),
        "tenant_name": tenant.name,
        "missions": board,
    }
