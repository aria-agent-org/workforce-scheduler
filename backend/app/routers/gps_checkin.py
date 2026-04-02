"""GPS check-in/check-out router for time clock."""

import logging
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.gps_checkin import GpsCheckin, Location
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["gps-checkin"])


# --- Schemas ---

class CheckinRequest(BaseModel):
    mission_id: str | None = None
    latitude: float
    longitude: float
    accuracy_meters: float | None = None
    device_info: str | None = None
    notes: str | None = None


class CheckinResponse(BaseModel):
    id: str
    check_type: str
    is_within_geofence: bool
    distance_from_target_m: float | None
    timestamp: str
    message: str


class LocationCreate(BaseModel):
    name: str
    address: str | None = None
    latitude: float
    longitude: float
    geofence_radius_m: int = 200


# --- Helpers ---

def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# --- Endpoints ---

@router.post("/gps/checkin", response_model=CheckinResponse)
async def gps_checkin(
    body: CheckinRequest,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Record a GPS check-in (arrival)."""
    return await _record_check(db, tenant, user, body, "in")


@router.post("/gps/checkout", response_model=CheckinResponse)
async def gps_checkout(
    body: CheckinRequest,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Record a GPS check-out (departure)."""
    return await _record_check(db, tenant, user, body, "out")


@router.get("/gps/status")
async def gps_status(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get current check-in status for the logged-in user."""
    employee_id = user.employee_id
    if not employee_id:
        raise HTTPException(status_code=400, detail="User has no employee profile")

    # Get last check-in/out
    result = await db.execute(
        select(GpsCheckin)
        .where(
            GpsCheckin.tenant_id == tenant.id,
            GpsCheckin.employee_id == employee_id,
        )
        .order_by(desc(GpsCheckin.created_at))
        .limit(1)
    )
    last = result.scalar_one_or_none()

    if not last:
        return {"checked_in": False, "last_action": None}

    return {
        "checked_in": last.check_type == "in",
        "last_action": {
            "type": last.check_type,
            "timestamp": last.created_at.isoformat(),
            "latitude": last.latitude,
            "longitude": last.longitude,
            "is_within_geofence": last.is_within_geofence,
        },
    }


@router.get("/gps/history")
async def gps_history(
    date: str | None = None,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get check-in history for manager view."""
    query = (
        select(GpsCheckin)
        .where(GpsCheckin.tenant_id == tenant.id)
        .order_by(desc(GpsCheckin.created_at))
        .limit(100)
    )

    if date:
        from datetime import date as date_type
        target = date_type.fromisoformat(date)
        query = query.where(func.date(GpsCheckin.created_at) == target)

    result = await db.execute(query)
    checkins = result.scalars().all()

    return {
        "items": [
            {
                "id": str(c.id),
                "employee_id": str(c.employee_id),
                "mission_id": str(c.mission_id) if c.mission_id else None,
                "check_type": c.check_type,
                "latitude": c.latitude,
                "longitude": c.longitude,
                "is_within_geofence": c.is_within_geofence,
                "distance_from_target_m": c.distance_from_target_m,
                "timestamp": c.created_at.isoformat(),
            }
            for c in checkins
        ],
        "total": len(checkins),
    }


# --- Locations management ---

@router.get("/locations")
async def list_locations(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all locations/geofences for this tenant."""
    result = await db.execute(
        select(Location)
        .where(Location.tenant_id == tenant.id, Location.is_active.is_(True))
        .order_by(Location.name)
    )
    locations = result.scalars().all()
    return {
        "items": [
            {
                "id": str(loc.id),
                "name": loc.name,
                "address": loc.address,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "geofence_radius_m": loc.geofence_radius_m,
            }
            for loc in locations
        ]
    }


@router.post("/locations")
async def create_location(
    body: LocationCreate,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Create a new location with geofence."""
    loc = Location(
        tenant_id=tenant.id,
        name=body.name,
        address=body.address,
        latitude=body.latitude,
        longitude=body.longitude,
        geofence_radius_m=body.geofence_radius_m,
    )
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return {"id": str(loc.id), "name": loc.name, "message": "Location created"}


# --- Internal helpers ---

async def _record_check(db, tenant, user, body, check_type):
    """Record a check-in or check-out."""
    from uuid import UUID
    employee_id = user.employee_id
    if not employee_id:
        raise HTTPException(status_code=400, detail="User has no employee profile")

    # Check geofence if mission has a location
    is_within = False
    distance = None

    # Find nearest location
    result = await db.execute(
        select(Location).where(
            Location.tenant_id == tenant.id,
            Location.is_active.is_(True),
        )
    )
    locations = result.scalars().all()

    for loc in locations:
        d = _haversine_distance(body.latitude, body.longitude, loc.latitude, loc.longitude)
        if distance is None or d < distance:
            distance = round(d, 1)
            is_within = d <= loc.geofence_radius_m

    mission_uuid = UUID(body.mission_id) if body.mission_id else None

    checkin = GpsCheckin(
        tenant_id=tenant.id,
        employee_id=employee_id,
        mission_id=mission_uuid,
        check_type=check_type,
        latitude=body.latitude,
        longitude=body.longitude,
        accuracy_meters=body.accuracy_meters,
        is_within_geofence=is_within,
        distance_from_target_m=distance,
        device_info=body.device_info,
        notes=body.notes,
    )
    db.add(checkin)
    await db.commit()
    await db.refresh(checkin)

    msg = "נרשמת בהצלחה" if check_type == "in" else "יציאה נרשמה"
    if not is_within and distance:
        msg += f" (⚠️ מחוץ לגדר — {distance:.0f}מ׳)"

    return CheckinResponse(
        id=str(checkin.id),
        check_type=check_type,
        is_within_geofence=is_within,
        distance_from_target_m=distance,
        timestamp=checkin.created_at.isoformat(),
        message=msg,
    )
