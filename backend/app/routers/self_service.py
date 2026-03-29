"""Self-service endpoints for soldiers/viewers (/my/...)."""

from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee
from app.models.scheduling import Mission, MissionAssignment, SwapRequest, MissionType
from app.models.notification import NotificationLog, EventTypeDefinition
from app.models.user import User

router = APIRouter()


# ═══════════════════════════════════════════
# My Profile
# ═══════════════════════════════════════════

class ProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    preferred_language: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.get("/profile")
async def get_my_profile(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get current user's profile including linked employee."""
    result = {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "preferred_language": user.preferred_language,
            "two_factor_enabled": user.two_factor_enabled,
            "last_login": str(user.last_login) if user.last_login else None,
        },
        "employee": None,
    }

    if user.employee_id:
        emp_res = await db.execute(
            select(Employee).where(Employee.id == user.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        if emp:
            result["employee"] = {
                "id": str(emp.id),
                "employee_number": emp.employee_number,
                "full_name": emp.full_name,
                "status": emp.status,
                "notification_channels": emp.notification_channels,
            }

    return result


@router.patch("/profile")
async def update_my_profile(
    data: ProfileUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update current user's profile."""
    if data.preferred_language:
        user.preferred_language = data.preferred_language
        await db.flush()

    if user.employee_id and (data.full_name or data.phone):
        emp_res = await db.execute(
            select(Employee).where(Employee.id == user.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        if emp:
            if data.full_name:
                emp.full_name = data.full_name
            if data.phone:
                channels = emp.notification_channels or {}
                channels["phone_whatsapp"] = data.phone
                emp.notification_channels = channels
            await db.flush()

    await db.commit()
    return {"message": "פרופיל עודכן בהצלחה"}


@router.post("/change-password")
async def change_my_password(
    data: ChangePasswordRequest,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Change current user's password."""
    from app.services.auth_service import AuthService

    # Verify current password
    if not user.password_hash or not AuthService.verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="סיסמה נוכחית שגויה")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="סיסמה חדשה חייבת להכיל לפחות 6 תווים")

    user.password_hash = AuthService.hash_password(data.new_password)
    await db.commit()
    return {"message": "סיסמה שונתה בהצלחה"}


# ═══════════════════════════════════════════
# My Schedule
# ═══════════════════════════════════════════

@router.get("/schedule")
async def get_my_schedule(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    """Get current user's mission assignments."""
    if not user.employee_id:
        return []

    query = (
        select(MissionAssignment, Mission)
        .join(Mission, MissionAssignment.mission_id == Mission.id)
        .where(
            MissionAssignment.employee_id == user.employee_id,
            MissionAssignment.status != "replaced",
            Mission.tenant_id == tenant.id,
        )
    )
    if date_from:
        query = query.where(Mission.date >= date_from)
    if date_to:
        query = query.where(Mission.date <= date_to)

    query = query.order_by(Mission.date, Mission.start_time)
    result = await db.execute(query)

    items = []
    for ma, m in result.all():
        # Get mission type
        mt_res = await db.execute(select(MissionType).where(MissionType.id == m.mission_type_id))
        mt = mt_res.scalar_one_or_none()

        items.append({
            "assignment_id": str(ma.id),
            "mission_id": str(m.id),
            "mission_name": m.name,
            "mission_type_name": mt.name if mt else None,
            "mission_type_color": mt.color if mt else None,
            "mission_type_icon": mt.icon if mt else None,
            "date": str(m.date),
            "start_time": str(m.start_time),
            "end_time": str(m.end_time),
            "slot_id": ma.slot_id,
            "status": ma.status,
            "mission_status": m.status,
            "conflicts_detected": ma.conflicts_detected,
        })

    return items


# ═══════════════════════════════════════════
# My Swap Requests
# ═══════════════════════════════════════════

class MySwapRequestCreate(BaseModel):
    assignment_id: UUID
    target_employee_id: UUID | None = None
    swap_type: str = "give_away"  # swap | give_away
    reason: str | None = None


@router.get("/swap-requests")
async def get_my_swap_requests(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Get my swap requests."""
    if not user.employee_id:
        return []

    result = await db.execute(
        select(SwapRequest).where(
            SwapRequest.tenant_id == tenant.id,
            SwapRequest.requester_employee_id == user.employee_id,
        ).order_by(SwapRequest.created_at.desc())
    )
    items = []
    for sr in result.scalars().all():
        target_name = None
        if sr.target_employee_id:
            tgt = await db.execute(
                select(Employee).where(Employee.id == sr.target_employee_id)
            )
            t = tgt.scalar_one_or_none()
            target_name = t.full_name if t else None

        items.append({
            "id": str(sr.id),
            "swap_type": sr.swap_type,
            "reason": sr.reason,
            "status": sr.status,
            "target_name": target_name,
            "target_response": sr.target_response,
            "created_at": str(sr.created_at),
        })
    return items


@router.post("/swap-requests", status_code=status.HTTP_201_CREATED)
async def create_my_swap_request(
    data: MySwapRequestCreate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a swap/give-away request."""
    if not user.employee_id:
        raise HTTPException(status_code=400, detail="לא מקושר לעובד")

    # Validate assignment belongs to me
    ma_res = await db.execute(
        select(MissionAssignment).where(
            MissionAssignment.id == data.assignment_id,
            MissionAssignment.employee_id == user.employee_id,
        )
    )
    if not ma_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="שיבוץ לא נמצא")

    sr = SwapRequest(
        tenant_id=tenant.id,
        requester_employee_id=user.employee_id,
        requester_assignment_id=data.assignment_id,
        target_employee_id=data.target_employee_id,
        swap_type=data.swap_type,
        reason=data.reason,
    )
    db.add(sr)
    await db.flush()
    await db.refresh(sr)
    await db.commit()

    return {"id": str(sr.id), "status": sr.status}


# ═══════════════════════════════════════════
# My Notifications
# ═══════════════════════════════════════════

@router.get("/notifications")
async def get_my_notifications(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1, page_size: int = 20,
) -> dict:
    """Get notifications for the current user."""
    if not user.employee_id:
        return {"items": [], "total": 0}

    offset = (page - 1) * page_size
    query = (
        select(NotificationLog)
        .where(
            NotificationLog.tenant_id == tenant.id,
            NotificationLog.employee_id == user.employee_id,
        )
        .order_by(NotificationLog.created_at.desc())
    )

    total_q = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = total_q.scalar() or 0

    result = await db.execute(query.offset(offset).limit(page_size))
    items = [
        {
            "id": str(n.id),
            "event_type_code": n.event_type_code,
            "channel": n.channel,
            "status": n.status,
            "payload": n.payload,
            "created_at": str(n.created_at),
        }
        for n in result.scalars().all()
    ]

    return {"items": items, "total": total}


class NotificationPrefsUpdate(BaseModel):
    channels: dict  # e.g., {"push": true, "email": false, "whatsapp": true}


@router.patch("/notification-settings")
async def update_notification_settings(
    data: NotificationPrefsUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update notification channel preferences."""
    if not user.employee_id:
        raise HTTPException(status_code=400, detail="לא מקושר לעובד")

    emp_res = await db.execute(
        select(Employee).where(Employee.id == user.employee_id)
    )
    emp = emp_res.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="עובד לא נמצא")

    channels = emp.notification_channels or {}
    channels["active_channels"] = [ch for ch, enabled in data.channels.items() if enabled]
    channels["primary_channel"] = channels["active_channels"][0] if channels["active_channels"] else "push"
    emp.notification_channels = channels

    await db.flush()
    await db.commit()

    return {"message": "הגדרות התראות עודכנו", "channels": channels}


# Need this import for count
from sqlalchemy import func
