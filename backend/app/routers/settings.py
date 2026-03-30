"""Settings endpoints: tenant settings, work roles, role definitions, bot tokens."""

import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
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


@router.post("/work-roles", status_code=status.HTTP_201_CREATED)
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
        ip_address=request.client.host if request.client else None,
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
            expires_at=datetime.utcnow() + timedelta(days=7),
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


@router.get("")
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


@router.patch("/key/{key}")
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
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return TenantSettingResponse.model_validate(setting).model_dump()
