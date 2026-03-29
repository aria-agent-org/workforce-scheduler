"""Rules engine — condition evaluator with all operators."""

from uuid import UUID
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rules import RuleDefinition
from app.models.scheduling import Mission, MissionAssignment
from app.models.employee import Employee


def evaluate_condition(condition: dict, context: dict) -> bool:
    """Recursively evaluate a condition expression against a context."""
    if not condition:
        return True

    operator = condition.get("operator", "and")

    # Logical operators
    if operator in ("and", "or", "not"):
        conditions = condition.get("conditions", [])
        if operator == "and":
            return all(evaluate_condition(c, context) for c in conditions)
        elif operator == "or":
            return any(evaluate_condition(c, context) for c in conditions)
        elif operator == "not":
            return not evaluate_condition(conditions[0], context) if conditions else True

    # Comparison operators
    field = condition.get("field", "")
    value = condition.get("value")
    op = condition.get("operator", "eq")

    # Resolve field from context (e.g., "employee.status" -> context["employee"]["status"])
    actual = _resolve_field(field, context)

    if op == "eq":
        return actual == value
    elif op == "neq":
        return actual != value
    elif op == "gt":
        return _num(actual) > _num(value)
    elif op == "gte":
        return _num(actual) >= _num(value)
    elif op == "lt":
        return _num(actual) < _num(value)
    elif op == "lte":
        return _num(actual) <= _num(value)
    elif op == "in":
        return actual in (value if isinstance(value, list) else [value])
    elif op == "not_in":
        return actual not in (value if isinstance(value, list) else [value])
    elif op == "between":
        if isinstance(value, list) and len(value) == 2:
            return _num(value[0]) <= _num(actual) <= _num(value[1])
        return False
    elif op == "contains":
        return str(value) in str(actual) if actual else False
    elif op == "is_true":
        return bool(actual)
    elif op == "is_false":
        return not bool(actual)
    elif op == "is_null":
        return actual is None
    elif op == "is_not_null":
        return actual is not None

    return True


def _resolve_field(field: str, context: dict):
    """Resolve a dotted field path from context."""
    parts = field.split(".")
    current = context
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _num(val) -> float:
    """Convert value to number for comparison."""
    try:
        return float(val) if val is not None else 0
    except (TypeError, ValueError):
        return 0


async def evaluate_assignment(
    db: AsyncSession, tenant_id: UUID, employee_id: UUID, mission_id: UUID
) -> dict:
    """Evaluate all active rules against a proposed employee-mission assignment."""
    # Get all active rules
    result = await db.execute(
        select(RuleDefinition).where(
            RuleDefinition.tenant_id == tenant_id,
            RuleDefinition.is_active.is_(True),
        ).order_by(RuleDefinition.priority.desc())
    )
    rules = result.scalars().all()

    # Get mission info
    m_result = await db.execute(select(Mission).where(Mission.id == mission_id))
    mission = m_result.scalar_one_or_none()
    if not mission:
        return {"is_blocked": False, "hard_conflicts": [], "soft_warnings": [], "score_adjustment": 0}

    # Get employee info
    emp_result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        return {"is_blocked": False, "hard_conflicts": [], "soft_warnings": [], "score_adjustment": 0}

    # Build context
    # Count today's assignments
    today_count = (await db.execute(
        select(func.count())
        .select_from(MissionAssignment)
        .join(Mission, MissionAssignment.mission_id == Mission.id)
        .where(
            MissionAssignment.employee_id == employee_id,
            Mission.date == mission.date,
            MissionAssignment.status != "replaced",
        )
    )).scalar() or 0

    is_night = mission.start_time.hour >= 22 or mission.start_time.hour < 6

    context = {
        "employee": {
            "id": str(employee.id),
            "status": employee.status,
            "assignments_count_today": today_count,
            "total_work_hours_today": 0,  # Would need calculation
            "hours_since_last_mission": 24,  # Simplified
            "last_mission_was_night": False,
            "consecutive_days_worked": 0,
        },
        "mission": {
            "id": str(mission.id),
            "start_hour": mission.start_time.hour,
            "end_hour": mission.end_time.hour,
            "is_night": is_night,
            "duration_hours": (
                mission.end_time.hour - mission.start_time.hour +
                (24 if mission.end_time < mission.start_time else 0)
            ),
            "is_weekend": mission.date.weekday() >= 5,
        },
    }

    hard_conflicts = []
    soft_warnings = []
    score_adjustment = 0.0

    for rule in rules:
        try:
            matched = evaluate_condition(rule.condition_expression, context)
            if matched:
                action = rule.action_expression or {}
                action_type = action.get("type", "warn")

                entry = {
                    "rule_id": str(rule.id),
                    "rule_name": rule.name,
                    "severity": rule.severity,
                    "message": action.get("message", rule.description or rule.name),
                }

                if rule.severity == "hard" or action_type == "block":
                    hard_conflicts.append(entry)
                elif action_type == "score":
                    score_adjustment += action.get("adjustment", -10)
                    soft_warnings.append(entry)
                else:
                    soft_warnings.append(entry)
        except Exception:
            continue

    return {
        "is_blocked": len(hard_conflicts) > 0,
        "hard_conflicts": hard_conflicts,
        "soft_warnings": soft_warnings,
        "score_adjustment": score_adjustment,
    }
