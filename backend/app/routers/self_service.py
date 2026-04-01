"""Self-service endpoints for soldiers/viewers (/my/...)."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee, EmployeePreference
from app.schemas.employee import EmployeePreferencesUpdate, EmployeePreferencesResponse
from app.models.scheduling import Mission, MissionAssignment, SwapRequest, MissionType
from app.models.notification import NotificationLog



def _get_slot_label(mt, slot_id: str) -> str:
    """Get the Hebrew label for a slot from mission type required_slots."""
    if not mt or not mt.required_slots:
        return slot_id
    for slot in mt.required_slots:
        if slot.get("slot_id") == slot_id:
            label = slot.get("label", {})
            if isinstance(label, dict):
                return label.get("he", label.get("en", slot_id))
            return str(label) if label else slot_id
    return slot_id
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
# My Preferences
# ═══════════════════════════════════════════

@router.get("/preferences")
async def get_my_preferences(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get current user's scheduling preferences."""
    if not user.employee_id:
        return EmployeePreferencesResponse(
            employee_id=UUID("00000000-0000-0000-0000-000000000000"),
            partner_preferences=[], mission_type_preferences=[],
            time_slot_preferences=[], custom_preferences={}, notes=None,
        ).model_dump()

    pref_res = await db.execute(
        select(EmployeePreference).where(EmployeePreference.employee_id == user.employee_id)
    )
    pref = pref_res.scalar_one_or_none()

    if not pref:
        return EmployeePreferencesResponse(
            employee_id=user.employee_id,
            partner_preferences=[],
            mission_type_preferences=[],
            time_slot_preferences=[],
            custom_preferences={},
            notes=None,
        ).model_dump()

    return EmployeePreferencesResponse.model_validate(pref).model_dump()


@router.put("/preferences")
async def update_my_preferences(
    data: EmployeePreferencesUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update current user's scheduling preferences."""
    if not user.employee_id:
        raise HTTPException(status_code=400, detail="לא מקושר לעובד")

    parsed = data

    pref_res = await db.execute(
        select(EmployeePreference).where(EmployeePreference.employee_id == user.employee_id)
    )
    pref = pref_res.scalar_one_or_none()

    if pref:
        for key, value in parsed.model_dump(exclude_unset=True).items():
            setattr(pref, key, value)
    else:
        pref = EmployeePreference(employee_id=user.employee_id, **parsed.model_dump())
        db.add(pref)

    await db.flush()
    await db.refresh(pref)
    await db.commit()

    return EmployeePreferencesResponse.model_validate(pref).model_dump()


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
            "slot_label": _get_slot_label(mt, ma.slot_id) if mt else ma.slot_id,
            "work_role_name": None,  # filled below
            "status": ma.status,
            "mission_status": m.status,
            "conflicts_detected": ma.conflicts_detected,
            "crew": [],
        })

    # Fill crew info — batch load to avoid N+1
    mission_ids = list(set(UUID(item["mission_id"]) for item in items))
    if mission_ids:
        # Load mission types for slot label resolution
        mt_by_mission = {}
        for item in items:
            mt_by_mission[item["mission_id"]] = item.get("_mt")  # set below

        # Load missions to get mission_type_id
        missions_result = await db.execute(
            select(Mission).where(Mission.id.in_(mission_ids))
        )
        mission_to_mt = {}
        mt_ids = set()
        for mis in missions_result.scalars().all():
            mission_to_mt[str(mis.id)] = str(mis.mission_type_id)
            mt_ids.add(mis.mission_type_id)

        # Load mission types
        mt_map = {}
        if mt_ids:
            mt_result = await db.execute(
                select(MissionType).where(MissionType.id.in_(list(mt_ids)))
            )
            for mt_obj in mt_result.scalars().all():
                mt_map[str(mt_obj.id)] = mt_obj

        crew_result = await db.execute(
            select(MissionAssignment, Employee)
            .join(Employee, MissionAssignment.employee_id == Employee.id)
            .where(
                MissionAssignment.mission_id.in_(mission_ids),
                MissionAssignment.status != "replaced",
            )
        )
        crew_by_mission: dict[str, list] = {}
        for crew_ma, crew_emp in crew_result.all():
            mid = str(crew_ma.mission_id)
            if mid not in crew_by_mission:
                crew_by_mission[mid] = []
            # Resolve slot label from mission type
            mt_id = mission_to_mt.get(mid)
            mt_obj = mt_map.get(mt_id) if mt_id else None
            crew_by_mission[mid].append({
                "name": crew_emp.full_name,
                "slot_id": crew_ma.slot_id,
                "slot_label": _get_slot_label(mt_obj, crew_ma.slot_id),
                "is_me": str(crew_emp.id) == str(user.employee_id),
            })

        for item in items:
            item["crew"] = crew_by_mission.get(item["mission_id"], [])

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

    # Separate count query to avoid subquery nesting issues
    count_q = select(func.count(NotificationLog.id)).where(
        NotificationLog.tenant_id == tenant.id,
        NotificationLog.employee_id == user.employee_id,
    )
    total = (await db.execute(count_q)).scalar() or 0

    result = await db.execute(query.offset(offset).limit(page_size))
    items = [
        {
            "id": str(n.id),
            "event_type_code": n.event_type_code,
            "channel": n.channel,
            "body_sent": n.body_sent,
            "status": n.status,
            "created_at": str(n.created_at),
        }
        for n in result.scalars().all()
    ]

    return {"items": items, "total": total}


class NotificationPrefsUpdate(BaseModel):
    channels: dict  # e.g., {"push": true, "email": false, "whatsapp": true}


@router.get("/notification-settings")
async def get_notification_settings(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get current user's notification channel settings."""
    if not user.employee_id:
        # User not linked to employee — return empty settings
        return {
            "employee_id": None,
            "channels": {},
            "active_channels": [],
            "primary_channel": "push",
        }

    emp_res = await db.execute(
        select(Employee).where(Employee.id == user.employee_id)
    )
    emp = emp_res.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="עובד לא נמצא")

    channels = emp.notification_channels or {}
    return {
        "employee_id": str(emp.id),
        "channels": channels,
        "active_channels": channels.get("active_channels", []),
        "primary_channel": channels.get("primary_channel", "push"),
    }


@router.put("/notification-settings")
async def update_notification_settings_put(
    data: NotificationPrefsUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update notification channel preferences (PUT)."""
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


@router.patch("/notification-settings")
async def update_notification_settings_patch(
    data: NotificationPrefsUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update notification channel preferences (PATCH)."""
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


# ═══════════════════════════════════════════
# My Profile (PUT)
# ═══════════════════════════════════════════

@router.put("/profile")
async def update_my_profile_put(
    data: ProfileUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update current user's profile (PUT — full replace)."""
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


# ═══════════════════════════════════════════
# Avatar Presigned URL
# ═══════════════════════════════════════════

class AvatarPresignedRequest(BaseModel):
    content_type: str = "image/jpeg"
    filename: str | None = None


@router.post("/avatar/presigned-url")
async def get_avatar_presigned_url(
    data: AvatarPresignedRequest,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a presigned S3 URL for avatar upload."""
    import uuid as uuid_mod

    if not user.employee_id:
        raise HTTPException(status_code=400, detail="לא מקושר לעובד")

    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if data.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"סוג קובץ לא נתמך. אפשרויות: {', '.join(allowed_types)}"
        )

    # Generate unique key
    ext = data.content_type.split("/")[-1]
    key = f"avatars/{tenant.slug}/{user.employee_id}/{uuid_mod.uuid4()}.{ext}"

    # In production, this would use boto3 to generate a real presigned URL
    # For now, return a placeholder structure
    return {
        "upload_url": f"https://s3.placeholder.com/{key}?presigned=true",
        "key": key,
        "content_type": data.content_type,
        "expires_in": 3600,
        "message": "URL זמני להעלאת תמונת פרופיל",
    }


# Need this import for count
from sqlalchemy import func


# ═══════════════════════════════════════════
# My Teammates (lightweight employee list for partner preferences)
# ═══════════════════════════════════════════

@router.get("/teammates")
async def get_my_teammates(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    search: str | None = None,
) -> list[dict]:
    """Get list of active employees in the same tenant (for partner preferences).

    Returns only id, employee_number, full_name — no sensitive data.
    Accessible by any authenticated user without special permissions.
    """
    query = (
        select(Employee)
        .where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True))
        .order_by(Employee.full_name)
        .limit(200)
    )
    if search:
        query = query.where(
            Employee.full_name.ilike(f"%{search}%") | Employee.employee_number.ilike(f"%{search}%")
        )
    result = await db.execute(query)
    return [
        {"id": str(e.id), "employee_number": e.employee_number, "full_name": e.full_name}
        for e in result.scalars().all()
    ]
