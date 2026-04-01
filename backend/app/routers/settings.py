"""Settings endpoints: tenant settings, work roles, role definitions, bot tokens."""

import secrets
from datetime import datetime, timezone, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.permissions import require_permission, require_tenant_admin
from app.models.tenant import TenantSetting
from app.models.resource import WorkRole, RoleDefinition
from app.models.bot import BotRegistrationToken
from app.models.audit import AuditLog
from app.schemas.settings import (
    TenantSettingUpdate, TenantSettingResponse,
    WorkRoleCreate, WorkRoleUpdate, WorkRoleResponse,
    RoleDefinitionCreate, RoleDefinitionUpdate, RoleDefinitionResponse,
)


class SettingCreateRequest(BaseModel):
    key: str
    value: dict | str | bool | int | float | list | None = None
    group: str = "general"


class BotTokenCreateRequest(BaseModel):
    count: int = 1
    platform: str = "whatsapp"

router = APIRouter()


# ═══════════════════════════════════════════
# Work Roles (must be before /{key} catch-all)
# ═══════════════════════════════════════════

@router.get("/work-roles")
async def list_work_roles(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(WorkRole).where(WorkRole.tenant_id == tenant.id).order_by(WorkRole.sort_order)
    )
    return [WorkRoleResponse.model_validate(wr).model_dump() for wr in result.scalars().all()]


@router.post("/work-roles", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("settings", "write"))])
async def create_work_role(
    data: WorkRoleCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    wr = WorkRole(tenant_id=tenant.id, **data.model_dump())
    db.add(wr)
    await db.flush()
    await db.refresh(wr)
    await db.commit()
    return WorkRoleResponse.model_validate(wr).model_dump()


@router.patch("/work-roles/{role_id}")
async def update_work_role(
    role_id: UUID, data: WorkRoleUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(WorkRole).where(WorkRole.id == role_id, WorkRole.tenant_id == tenant.id)
    )
    wr = result.scalar_one_or_none()
    if not wr:
        raise HTTPException(status_code=404, detail="תפקיד לא נמצא")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(wr, key, value)
    await db.flush()
    await db.refresh(wr)
    await db.commit()
    return WorkRoleResponse.model_validate(wr).model_dump()


@router.delete("/work-roles/{role_id}", status_code=204)
async def delete_work_role(
    role_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> None:
    from app.models.employee import EmployeeWorkRole

    result = await db.execute(
        select(WorkRole).where(WorkRole.id == role_id, WorkRole.tenant_id == tenant.id)
    )
    wr = result.scalar_one_or_none()
    if not wr:
        raise HTTPException(status_code=404, detail="תפקיד לא נמצא")

    # Check if any employee is using this role
    usage_count = (await db.execute(
        select(func.count()).where(EmployeeWorkRole.work_role_id == role_id)
    )).scalar() or 0
    if usage_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"לא ניתן למחוק תפקיד שנמצא בשימוש ({usage_count} חיילים משויכים)"
        )

    await db.delete(wr)
    await db.commit()


# ═══════════════════════════════════════════
# Role Definitions (permissions)
# ═══════════════════════════════════════════

@router.get("/role-definitions")
async def list_role_definitions(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(RoleDefinition).where(RoleDefinition.tenant_id == tenant.id)
        .order_by(RoleDefinition.name)
    )
    return [RoleDefinitionResponse.model_validate(rd).model_dump() for rd in result.scalars().all()]


@router.post("/role-definitions", status_code=status.HTTP_201_CREATED)
async def create_role_definition(
    data: RoleDefinitionCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    rd = RoleDefinition(tenant_id=tenant.id, **data.model_dump())
    db.add(rd)
    await db.flush()
    await db.refresh(rd)
    await db.commit()
    return RoleDefinitionResponse.model_validate(rd).model_dump()


@router.patch("/role-definitions/{rd_id}")
async def update_role_definition(
    rd_id: UUID, data: RoleDefinitionUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(RoleDefinition).where(RoleDefinition.id == rd_id, RoleDefinition.tenant_id == tenant.id)
    )
    rd = result.scalar_one_or_none()
    if not rd:
        raise HTTPException(status_code=404, detail="הגדרת תפקיד לא נמצאה")
    if rd.is_system:
        raise HTTPException(status_code=403, detail="לא ניתן לערוך הגדרת מערכת")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rd, key, value)
    await db.flush()
    await db.refresh(rd)
    await db.commit()
    return RoleDefinitionResponse.model_validate(rd).model_dump()


@router.delete("/role-definitions/{rd_id}", status_code=status.HTTP_200_OK)
async def delete_role_definition(
    rd_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a custom role definition. System roles cannot be deleted."""
    from app.models.user import User

    result = await db.execute(
        select(RoleDefinition).where(RoleDefinition.id == rd_id, RoleDefinition.tenant_id == tenant.id)
    )
    rd = result.scalar_one_or_none()
    if not rd:
        raise HTTPException(status_code=404, detail="הגדרת תפקיד לא נמצאה")
    if rd.is_system:
        raise HTTPException(status_code=403, detail="לא ניתן למחוק הגדרת מערכת")
    # Check if any users are assigned this role
    user_count = await db.execute(
        select(func.count(User.id)).where(User.role_definition_id == rd_id)
    )
    count = user_count.scalar() or 0
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"לא ניתן למחוק — {count} משתמשים משויכים לתפקיד זה. העבר אותם לתפקיד אחר קודם."
        )
    await db.delete(rd)
    await db.commit()
    return {"id": str(rd_id), "deleted": True}


# ═══════════════════════════════════════════
# Tenant Settings (catch-all at the end)
# ═══════════════════════════════════════════

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_setting(
    data: SettingCreateRequest, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or upsert a tenant setting."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id, TenantSetting.key == data.key,
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = data.value if isinstance(data.value, dict) else {"_v": data.value}
        setting.group = data.group
    else:
        val = data.value if isinstance(data.value, dict) else {"_v": data.value}
        setting = TenantSetting(
            tenant_id=tenant.id, key=data.key, value=val,
            value_type="json", label={"he": data.key, "en": data.key},
            group=data.group,
        )
        db.add(setting)
    await db.flush()
    await db.refresh(setting)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create_setting",
        entity_type="setting", entity_id=setting.id,
        after_state={"key": data.key},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return TenantSettingResponse.model_validate(setting).model_dump()


# ═══════════════════════════════════════════
# Bot Registration Tokens
# ═══════════════════════════════════════════

@router.get("/bot-tokens")
async def list_bot_tokens(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    from app.models.employee import Employee
    result = await db.execute(
        select(BotRegistrationToken, Employee)
        .join(Employee, BotRegistrationToken.employee_id == Employee.id)
        .where(Employee.tenant_id == tenant.id)
        .order_by(BotRegistrationToken.created_at.desc())
    )
    return [
        {
            "id": str(tok.id),
            "token": tok.token,
            "employee_id": str(tok.employee_id),
            "employee_name": emp.full_name,
            "platform": tok.platform,
            "expires_at": str(tok.expires_at),
            "used_at": str(tok.used_at) if tok.used_at else None,
        }
        for tok, emp in result.all()
    ]


@router.post("/bot-tokens", status_code=status.HTTP_201_CREATED)
async def create_bot_tokens(
    data: BotTokenCreateRequest, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Generate bot registration tokens. Creates generic tokens not tied to a specific employee."""
    from app.models.employee import Employee
    # Get first employee as placeholder (tokens are generic)
    emp_result = await db.execute(
        select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True)).limit(1)
    )
    emp = emp_result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=400, detail="צריך לפחות עובד אחד פעיל ליצירת טוקנים")

    tokens = []
    for _ in range(min(data.count, 100)):
        token = BotRegistrationToken(
            token=secrets.token_urlsafe(32),
            employee_id=emp.id,
            platform=data.platform,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(token)
        await db.flush()
        await db.refresh(token)
        tokens.append({
            "id": str(token.id),
            "token": token.token,
            "employee_id": str(token.employee_id),
            "platform": token.platform,
            "expires_at": str(token.expires_at),
            "used_at": None,
        })

    await db.commit()
    return tokens


@router.delete("/bot-tokens/{token_id}", status_code=204)
async def delete_bot_token(
    token_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    from app.models.employee import Employee
    result = await db.execute(
        select(BotRegistrationToken)
        .join(Employee, BotRegistrationToken.employee_id == Employee.id)
        .where(BotRegistrationToken.id == token_id, Employee.tenant_id == tenant.id)
    )
    token = result.scalar_one_or_none()
    if token:
        await db.delete(token)
        await db.commit()


@router.get("", dependencies=[Depends(require_permission("settings", "read"))])
async def list_settings(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    group: str | None = None,
) -> list[dict]:
    query = select(TenantSetting).where(TenantSetting.tenant_id == tenant.id)
    if group:
        query = query.where(TenantSetting.group == group)
    result = await db.execute(query.order_by(TenantSetting.group, TenantSetting.key))
    return [TenantSettingResponse.model_validate(s).model_dump() for s in result.scalars().all()]


@router.get("/key/{key}")
async def get_setting(
    key: str, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(TenantSetting).where(TenantSetting.tenant_id == tenant.id, TenantSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="הגדרה לא נמצאה")
    return TenantSettingResponse.model_validate(setting).model_dump()


@router.patch("/key/{key}", dependencies=[Depends(require_permission("settings", "write"))])
async def update_setting(
    key: str, data: TenantSettingUpdate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(TenantSetting).where(TenantSetting.tenant_id == tenant.id, TenantSetting.key == key)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        setting = TenantSetting(
            tenant_id=tenant.id, key=key, value=data.value,
            value_type="json", label={"he": key, "en": key}, group="general",
        )
        db.add(setting)
    else:
        if not setting.is_editable_by_tenant_admin:
            raise HTTPException(status_code=403, detail="הגדרה זו אינה ניתנת לעריכה")
        setting.value = data.value

    await db.flush()
    await db.refresh(setting)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update_setting",
        entity_type="setting", entity_id=setting.id,
        after_state={"key": key, "value": str(data.value)},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return TenantSettingResponse.model_validate(setting).model_dump()


# ═══════════════════════════════════════════
# Visibility Settings
# ═══════════════════════════════════════════

VISIBILITY_KEY = "visibility_settings"


class VisibilitySettingsUpdate(BaseModel):
    show_employee_names: bool = True
    show_employee_numbers: bool = True
    show_mission_details: bool = True
    show_assignment_status: bool = True
    board_visible_to_all: bool = False


@router.get("/visibility", dependencies=[Depends(require_permission("settings", "read"))])
async def get_visibility_settings(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    """Get tenant visibility settings."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == VISIBILITY_KEY,
        )
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return {
            "show_employee_names": True,
            "show_employee_numbers": True,
            "show_mission_details": True,
            "show_assignment_status": True,
            "board_visible_to_all": False,
        }
    return setting.value


@router.put("/visibility", dependencies=[Depends(require_permission("settings", "write"))])
async def update_visibility_settings(
    data: VisibilitySettingsUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Update tenant visibility settings."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == VISIBILITY_KEY,
        )
    )
    setting = result.scalar_one_or_none()
    value = data.model_dump()
    if not setting:
        setting = TenantSetting(
            tenant_id=tenant.id,
            key=VISIBILITY_KEY,
            value=value,
            value_type="json",
            label={"he": "הגדרות נראות", "en": "Visibility Settings"},
            group="visibility",
        )
        db.add(setting)
    else:
        setting.value = value

    await db.flush()
    await db.refresh(setting)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update_setting",
        entity_type="setting", entity_id=setting.id,
        after_state={"key": VISIBILITY_KEY, "value": value},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return value


# ═══════════════════════════════════════════
# Notification Preference Defaults
# ═══════════════════════════════════════════

NOTIF_DEFAULTS_KEY = "notification_preference_defaults"


class NotificationPreferenceDefaults(BaseModel):
    default_channels: list[str] = ["push"]
    default_enabled: bool = True
    quiet_hours_start: str | None = None  # e.g., "23:00"
    quiet_hours_end: str | None = None    # e.g., "06:30"


@router.get("/notification-preferences/defaults", dependencies=[Depends(require_permission("settings", "read"))])
async def get_notification_preference_defaults(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    """Get default notification preferences for new employees."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == NOTIF_DEFAULTS_KEY,
        )
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return {
            "default_channels": ["push"],
            "default_enabled": True,
            "quiet_hours_start": None,
            "quiet_hours_end": None,
        }
    return setting.value


@router.put("/notification-preferences/defaults", dependencies=[Depends(require_permission("settings", "write"))])
async def update_notification_preference_defaults(
    data: NotificationPreferenceDefaults,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Update default notification preferences for new employees."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == NOTIF_DEFAULTS_KEY,
        )
    )
    setting = result.scalar_one_or_none()
    value = data.model_dump()
    if not setting:
        setting = TenantSetting(
            tenant_id=tenant.id,
            key=NOTIF_DEFAULTS_KEY,
            value=value,
            value_type="json",
            label={"he": "ברירות מחדל להתראות", "en": "Notification Defaults"},
            group="notifications",
        )
        db.add(setting)
    else:
        setting.value = value

    await db.flush()
    await db.refresh(setting)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update_setting",
        entity_type="setting", entity_id=setting.id,
        after_state={"key": NOTIF_DEFAULTS_KEY, "value": value},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return value


# ═══════════════════════════════════════════
# Notification Locked Events
# ═══════════════════════════════════════════

from app.models.retention import DataRetentionConfig
from app.models.notification import NotificationLockedEvent


# ═══════════════════════════════════════════
# Data Retention Config
# ═══════════════════════════════════════════

class DataRetentionItem(BaseModel):
    entity_type: str
    retain_days: int = 365
    archive_to_s3: bool = False


class DataRetentionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    entity_type: str
    retain_days: int
    archive_to_s3: bool

    model_config = {"from_attributes": True}


class DataRetentionBulkUpdate(BaseModel):
    configs: list[DataRetentionItem]


@router.get("/data-retention", dependencies=[Depends(require_permission("settings", "read"))])
async def list_data_retention(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List data retention configurations for the tenant."""
    result = await db.execute(
        select(DataRetentionConfig).where(DataRetentionConfig.tenant_id == tenant.id)
        .order_by(DataRetentionConfig.entity_type)
    )
    return [DataRetentionResponse.model_validate(c).model_dump() for c in result.scalars().all()]


@router.put("/data-retention", dependencies=[Depends(require_permission("settings", "write"))])
async def update_data_retention(
    data: DataRetentionBulkUpdate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Upsert data retention configs by entity_type."""
    results = []
    for item in data.configs:
        existing = await db.execute(
            select(DataRetentionConfig).where(
                DataRetentionConfig.tenant_id == tenant.id,
                DataRetentionConfig.entity_type == item.entity_type,
            )
        )
        config = existing.scalar_one_or_none()
        if config:
            config.retain_days = item.retain_days
            config.archive_to_s3 = item.archive_to_s3
        else:
            config = DataRetentionConfig(
                tenant_id=tenant.id,
                entity_type=item.entity_type,
                retain_days=item.retain_days,
                archive_to_s3=item.archive_to_s3,
            )
            db.add(config)
        await db.flush()
        await db.refresh(config)
        results.append(DataRetentionResponse.model_validate(config).model_dump())

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update_data_retention",
        entity_type="data_retention_config", entity_id=tenant.id,
        after_state={"count": len(results)},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return results


class LockedEventItem(BaseModel):
    event_type_code: str
    locked_channels: list[str] | None = None
    reason: dict | None = None  # {"he": "...", "en": "..."}


class LockedEventsUpdate(BaseModel):
    events: list[LockedEventItem]


@router.get("/notification-preferences/locked-events", dependencies=[Depends(require_permission("settings", "read"))])
async def get_locked_events(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Get events that employees cannot disable notifications for."""
    result = await db.execute(
        select(NotificationLockedEvent).where(
            NotificationLockedEvent.tenant_id == tenant.id
        )
    )
    return [
        {
            "id": str(le.id),
            "event_type_code": le.event_type_code,
            "locked_channels": le.locked_channels,
            "reason": le.reason,
        }
        for le in result.scalars().all()
    ]


@router.put("/notification-preferences/locked-events", dependencies=[Depends(require_permission("settings", "write"))])
async def update_locked_events(
    data: LockedEventsUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Replace all locked events for the tenant."""
    # Delete existing
    existing = await db.execute(
        select(NotificationLockedEvent).where(
            NotificationLockedEvent.tenant_id == tenant.id
        )
    )
    for le in existing.scalars().all():
        await db.delete(le)
    await db.flush()

    # Insert new
    items = []
    for event in data.events:
        le = NotificationLockedEvent(
            tenant_id=tenant.id,
            event_type_code=event.event_type_code,
            locked_channels=event.locked_channels,
            reason=event.reason,
        )
        db.add(le)
        await db.flush()
        await db.refresh(le)
        items.append({
            "id": str(le.id),
            "event_type_code": le.event_type_code,
            "locked_channels": le.locked_channels,
            "reason": le.reason,
        })

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update_locked_events",
        entity_type="notification_locked_events", entity_id=tenant.id,
        after_state={"count": len(items)},
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return items


# ═══════════════════════════════════════════
# Preferences Configuration (which prefs employees can set)
# ═══════════════════════════════════════════

@router.get("/preferences-config")
async def get_preferences_config(
    tenant: CurrentTenant, db: AsyncSession = Depends(get_db),
) -> dict:
    """Get which preference types are enabled for employees."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == "preferences_config",
        )
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        return setting.value
    # Default: only partner preferences enabled
    return {
        "partner_preferences_enabled": True,
        "mission_type_preferences_enabled": False,
        "time_slot_preferences_enabled": False,
        "per_employee_overrides": {},
    }


@router.put("/preferences-config", dependencies=[Depends(require_permission("settings", "write"))])
async def update_preferences_config(
    data: dict,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update which preference types are enabled. Admin can also set per-employee overrides."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == "preferences_config",
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = data
    else:
        db.add(TenantSetting(
            tenant_id=tenant.id,
            key="preferences_config",
            value=data,
            value_type="json",
            label={"he": "הגדרות העדפות חיילים", "en": "Employee Preferences Config"},
            group="scheduling",
            is_editable_by_tenant_admin=True,
        ))
    await db.commit()
    return data


# ═══════════════════════════════════════════
# Tenant Branding
# ═══════════════════════════════════════════

class BrandingUpdateRequest(BaseModel):
    logo_url: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    theme: str | None = None  # "light" | "dark" | "auto"
    custom_css: str | None = None
    favicon_url: str | None = None
    app_name: str | None = None


@router.get("/branding")
async def get_branding(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get tenant branding settings."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == "branding",
        )
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting and setting.value else {}


@router.put("/branding", dependencies=[Depends(require_tenant_admin)])
async def update_branding(
    data: BrandingUpdateRequest,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update tenant branding settings."""
    branding_data = {k: v for k, v in data.model_dump().items() if v is not None}

    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == "branding",
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        # Merge with existing — create NEW dict so SQLAlchemy detects the change
        existing = dict(setting.value or {})
        existing.update(branding_data)
        setting.value = existing
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(setting, "value")
    else:
        db.add(TenantSetting(
            tenant_id=tenant.id,
            key="branding",
            value=branding_data,
            value_type="json",
            label={"he": "מיתוג", "en": "Branding"},
            group="branding",
            is_editable_by_tenant_admin=True,
        ))

    db.add(AuditLog(
        tenant_id=tenant.id,
        user_id=user.id,
        action="update",
        entity_type="tenant_branding",
        entity_id=tenant.id,
        after_state=branding_data,
        ip_address=getattr(request.state, "real_ip", request.client.host if request.client else None),
    ))
    await db.commit()
    return branding_data


# ═══════════════════════════════════════════
# Dynamic PWA Manifest
# ═══════════════════════════════════════════

from fastapi.responses import JSONResponse as _JSONResponse


@router.get("/manifest.json")
async def get_pwa_manifest(
    tenant: CurrentTenant,
    db: AsyncSession = Depends(get_db),
) -> _JSONResponse:
    """Generate a dynamic PWA manifest.json based on tenant branding."""
    from app.models.tenant import Tenant
    # Load branding from settings
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == "branding",
        )
    )
    setting = result.scalar_one_or_none()
    branding = dict(setting.value if setting and setting.value else {})
    # Also merge tenant-level branding (channels branding)
    tenant_obj = (await db.execute(select(Tenant).where(Tenant.id == tenant.id))).scalar_one_or_none()
    if tenant_obj and tenant_obj.branding:
        branding = {**branding, **tenant_obj.branding}

    app_name = branding.get("app_name", "שבצק")
    primary_color = branding.get("primary_color", "#2563eb")
    icon_url = branding.get("pwa_icon_url")

    icons = []
    if icon_url:
        icons = [
            {"src": icon_url, "sizes": "192x192", "type": "image/png"},
            {"src": icon_url, "sizes": "512x512", "type": "image/png"},
        ]
    else:
        icons = [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
        ]

    manifest = {
        "name": app_name,
        "short_name": app_name[:12],
        "description": f"{app_name} — מערכת שיבוץ עובדים חכמה",
        "start_url": "/",
        "display": "standalone",
        "orientation": "any",
        "background_color": "#ffffff",
        "theme_color": primary_color,
        "dir": "rtl",
        "lang": "he",
        "icons": icons,
        "categories": ["business", "productivity"],
    }

    return _JSONResponse(content=manifest, headers={
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
    })


# ─── AI Bot Configuration ──────────────────────────────────────────────

class AIBotConfig(BaseModel):
    is_enabled: bool = False
    ai_model: str = "gpt-4o-mini"
    ai_api_key: str | None = None
    ai_prompt: str | None = None
    ai_only_registered: bool = True


@router.get("/ai-bot-config", dependencies=[Depends(require_tenant_admin)])
async def get_ai_bot_config(
    tenant: CurrentTenant,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get AI bot configuration for this tenant."""
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == "ai_bot_config",
        )
    )
    setting = result.scalar_one_or_none()
    config = setting.value if setting and setting.value else {}
    # Mask API key for display
    if config.get("ai_api_key"):
        key = config["ai_api_key"]
        config = {**config, "ai_api_key_masked": key[:4] + "****" if len(key) > 4 else "****"}
    return config


@router.put("/ai-bot-config", dependencies=[Depends(require_tenant_admin)])
async def update_ai_bot_config(
    data: AIBotConfig,
    tenant: CurrentTenant,
    user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update AI bot configuration for this tenant."""
    config_data = data.model_dump(exclude_none=True)
    result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == "ai_bot_config",
        )
    )
    setting = result.scalar_one_or_none()
    if setting:
        existing = dict(setting.value or {})
        # Don't overwrite API key if masked value was sent
        if data.ai_api_key and "****" not in (data.ai_api_key or ""):
            existing["ai_api_key"] = data.ai_api_key
        elif "ai_api_key" in config_data and "****" in (config_data.get("ai_api_key") or ""):
            config_data.pop("ai_api_key", None)
        existing.update(config_data)
        setting.value = existing
    else:
        setting = TenantSetting(
            tenant_id=tenant.id,
            key="ai_bot_config",
            value=config_data,
            group="ai",
        )
        db.add(setting)
    await db.commit()
    return {"status": "saved"}
