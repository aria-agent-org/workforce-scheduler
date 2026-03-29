"""Settings endpoints: tenant settings, work roles, role definitions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.tenant import TenantSetting
from app.models.resource import WorkRole, RoleDefinition
from app.models.audit import AuditLog
from app.schemas.settings import (
    TenantSettingUpdate, TenantSettingResponse,
    WorkRoleCreate, WorkRoleUpdate, WorkRoleResponse,
    RoleDefinitionCreate, RoleDefinitionUpdate, RoleDefinitionResponse,
)

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
    result = await db.execute(
        select(WorkRole).where(WorkRole.id == role_id, WorkRole.tenant_id == tenant.id)
    )
    wr = result.scalar_one_or_none()
    if wr:
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


# ═══════════════════════════════════════════
# Tenant Settings (catch-all at the end)
# ═══════════════════════════════════════════

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
