"""Rules engine — full 6-stage evaluation pipeline.

Stages:
  1. Basic Availability — attendance_status.is_schedulable + schedule_window.status
  2. Global Hard Rules — scope="global", severity="hard", by priority
  3. Mission-type Hard Rules — scope="mission_type", severity="hard"
  4. Employee-specific Hard Rules — scope="employee", severity="hard" (incl. window overrides)
  5. Soft Warnings — all scopes, severity="soft"
  6. Score Adjustments — action_expression.type == "score"
"""

from uuid import UUID
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rules import RuleDefinition
from app.models.scheduling import (
    Mission, MissionAssignment, MissionType, ScheduleWindow, ScheduleWindowEmployee,
)
from app.models.employee import Employee
from app.models.attendance import AttendanceSchedule, AttendanceStatusDefinition


# ---------------------------------------------------------------------------
# Condition evaluator (recursive, supports AND/OR/NOT + comparison operators)
# ---------------------------------------------------------------------------

def evaluate_condition(condition: dict, context: dict) -> bool:
    """Recursively evaluate a condition expression against a context."""
    if not condition:
        return True

    operator = condition.get("operator", "and")

    # Logical operators — only if "conditions" key is present (i.e. it's a group node)
    # Without this check, leaf conditions without "operator" key default to "and" which
    # would incorrectly evaluate `all([])` = True for any leaf condition
    if operator in ("and", "or", "not", "AND", "OR", "NOT") and "conditions" in condition:
        conditions = condition.get("conditions", [])
        op_lower = operator.lower()
        if op_lower == "and":
            return all(evaluate_condition(c, context) for c in conditions)
        elif op_lower == "or":
            return any(evaluate_condition(c, context) for c in conditions)
        elif op_lower == "not":
            return not evaluate_condition(conditions[0], context) if conditions else True

    # Comparison operators
    field = condition.get("field", "")
    value = condition.get("value")
    # Support both "operator" and "op" keys for conditions
    op = condition.get("op") or condition.get("operator", "eq")

    # Resolve value from parameters if value_param is set
    value_param = condition.get("value_param")
    if value_param and isinstance(context.get("_params"), dict):
        value = context["_params"].get(value_param, value)

    # Resolve field from context
    actual = _resolve_field(field, context)

    if op in ("eq", "equals"):
        return str(actual) == str(value) if actual is not None else value is None
    elif op in ("neq", "not_equals"):
        return str(actual) != str(value)
    elif op in ("gt", "greater_than"):
        return _num(actual) > _num(value)
    elif op in ("gte", "greater_than_or_equal"):
        return _num(actual) >= _num(value)
    elif op in ("lt", "less_than"):
        return _num(actual) < _num(value)
    elif op in ("lte", "less_than_or_equal"):
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


def _resolve_field(field: str, context: dict) -> Any:
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


# ---------------------------------------------------------------------------
# Employee context builder — calculates real values from DB
# ---------------------------------------------------------------------------

async def build_employee_context(
    db: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    mission_date: date,
    mission_start_time: time | None = None,
) -> dict:
    """Build a rich context dict for an employee on a given date.

    Returns keys:
        hours_since_last_mission, last_mission_was_night,
        assignments_count_today, total_work_hours_today,
        next_day_attendance_status, days_until_departure, days_since_return
    """
    ctx: dict[str, Any] = {}

    # --- hours_since_last_mission & last_mission_was_night ---
    last_mission_q = await db.execute(
        select(Mission)
        .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
        .where(
            MissionAssignment.employee_id == employee_id,
            MissionAssignment.status.notin_(["replaced", "cancelled"]),
            Mission.date < mission_date,  # strictly before — don't count same-day missions as "last"
        )
        .order_by(Mission.date.desc(), Mission.end_time.desc())
        .limit(1)
    )
    last_mission = last_mission_q.scalar_one_or_none()

    if last_mission:
        last_end = datetime.combine(last_mission.date, last_mission.end_time)
        # Handle cross-midnight
        if last_mission.end_time < last_mission.start_time:
            last_end = datetime.combine(
                last_mission.date + timedelta(days=1), last_mission.end_time
            )
        ref_start = datetime.combine(
            mission_date, mission_start_time or time(0, 0)
        )
        diff_hours = max(0, (ref_start - last_end).total_seconds() / 3600)
        ctx["hours_since_last_mission"] = round(diff_hours, 2)
        h = last_mission.start_time.hour
        is_night = h >= 22 or h < 6
        # last_mission_was_night is only meaningful if the mission was recent (within 36h)
        # Otherwise the night shift penalty should not apply — the employee has had enough rest
        ctx["last_mission_was_night"] = is_night and diff_hours < 36
    else:
        ctx["hours_since_last_mission"] = 999
        ctx["last_mission_was_night"] = False

    # --- assignments_count_today ---
    count_q = await db.execute(
        select(func.count())
        .select_from(MissionAssignment)
        .join(Mission, MissionAssignment.mission_id == Mission.id)
        .where(
            MissionAssignment.employee_id == employee_id,
            MissionAssignment.status.notin_(["replaced", "cancelled"]),
            Mission.date == mission_date,
        )
    )
    ctx["assignments_count_today"] = count_q.scalar() or 0

    # --- total_work_hours_today ---
    hours_q = await db.execute(
        select(Mission)
        .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
        .where(
            MissionAssignment.employee_id == employee_id,
            MissionAssignment.status.notin_(["replaced", "cancelled"]),
            Mission.date == mission_date,
        )
    )
    total_hours = 0.0
    for m in hours_q.scalars().all():
        s = m.start_time.hour + m.start_time.minute / 60
        e = m.end_time.hour + m.end_time.minute / 60
        if e < s:
            e += 24
        total_hours += e - s
    ctx["total_work_hours_today"] = round(total_hours, 2)

    # --- next_day_attendance_status ---
    next_day = mission_date + timedelta(days=1)
    att_q = await db.execute(
        select(AttendanceSchedule).where(
            AttendanceSchedule.tenant_id == tenant_id,
            AttendanceSchedule.employee_id == employee_id,
            AttendanceSchedule.date == next_day,
        )
    )
    next_att = att_q.scalar_one_or_none()
    ctx["next_day_attendance_status"] = next_att.status_code if next_att else None

    # --- days_until_departure / days_since_return ---
    # Look ahead for first non-present status → days_until_departure
    future_att_q = await db.execute(
        select(AttendanceSchedule)
        .where(
            AttendanceSchedule.tenant_id == tenant_id,
            AttendanceSchedule.employee_id == employee_id,
            AttendanceSchedule.date > mission_date,
            AttendanceSchedule.status_code.in_(["home", "going_home", "released"]),
        )
        .order_by(AttendanceSchedule.date)
        .limit(1)
    )
    future_depart = future_att_q.scalar_one_or_none()
    if future_depart:
        ctx["days_until_departure"] = (future_depart.date - mission_date).days
    else:
        ctx["days_until_departure"] = 999

    # Look back for most recent non-present → days_since_return
    past_att_q = await db.execute(
        select(AttendanceSchedule)
        .where(
            AttendanceSchedule.tenant_id == tenant_id,
            AttendanceSchedule.employee_id == employee_id,
            AttendanceSchedule.date < mission_date,
            AttendanceSchedule.status_code.in_(["home", "going_home", "released"]),
        )
        .order_by(AttendanceSchedule.date.desc())
        .limit(1)
    )
    past_return = past_att_q.scalar_one_or_none()
    if past_return:
        ctx["days_since_return"] = (mission_date - past_return.date).days
    else:
        ctx["days_since_return"] = 999

    return ctx


# ---------------------------------------------------------------------------
# 48-hour future impact simulation
# ---------------------------------------------------------------------------

async def simulate_future_impact(
    db: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    mission: Mission,
    hours: int = 48,
) -> dict:
    """Simulate assigning *mission* to employee and check for hard conflicts
    in the next *hours* window.

    Returns:
        {
            "has_conflict": bool,
            "conflicts": [{"mission_id", "reason", "rest_hours"}],
            "total_hours_in_window": float,
        }
    """
    # Determine the end of this proposed mission
    proposed_end = datetime.combine(mission.date, mission.end_time)
    if mission.end_time < mission.start_time:
        proposed_end += timedelta(days=1)

    window_end = proposed_end + timedelta(hours=hours)

    # Fetch all future assignments for this employee within the window
    result = await db.execute(
        select(Mission)
        .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
        .where(
            MissionAssignment.employee_id == employee_id,
            MissionAssignment.status.notin_(["replaced", "cancelled"]),
            Mission.date >= mission.date,
            Mission.id != mission.id,
        )
        .order_by(Mission.date, Mission.start_time)
    )
    future_missions = result.scalars().all()

    conflicts = []
    total_hours = _mission_duration_hours(mission)

    # Load hard rules for min-rest checking
    rules_q = await db.execute(
        select(RuleDefinition).where(
            RuleDefinition.tenant_id == tenant_id,
            RuleDefinition.is_active.is_(True),
            RuleDefinition.severity == "hard",
        )
    )
    hard_rules = rules_q.scalars().all()

    # Find minimum rest parameter from rules (default 8h)
    min_rest_hours = 8.0
    for rule in hard_rules:
        params = rule.parameters or {}
        if "min_rest_hours" in params:
            min_rest_hours = max(min_rest_hours, float(params["min_rest_hours"]))

    for fm in future_missions:
        fm_start = datetime.combine(fm.date, fm.start_time)
        fm_end = datetime.combine(fm.date, fm.end_time)
        if fm.end_time < fm.start_time:
            fm_end += timedelta(days=1)

        # Only consider missions within the simulation window
        if fm_start > window_end:
            continue

        rest_between = (fm_start - proposed_end).total_seconds() / 3600

        if rest_between < min_rest_hours:
            conflicts.append({
                "mission_id": str(fm.id),
                "reason": f"Only {rest_between:.1f}h rest before next mission (min {min_rest_hours}h)",
                "rest_hours": round(rest_between, 2),
            })

        fm_duration = _mission_duration_hours(fm)
        total_hours += fm_duration

    # Also check total hours in 48h window — flag if > 16h
    has_conflict = len(conflicts) > 0 or total_hours > 16

    if total_hours > 16 and not any(c.get("reason", "").startswith("Total") for c in conflicts):
        conflicts.append({
            "mission_id": None,
            "reason": f"Total {total_hours:.1f}h of work in {hours}h window (max 16h recommended)",
            "rest_hours": None,
        })

    return {
        "has_conflict": has_conflict,
        "conflicts": conflicts,
        "total_hours_in_window": round(total_hours, 2),
    }


def _mission_duration_hours(mission: Mission) -> float:
    """Calculate mission duration in hours."""
    s = mission.start_time.hour + mission.start_time.minute / 60
    e = mission.end_time.hour + mission.end_time.minute / 60
    if e <= s:
        e += 24
    return e - s


# ---------------------------------------------------------------------------
# Full 6-stage evaluation
# ---------------------------------------------------------------------------

async def evaluate_assignment(
    db: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    mission_id: UUID,
) -> dict:
    """Full 6-stage rule evaluation for a proposed employee→mission assignment.

    Returns:
        {
            "is_blocked": bool,
            "blocked_at_stage": int | None,
            "hard_conflicts": [...],
            "soft_warnings": [...],
            "score_adjustment": float,
            "stages_passed": list[int],
        }
    """
    # Load mission
    m_result = await db.execute(select(Mission).where(Mission.id == mission_id))
    mission = m_result.scalar_one_or_none()
    if not mission:
        return _empty_result()

    # Load employee
    emp_result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        return _empty_result()

    # Load mission type
    mt_result = await db.execute(
        select(MissionType).where(MissionType.id == mission.mission_type_id)
    )
    mt_result.scalar_one_or_none()

    hard_conflicts: list[dict] = []
    soft_warnings: list[dict] = []
    score_adjustment = 0.0
    stages_passed: list[int] = []

    # ====== STAGE 1: Basic Availability ======
    blocked_s1 = await _stage1_basic_availability(
        db, tenant_id, employee, mission
    )
    if blocked_s1:
        hard_conflicts.extend(blocked_s1)
        return _result(True, 1, hard_conflicts, soft_warnings, score_adjustment, stages_passed)
    stages_passed.append(1)

    # Build rich employee context for rule evaluation
    emp_ctx = await build_employee_context(
        db, tenant_id, employee_id, mission.date, mission.start_time
    )

    is_night = mission.start_time.hour >= 22 or mission.start_time.hour < 6

    context = {
        "employee": {
            "id": str(employee.id),
            "status": employee.status,
            **emp_ctx,
        },
        "mission": {
            "id": str(mission.id),
            "type_id": str(mission.mission_type_id),
            "start_hour": mission.start_time.hour,
            "end_hour": mission.end_time.hour,
            "is_night": is_night,
            "duration_hours": _mission_duration_hours(mission),
            "is_weekend": mission.date.weekday() >= 5,
            "date": str(mission.date),
        },
    }

    # Load all active rules, ordered by priority descending
    rules_q = await db.execute(
        select(RuleDefinition).where(
            RuleDefinition.tenant_id == tenant_id,
            RuleDefinition.is_active.is_(True),
        ).order_by(RuleDefinition.priority.desc())
    )
    all_rules = rules_q.scalars().all()

    # ====== STAGE 2: Global Hard Rules ======
    global_hard = [
        r for r in all_rules
        if r.severity == "hard" and r.scope == "global"
    ]
    for rule in global_hard:
        ctx = {**context, "_params": rule.parameters or {}}
        try:
            if evaluate_condition(rule.condition_expression, ctx):
                action = rule.action_expression or {}
                hard_conflicts.append(_make_entry(rule, action))
        except Exception:
            continue

    if hard_conflicts:
        return _result(True, 2, hard_conflicts, soft_warnings, score_adjustment, stages_passed)
    stages_passed.append(2)

    # ====== STAGE 3: Mission-type-specific Hard Rules ======
    mt_hard = [
        r for r in all_rules
        if r.severity == "hard"
        and r.scope == "mission_type"
        and (r.scope_ref_id is None or str(r.scope_ref_id) == str(mission.mission_type_id))
    ]
    for rule in mt_hard:
        ctx = {**context, "_params": rule.parameters or {}}
        try:
            if evaluate_condition(rule.condition_expression, ctx):
                action = rule.action_expression or {}
                hard_conflicts.append(_make_entry(rule, action))
        except Exception:
            continue

    if hard_conflicts:
        return _result(True, 3, hard_conflicts, soft_warnings, score_adjustment, stages_passed)
    stages_passed.append(3)

    # ====== STAGE 4: Employee-specific Hard Rules (+ window overrides) ======
    emp_hard = [
        r for r in all_rules
        if r.severity == "hard"
        and r.scope == "employee"
        and (r.scope_ref_id is None or str(r.scope_ref_id) == str(employee_id))
    ]

    # Also check schedule_window employee-specific overrides
    swe_q = await db.execute(
        select(ScheduleWindowEmployee).where(
            ScheduleWindowEmployee.schedule_window_id == mission.schedule_window_id,
            ScheduleWindowEmployee.employee_id == employee_id,
        )
    )
    swe = swe_q.scalar_one_or_none()
    window_overrides = (swe.custom_rules_override or {}) if swe else {}

    for rule in emp_hard:
        rule_id_str = str(rule.id)
        # Check if this rule is overridden for this employee in this window
        if rule_id_str in window_overrides:
            override = window_overrides[rule_id_str]
            if override.get("disabled"):
                continue
            # Allow parameter overrides from window config
            params = {**(rule.parameters or {}), **override.get("parameters", {})}
        else:
            params = rule.parameters or {}

        ctx = {**context, "_params": params}
        try:
            if evaluate_condition(rule.condition_expression, ctx):
                action = rule.action_expression or {}
                hard_conflicts.append(_make_entry(rule, action))
        except Exception:
            continue

    if hard_conflicts:
        return _result(True, 4, hard_conflicts, soft_warnings, score_adjustment, stages_passed)
    stages_passed.append(4)

    # ====== STAGE 5: Soft Warnings (all scopes) ======
    soft_rules = [r for r in all_rules if r.severity == "soft"]
    for rule in soft_rules:
        # Filter by scope
        if rule.scope == "mission_type" and rule.scope_ref_id:
            if str(rule.scope_ref_id) != str(mission.mission_type_id):
                continue
        if rule.scope == "employee" and rule.scope_ref_id:
            if str(rule.scope_ref_id) != str(employee_id):
                continue

        params = rule.parameters or {}
        # Apply window overrides
        rule_id_str = str(rule.id)
        if rule_id_str in window_overrides:
            override = window_overrides[rule_id_str]
            if override.get("disabled"):
                continue
            params = {**params, **override.get("parameters", {})}

        ctx = {**context, "_params": params}
        try:
            if evaluate_condition(rule.condition_expression, ctx):
                action = rule.action_expression or {}
                soft_warnings.append(_make_entry(rule, action))
        except Exception:
            continue

    stages_passed.append(5)

    # ====== STAGE 6: Score Adjustments ======
    score_rules = [
        r for r in all_rules
        if (r.action_expression or {}).get("type") == "score"
    ]
    for rule in score_rules:
        if rule.scope == "mission_type" and rule.scope_ref_id:
            if str(rule.scope_ref_id) != str(mission.mission_type_id):
                continue
        if rule.scope == "employee" and rule.scope_ref_id:
            if str(rule.scope_ref_id) != str(employee_id):
                continue

        ctx = {**context, "_params": rule.parameters or {}}
        try:
            if evaluate_condition(rule.condition_expression, ctx):
                action = rule.action_expression or {}
                adj = float(action.get("adjustment", -10))
                score_adjustment += adj
        except Exception:
            continue

    stages_passed.append(6)

    return _result(
        False, None, hard_conflicts, soft_warnings, score_adjustment, stages_passed
    )


# ---------------------------------------------------------------------------
# Stage 1 helpers
# ---------------------------------------------------------------------------

async def _stage1_basic_availability(
    db: AsyncSession,
    tenant_id: UUID,
    employee: Employee,
    mission: Mission,
) -> list[dict]:
    """Check basic schedulability. Returns list of blocking reasons (empty = OK)."""
    blocks: list[dict] = []

    # 1a. Check attendance status is_schedulable
    att_q = await db.execute(
        select(AttendanceSchedule).where(
            AttendanceSchedule.tenant_id == tenant_id,
            AttendanceSchedule.employee_id == employee.id,
            AttendanceSchedule.date == mission.date,
        )
    )
    att = att_q.scalar_one_or_none()

    if att:
        # Look up the status definition
        status_def_q = await db.execute(
            select(AttendanceStatusDefinition).where(
                AttendanceStatusDefinition.tenant_id == tenant_id,
                AttendanceStatusDefinition.code == att.status_code,
            )
        )
        status_def = status_def_q.scalar_one_or_none()
        if status_def and not status_def.is_schedulable:
            blocks.append({
                "stage": 1,
                "rule_id": None,
                "rule_name": "basic_availability",
                "severity": "hard",
                "message": f"Attendance status '{att.status_code}' is not schedulable",
            })

    # 1b. Check schedule window status == "active"
    sw_q = await db.execute(
        select(ScheduleWindow).where(
            ScheduleWindow.id == mission.schedule_window_id,
        )
    )
    sw = sw_q.scalar_one_or_none()
    if sw and sw.status != "active":
        blocks.append({
            "stage": 1,
            "rule_id": None,
            "rule_name": "window_not_active",
            "severity": "hard",
            "message": f"Schedule window status is '{sw.status}', not 'active'",
        })

    # 1c. Employee not active
    if not employee.is_active:
        blocks.append({
            "stage": 1,
            "rule_id": None,
            "rule_name": "employee_inactive",
            "severity": "hard",
            "message": "Employee is inactive",
        })

    return blocks


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_entry(rule: RuleDefinition, action: dict) -> dict:
    """Build a conflict/warning entry from a rule."""
    name = rule.name
    if isinstance(name, dict):
        name = name.get("he", name.get("en", str(name)))
    msg = action.get("message", rule.description or name)
    if isinstance(msg, dict):
        pass  # keep bilingual dict
    else:
        msg = str(msg)
    return {
        "rule_id": str(rule.id),
        "rule_name": name if isinstance(name, str) else str(name),
        "severity": rule.severity,
        "message": msg,
        "override_permission": rule.override_permission,
    }


def _empty_result() -> dict:
    return {
        "is_blocked": False,
        "blocked_at_stage": None,
        "hard_conflicts": [],
        "soft_warnings": [],
        "score_adjustment": 0,
        "stages_passed": [],
    }


def _result(
    is_blocked: bool,
    blocked_at_stage: int | None,
    hard_conflicts: list,
    soft_warnings: list,
    score_adjustment: float,
    stages_passed: list,
) -> dict:
    return {
        "is_blocked": is_blocked,
        "blocked_at_stage": blocked_at_stage,
        "hard_conflicts": hard_conflicts,
        "soft_warnings": soft_warnings,
        "score_adjustment": score_adjustment,
        "stages_passed": stages_passed,
    }
