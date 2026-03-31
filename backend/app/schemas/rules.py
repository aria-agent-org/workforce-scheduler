"""Rules engine schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class RuleCreate(BaseModel):
    name: dict  # {"he": "...", "en": "..."}
    description: dict | None = None
    category: str = "general"
    scope: str = "global"
    scope_ref_id: UUID | None = None
    condition_expression: dict  # {"operator": "and", "conditions": [...]}
    action_expression: dict  # {"type": "block"|"warn"|"score", ...}
    parameters: dict | None = None
    severity: str = "soft"  # "soft" | "hard"
    override_permission: str | None = None
    priority: int = 0

class RuleUpdate(BaseModel):
    name: dict | None = None
    description: dict | None = None
    category: str | None = None
    condition_expression: dict | None = None
    action_expression: dict | None = None
    parameters: dict | None = None
    severity: str | None = None
    priority: int | None = None
    is_active: bool | None = None

class RuleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: dict
    description: dict | None = None
    category: str
    scope: str
    scope_ref_id: UUID | None = None
    condition_expression: dict
    action_expression: dict
    parameters: dict | None = None
    severity: str
    override_permission: str | None = None
    is_active: bool
    priority: int
    is_system_template: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class RuleEvaluateRequest(BaseModel):
    employee_id: UUID
    mission_id: UUID
    slot_id: str | None = None

class RuleEvaluateResponse(BaseModel):
    is_blocked: bool
    hard_conflicts: list[dict]
    soft_warnings: list[dict]
    score_adjustment: float

class RuleTestRequest(BaseModel):
    condition_expression: dict
    test_context: dict  # Mock context for testing

class RuleTestResponse(BaseModel):
    result: bool
    matched_conditions: list[str]
    explanation: str
