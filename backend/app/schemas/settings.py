"""Settings schemas."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class TenantSettingUpdate(BaseModel):
    value: Any = None

class TenantSettingResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    key: str
    value: Any = None
    value_type: str
    label: dict
    description: dict | None = None
    group: str
    is_editable_by_tenant_admin: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class WorkRoleCreate(BaseModel):
    name: dict
    description: dict | None = None
    color: str | None = None
    sort_order: int = 0

class WorkRoleUpdate(BaseModel):
    name: dict | None = None
    description: dict | None = None
    color: str | None = None
    sort_order: int | None = None

class WorkRoleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: dict
    description: dict | None = None
    color: str | None = None
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class RoleDefinitionCreate(BaseModel):
    name: str
    label: dict
    permissions: dict
    ui_visibility: dict | None = None

class RoleDefinitionUpdate(BaseModel):
    name: str | None = None
    label: dict | None = None
    permissions: dict | None = None
    ui_visibility: dict | None = None

class RoleDefinitionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    label: dict
    permissions: dict
    ui_visibility: dict | None = None
    is_system: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
