"""Kiosk mode router — tablet check-in at entrance."""

import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
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


class KioskCheckinRequest(BaseModel):
    employee_number: str
    pin: str | None = None


@router.post("/kiosk/checkin")
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


@router.get("/kiosk/today-board")
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
