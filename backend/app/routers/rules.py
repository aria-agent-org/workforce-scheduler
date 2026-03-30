"""Rules engine endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.permissions import require_permission
from app.models.rules import RuleDefinition
from app.models.audit import AuditLog
from app.schemas.rules import (
    RuleCreate, RuleUpdate, RuleResponse,
    RuleEvaluateRequest, RuleEvaluateResponse,
    RuleTestRequest, RuleTestResponse,
)
from app.schemas.jsonb_validators import ConditionGroup, ActionExpression
from pydantic import ValidationError as PydanticValidationError

router = APIRouter()


def _validate_condition_expression(expr: dict | None) -> None:
    """Validate condition_expression JSONB against ConditionGroup schema."""
    if expr is None:
        return
    try:
        ConditionGroup.model_validate(expr)
    except PydanticValidationError as exc:
        errors = [f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" for e in exc.errors()]
        raise HTTPException(status_code=422, detail={"message": "שגיאת אימות ביטוי תנאי", "errors": errors})


def _validate_action_expression(expr: dict | None) -> None:
    """Validate action_expression JSONB against ActionExpression schema."""
    if expr is None:
        return
    try:
        ActionExpression.model_validate(expr)
    except PydanticValidationError as exc:
        errors = [f"{'.'.join(str(l) for l in e['loc'])}: {e['msg']}" for e in exc.errors()]
        raise HTTPException(status_code=422, detail={"message": "שגיאת אימות ביטוי פעולה", "errors": errors})


@router.get("", dependencies=[Depends(require_permission("rules", "read"))])
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


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("rules", "write"))])
async def create_rule(
    data: RuleCreate, tenant: CurrentTenant, user: CurrentUser,
    request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    _validate_condition_expression(data.condition_expression)
    _validate_action_expression(data.action_expression)
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


@router.get("/condition-fields")
async def get_condition_fields(
    tenant: CurrentTenant, user: CurrentUser,
) -> list[dict]:
    """Get available condition fields for rule building with Hebrew labels, descriptions, and examples."""
    return [
        {
            "field": "employee.hours_since_last_mission", "type": "number",
            "label": {"he": "שעות מנוחה מאז המשימה האחרונה", "en": "Hours since last mission"},
            "description": {"he": "כמה שעות עברו מאז שהחייל סיים את המשימה הקודמת שלו", "en": "Hours elapsed since employee finished their previous mission"},
            "example": "16",
        },
        {
            "field": "employee.last_mission_was_night", "type": "bool",
            "label": {"he": "המשימה האחרונה הייתה לילית", "en": "Last mission was night"},
            "description": {"he": "האם המשימה האחרונה של החייל הייתה בשעות הלילה (23:00-07:00)", "en": "Was the last mission during night hours (23:00-07:00)"},
            "example": "true",
        },
        {
            "field": "employee.assignments_count_today", "type": "number",
            "label": {"he": "מספר שיבוצים היום", "en": "Assignments today"},
            "description": {"he": "כמה משימות יש לחייל ביום הנוכחי (כולל המשימה הנוכחית)", "en": "Number of missions assigned today"},
            "example": "2",
        },
        {
            "field": "employee.total_work_hours_today", "type": "number",
            "label": {"he": "סה\"כ שעות עבודה היום", "en": "Work hours today"},
            "description": {"he": "כמה שעות החייל כבר עבד (או ישובץ לעבוד) היום", "en": "Total hours worked today"},
            "example": "8",
        },
        {
            "field": "employee.total_work_hours_week", "type": "number",
            "label": {"he": "סה\"כ שעות עבודה השבוע", "en": "Work hours this week"},
            "description": {"he": "כמה שעות החייל עבד בשבוע הנוכחי (ראשון עד שבת)", "en": "Total hours worked this week (Sun-Sat)"},
            "example": "40",
        },
        {
            "field": "employee.consecutive_days_worked", "type": "number",
            "label": {"he": "ימי עבודה רצופים", "en": "Consecutive days worked"},
            "description": {"he": "כמה ימים ברצף החייל עבד בלי יום חופש. שימושי לוודא שיש לחיילים ימי מנוחה", "en": "Days worked in a row without a day off"},
            "example": "6",
        },
        {
            "field": "employee.missions_week", "type": "number",
            "label": {"he": "מספר משימות השבוע", "en": "Missions this week"},
            "description": {"he": "כמה משימות ביצע החייל השבוע. שימושי לחלוקה הוגנת", "en": "Number of missions this week"},
            "example": "5",
        },
        {
            "field": "employee.status", "type": "select",
            "label": {"he": "סטטוס נוכחות", "en": "Attendance status"},
            "description": {"he": "הסטטוס הנוכחי של החייל. רק חייל בסטטוס \"נוכח\" ניתן לשיבוץ בדרך כלל", "en": "Current attendance status of the employee"},
            "options": ["present", "home", "sick", "vacation", "training", "reserve"],
            "example": "present",
        },
        {
            "field": "mission.start_hour", "type": "number",
            "label": {"he": "שעת התחלת המשימה", "en": "Mission start hour"},
            "description": {"he": "באיזו שעה המשימה מתחילה (מספר 0-23). לדוגמה 7 = 07:00 בבוקר", "en": "Mission start hour (0-23)"},
            "example": "7",
        },
        {
            "field": "mission.end_hour", "type": "number",
            "label": {"he": "שעת סיום המשימה", "en": "Mission end hour"},
            "description": {"he": "באיזו שעה המשימה נגמרת (מספר 0-23). לדוגמה 15 = 15:00", "en": "Mission end hour (0-23)"},
            "example": "15",
        },
        {
            "field": "mission.is_night", "type": "bool",
            "label": {"he": "משימה לילית", "en": "Night mission"},
            "description": {"he": "האם המשימה מתרחשת בשעות הלילה (בין 23:00 ל-07:00)", "en": "Is the mission during night hours (23:00-07:00)"},
            "example": "true",
        },
        {
            "field": "mission.duration_hours", "type": "number",
            "label": {"he": "משך המשימה (שעות)", "en": "Mission duration (hours)"},
            "description": {"he": "כמה שעות נמשכת המשימה מתחילתה ועד סופה", "en": "Duration of the mission in hours"},
            "example": "8",
        },
        {
            "field": "mission.is_weekend", "type": "bool",
            "label": {"he": "משימה בסוף שבוע", "en": "Weekend mission"},
            "description": {"he": "האם המשימה מתוכננת ליום שישי או שבת", "en": "Is the mission on Friday or Saturday"},
            "example": "false",
        },
        {
            "field": "mission.day_of_week", "type": "number",
            "label": {"he": "יום בשבוע", "en": "Day of week"},
            "description": {"he": "באיזה יום המשימה: 0=ראשון, 1=שני, 2=שלישי, 3=רביעי, 4=חמישי, 5=שישי, 6=שבת", "en": "Day: 0=Sunday ... 6=Saturday"},
            "example": "5",
        },
        {
            "field": "assignment.is_standby", "type": "bool",
            "label": {"he": "כוננות", "en": "Standby"},
            "description": {"he": "האם זו משימת כוננות (לא משמרת פעילה רגילה, אלא זמינות בבית)", "en": "Is this a standby assignment (not active duty)"},
            "example": "false",
        },
    ]
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
    update_data = data.model_dump(exclude_unset=True)
    if "condition_expression" in update_data:
        _validate_condition_expression(update_data["condition_expression"])
    if "action_expression" in update_data:
        _validate_action_expression(update_data["action_expression"])
    for key, value in update_data.items():
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



