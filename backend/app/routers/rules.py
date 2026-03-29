"""Rules engine endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.rules import RuleDefinition
from app.models.audit import AuditLog
from app.schemas.rules import (
    RuleCreate, RuleUpdate, RuleResponse,
    RuleEvaluateRequest, RuleEvaluateResponse,
    RuleTestRequest, RuleTestResponse,
)

router = APIRouter()


@router.get("")
async def list_rules(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    category: str | None = None, active_only: bool = False,
) -> list[dict]:
    query = select(RuleDefinition).where(RuleDefinition.tenant_id == tenant.id)
    if active_only:
        query = query.where(RuleDefinition.is_active.is_(True))
    if category:
        query = query.where(RuleDefinition.category == category)
    query = query.order_by(RuleDefinition.priority.desc())
    result = await db.execute(query)
    return [RuleResponse.model_validate(r).model_dump() for r in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_rule(
    data: RuleCreate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    rule = RuleDefinition(tenant_id=tenant.id, **data.model_dump())
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="rule", entity_id=rule.id,
        after_state={"name": rule.name, "category": rule.category},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return RuleResponse.model_validate(rule).model_dump()


@router.get("/{rule_id}")
async def get_rule(
    rule_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(RuleDefinition).where(RuleDefinition.id == rule_id, RuleDefinition.tenant_id == tenant.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="חוק לא נמצא")
    return RuleResponse.model_validate(rule).model_dump()


@router.patch("/{rule_id}")
async def update_rule(
    rule_id: UUID, data: RuleUpdate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(RuleDefinition).where(RuleDefinition.id == rule_id, RuleDefinition.tenant_id == tenant.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="חוק לא נמצא")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await db.flush()
    await db.refresh(rule)
    await db.commit()
    return RuleResponse.model_validate(rule).model_dump()


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: UUID, tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(RuleDefinition).where(RuleDefinition.id == rule_id, RuleDefinition.tenant_id == tenant.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="חוק לא נמצא")
    rule.is_active = False
    await db.commit()


@router.post("/evaluate")
async def evaluate_rules(
    data: RuleEvaluateRequest,
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    """Evaluate all active rules against a proposed assignment."""
    from app.services.rules_engine import evaluate_assignment
    result = await evaluate_assignment(db, tenant.id, data.employee_id, data.mission_id)
    return result


@router.post("/test")
async def test_rule(
    data: RuleTestRequest,
    tenant: CurrentTenant, user: CurrentUser,
) -> dict:
    """Test a rule condition against mock context."""
    from app.services.rules_engine import evaluate_condition
    result = evaluate_condition(data.condition_expression, data.test_context)
    return {
        "result": result,
        "matched_conditions": [],
        "explanation": "תנאי עבר בהצלחה" if result else "תנאי לא מתקיים",
    }


@router.get("/condition-fields")
async def get_condition_fields(
    tenant: CurrentTenant, user: CurrentUser,
) -> list[dict]:
    """Get available condition fields for rule building."""
    return [
        {"field": "employee.hours_since_last_mission", "type": "number", "label": {"he": "שעות מאז משימה אחרונה", "en": "Hours since last mission"}},
        {"field": "employee.last_mission_was_night", "type": "bool", "label": {"he": "משימה אחרונה הייתה לילה", "en": "Last mission was night"}},
        {"field": "employee.assignments_count_today", "type": "number", "label": {"he": "שיבוצים היום", "en": "Assignments today"}},
        {"field": "employee.total_work_hours_today", "type": "number", "label": {"he": "שעות עבודה היום", "en": "Work hours today"}},
        {"field": "employee.total_work_hours_week", "type": "number", "label": {"he": "שעות עבודה השבוע", "en": "Work hours this week"}},
        {"field": "employee.consecutive_days_worked", "type": "number", "label": {"he": "ימי עבודה רצופים", "en": "Consecutive days worked"}},
        {"field": "employee.status", "type": "select", "label": {"he": "סטטוס עובד", "en": "Employee status"}, "options": ["present", "home", "sick", "vacation"]},
        {"field": "mission.start_hour", "type": "number", "label": {"he": "שעת התחלת משימה", "en": "Mission start hour"}},
        {"field": "mission.end_hour", "type": "number", "label": {"he": "שעת סיום משימה", "en": "Mission end hour"}},
        {"field": "mission.is_night", "type": "bool", "label": {"he": "משימת לילה", "en": "Night mission"}},
        {"field": "mission.duration_hours", "type": "number", "label": {"he": "אורך משימה (שעות)", "en": "Mission duration (hours)"}},
        {"field": "mission.is_weekend", "type": "bool", "label": {"he": "משימת סופ\"ש", "en": "Weekend mission"}},
        {"field": "assignment.is_standby", "type": "bool", "label": {"he": "כוננות", "en": "Standby"}},
    ]
