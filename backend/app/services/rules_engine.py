"""Dynamic rules evaluation engine."""

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rules import RuleDefinition


@dataclass
class EvaluationResult:
    """Result of evaluating all rules against a proposed assignment."""
    is_blocked: bool = False
    hard_conflicts: list[dict] = field(default_factory=list)
    soft_warnings: list[dict] = field(default_factory=list)
    score_adjustment: int = 0
    future_impact_simulation: list[dict] = field(default_factory=list)


# Supported comparison operators
OPERATORS = {
    "less_than": lambda a, b: a < b,
    "greater_than": lambda a, b: a > b,
    "equals": lambda a, b: a == b,
    "not_equals": lambda a, b: a != b,
    "in": lambda a, b: a in b,
    "not_in": lambda a, b: a not in b,
    "between": lambda a, b: b[0] <= a <= b[1] if isinstance(b, (list, tuple)) and len(b) == 2 else False,
    "is_null": lambda a, _: a is None,
    "is_not_null": lambda a, _: a is not None,
    "is_true": lambda a, _: bool(a),
    "is_false": lambda a, _: not bool(a),
    "contains": lambda a, b: b in str(a) if a else False,
}


def evaluate_condition(condition: dict, context: dict[str, Any]) -> bool:
    """Evaluate a single condition against the context."""
    field_path = condition.get("field", "")
    op = condition.get("op", "equals")
    value = condition.get("value")

    # Resolve field from context (e.g., "employee.hours_since_last_mission")
    parts = field_path.split(".")
    actual = context
    for part in parts:
        if isinstance(actual, dict):
            actual = actual.get(part)
        else:
            actual = getattr(actual, part, None)
        if actual is None:
            break

    operator_fn = OPERATORS.get(op)
    if operator_fn is None:
        return False
    try:
        return operator_fn(actual, value)
    except (TypeError, ValueError):
        return False


def evaluate_condition_group(group: dict, context: dict[str, Any]) -> bool:
    """Evaluate a group of conditions with AND/OR logic."""
    operator = group.get("operator", "AND")
    conditions = group.get("conditions", [])

    results = [evaluate_condition(c, context) for c in conditions]

    if operator == "OR":
        return any(results)
    return all(results)  # Default: AND


async def evaluate_rules(
    db: AsyncSession,
    tenant_id: str,
    context: dict[str, Any],
) -> EvaluationResult:
    """Evaluate all active rules for a tenant against a proposed assignment."""
    result = await db.execute(
        select(RuleDefinition)
        .where(
            RuleDefinition.tenant_id == tenant_id,
            RuleDefinition.is_active.is_(True),
        )
        .order_by(RuleDefinition.priority.desc())
    )
    rules = result.scalars().all()

    evaluation = EvaluationResult()

    for rule in rules:
        # Inject rule parameters into context
        rule_context = {**context}
        if rule.parameters:
            rule_context["params"] = rule.parameters

        triggered = evaluate_condition_group(rule.condition_expression, rule_context)
        if not triggered:
            continue

        action = rule.action_expression or {}
        conflict_info = {
            "rule_id": str(rule.id),
            "rule_name": rule.name,
            "severity": rule.severity,
            "message": action.get("message_template", {}),
        }

        if rule.severity == "hard":
            evaluation.hard_conflicts.append(conflict_info)
            if action.get("block", True):
                evaluation.is_blocked = True
        else:
            evaluation.soft_warnings.append(conflict_info)

        score_delta = action.get("score_delta", 0)
        evaluation.score_adjustment += score_delta

    return evaluation
