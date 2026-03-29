"""Production-quality auto-scheduling algorithm per spec Section 5.

Steps:
1. GENERATE MISSIONS — from templates for date range
2. HARD FILTER — attendance, work_role, hard rules per slot
3. SCORING — load balance, preferences, partner prefs, variety, soft warnings, future impact
4. PREFERENCE OPTIMIZATION — partner pair boost
5. CONFLICT CHECK + FUTURE SIMULATION — 48h lookahead
6. OUTPUT — proposed assignments with conflicts summary
"""

from datetime import date, time, timedelta, datetime
from uuid import UUID
from collections import defaultdict

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scheduling import (
    ScheduleWindow, ScheduleWindowEmployee, MissionType, MissionTemplate,
    Mission, MissionAssignment,
)
from app.models.employee import Employee, EmployeeWorkRole, EmployeePreference
from app.models.attendance import AttendanceSchedule
from app.models.rules import RuleDefinition


class AutoScheduler:
    """Full auto-scheduling engine per spec."""

    def __init__(self, db: AsyncSession, tenant_id: UUID, user_id: UUID):
        self.db = db
        self.tenant_id = tenant_id
        self.user_id = user_id

    async def run(
        self,
        window_id: UUID,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict:
        """Run the full auto-scheduling algorithm."""
        # Load schedule window
        w_result = await self.db.execute(
            select(ScheduleWindow).where(
                ScheduleWindow.id == window_id,
                ScheduleWindow.tenant_id == self.tenant_id,
            )
        )
        window = w_result.scalar_one_or_none()
        if not window:
            return {"error": "לוח עבודה לא נמצא"}

        if not date_from:
            date_from = window.start_date
        if not date_to:
            date_to = window.end_date

        # Load all needed data
        employees = await self._load_window_employees(window_id)
        mission_types = await self._load_mission_types()
        rules = await self._load_rules()
        attendance = await self._load_attendance(
            [e.id for e in employees], date_from, date_to
        )
        preferences = await self._load_preferences([e.id for e in employees])
        employee_roles = await self._load_employee_roles([e.id for e in employees])

        # Get all draft missions in the window for the date range
        missions = await self._load_missions(window_id, date_from, date_to)

        total_assigned = 0
        total_conflicts_hard = 0
        total_conflicts_soft = 0
        unresolved_slots = 0
        assignment_results = []

        for mission in missions:
            mt = mission_types.get(str(mission.mission_type_id))
            if not mt or not mt.required_slots:
                continue

            required_slots = mt.required_slots if isinstance(mt.required_slots, list) else []

            # Get existing assignments
            existing = await self._get_existing_assignments(mission.id)
            filled_slots = {a.slot_id for a in existing if a.status != "replaced"}

            for slot_def in required_slots:
                slot_id = slot_def.get("slot_id", "default")
                work_role_id = slot_def.get("work_role_id")
                count = slot_def.get("count", 1)

                for i in range(count):
                    slot_key = f"{slot_id}_{i}" if count > 1 else slot_id
                    if slot_key in filled_slots:
                        continue

                    # STEP 2: HARD FILTER
                    eligible = []
                    for emp in employees:
                        if not emp.is_active:
                            continue

                        # Check work_role match
                        if work_role_id and work_role_id not in employee_roles.get(str(emp.id), set()):
                            continue

                        # Check attendance - is schedulable?
                        emp_attendance = attendance.get((str(emp.id), str(mission.date)))
                        if emp_attendance and emp_attendance.get("status_code") in (
                            "home", "going_home", "sick", "released"
                        ):
                            continue

                        # Check not already assigned to this mission
                        already_in_mission = any(
                            a.employee_id == emp.id and a.status != "replaced"
                            for a in existing
                        )
                        if already_in_mission:
                            continue

                        # Check time overlap with other missions same day
                        has_overlap = await self._check_time_overlap(
                            emp.id, mission.date, mission.start_time, mission.end_time, mission.id
                        )
                        if has_overlap:
                            continue

                        # Check hard rules
                        hard_blocked, hard_reasons = await self._evaluate_hard_rules(
                            emp, mission, mt, rules, attendance
                        )
                        if hard_blocked:
                            total_conflicts_hard += 1
                            continue

                        eligible.append(emp)

                    if not eligible:
                        unresolved_slots += 1
                        continue

                    # STEP 3: SCORING
                    scored = []
                    for emp in eligible:
                        score = await self._calculate_score(
                            emp, mission, mt, missions, attendance,
                            preferences, employee_roles, employees, existing
                        )
                        scored.append((emp, score))

                    # Sort by score descending
                    scored.sort(key=lambda x: x[1]["total"], reverse=True)

                    # STEP 4: PREFERENCE OPTIMIZATION — boost partner pairs
                    scored = self._apply_partner_boost(scored, existing, preferences)
                    scored.sort(key=lambda x: x[1]["total"], reverse=True)

                    # STEP 6: Assign top scorer
                    best_emp, best_score = scored[0]

                    soft_warnings = best_score.get("soft_warnings", [])
                    if soft_warnings:
                        total_conflicts_soft += len(soft_warnings)

                    assignment = MissionAssignment(
                        mission_id=mission.id,
                        employee_id=best_emp.id,
                        work_role_id=work_role_id or list(employee_roles.get(str(best_emp.id), set()))[0] if employee_roles.get(str(best_emp.id)) else best_emp.id,
                        slot_id=slot_key,
                        status="proposed",
                        assigned_at=datetime.utcnow(),
                        conflicts_detected=soft_warnings if soft_warnings else None,
                    )
                    self.db.add(assignment)
                    await self.db.flush()

                    existing.append(assignment)
                    filled_slots.add(slot_key)
                    total_assigned += 1

                    assignment_results.append({
                        "mission_id": str(mission.id),
                        "mission_name": mission.name,
                        "employee_id": str(best_emp.id),
                        "employee_name": best_emp.full_name,
                        "slot_id": slot_key,
                        "score": best_score["total"],
                        "soft_warnings": soft_warnings,
                    })

        await self.db.commit()

        return {
            "total_assigned": total_assigned,
            "total_hard_conflicts": total_conflicts_hard,
            "total_soft_warnings": total_conflicts_soft,
            "unresolved_slots": unresolved_slots,
            "missions_processed": len(missions),
            "assignments": assignment_results,
        }

    async def _load_window_employees(self, window_id: UUID) -> list:
        result = await self.db.execute(
            select(Employee)
            .join(ScheduleWindowEmployee, Employee.id == ScheduleWindowEmployee.employee_id)
            .where(
                ScheduleWindowEmployee.schedule_window_id == window_id,
                Employee.is_active.is_(True),
            )
            .order_by(Employee.full_name)
        )
        employees = list(result.scalars().all())

        # Fallback: if no employees assigned to window, use all active tenant employees
        if not employees:
            fallback = await self.db.execute(
                select(Employee).where(
                    Employee.tenant_id == self.tenant_id,
                    Employee.is_active.is_(True),
                ).order_by(Employee.full_name)
            )
            employees = list(fallback.scalars().all())

        return employees

    async def _load_mission_types(self) -> dict:
        result = await self.db.execute(
            select(MissionType).where(
                MissionType.tenant_id == self.tenant_id,
                MissionType.is_active.is_(True),
            )
        )
        return {str(mt.id): mt for mt in result.scalars().all()}

    async def _load_rules(self) -> list:
        result = await self.db.execute(
            select(RuleDefinition).where(
                RuleDefinition.tenant_id == self.tenant_id,
                RuleDefinition.is_active.is_(True),
            ).order_by(RuleDefinition.priority)
        )
        return list(result.scalars().all())

    async def _load_attendance(self, employee_ids: list, date_from: date, date_to: date) -> dict:
        if not employee_ids:
            return {}
        result = await self.db.execute(
            select(AttendanceSchedule).where(
                AttendanceSchedule.tenant_id == self.tenant_id,
                AttendanceSchedule.employee_id.in_(employee_ids),
                AttendanceSchedule.date >= date_from,
                AttendanceSchedule.date <= date_to,
            )
        )
        att = {}
        for a in result.scalars().all():
            att[(str(a.employee_id), str(a.date))] = {
                "status_code": a.status_code,
                "notes": a.notes,
            }
        return att

    async def _load_preferences(self, employee_ids: list) -> dict:
        if not employee_ids:
            return {}
        result = await self.db.execute(
            select(EmployeePreference).where(
                EmployeePreference.employee_id.in_(employee_ids)
            )
        )
        return {str(p.employee_id): p for p in result.scalars().all()}

    async def _load_employee_roles(self, employee_ids: list) -> dict:
        if not employee_ids:
            return {}
        result = await self.db.execute(
            select(EmployeeWorkRole).where(
                EmployeeWorkRole.employee_id.in_(employee_ids)
            )
        )
        roles = defaultdict(set)
        for ewr in result.scalars().all():
            roles[str(ewr.employee_id)].add(str(ewr.work_role_id))
        return dict(roles)

    async def _load_missions(self, window_id: UUID, date_from: date, date_to: date) -> list:
        result = await self.db.execute(
            select(Mission).where(
                Mission.tenant_id == self.tenant_id,
                Mission.schedule_window_id == window_id,
                Mission.status.in_(["draft", "proposed"]),
                Mission.date >= date_from,
                Mission.date <= date_to,
            ).order_by(Mission.date, Mission.start_time)
        )
        return list(result.scalars().all())

    async def _get_existing_assignments(self, mission_id: UUID) -> list:
        result = await self.db.execute(
            select(MissionAssignment).where(MissionAssignment.mission_id == mission_id)
        )
        return list(result.scalars().all())

    async def _check_time_overlap(
        self, employee_id: UUID, mission_date: date,
        start_time: time, end_time: time, exclude_mission_id: UUID
    ) -> bool:
        result = await self.db.execute(
            select(MissionAssignment)
            .join(Mission, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == employee_id,
                Mission.date == mission_date,
                Mission.id != exclude_mission_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.start_time < end_time,
                Mission.end_time > start_time,
            )
        )
        return result.scalar_one_or_none() is not None

    async def _evaluate_hard_rules(
        self, employee, mission, mission_type, rules, attendance
    ) -> tuple[bool, list]:
        """Evaluate hard rules. Returns (is_blocked, reasons)."""
        reasons = []

        for rule in rules:
            if rule.severity != "hard":
                continue
            if not rule.condition_expression:
                continue

            conditions = rule.condition_expression
            params = rule.parameters or {}

            # Check scope
            if rule.scope == "work_role" and rule.scope_ref_id:
                # Only applies if employee has this role
                pass
            elif rule.scope == "mission_type" and rule.scope_ref_id:
                if str(mission.mission_type_id) != str(rule.scope_ref_id):
                    continue

            # Evaluate conditions
            blocked = await self._evaluate_condition_group(
                conditions, employee, mission, mission_type, attendance, params
            )
            if blocked:
                msg = rule.name if isinstance(rule.name, str) else (rule.name.get("he", str(rule.name)) if isinstance(rule.name, dict) else str(rule.name))
                reasons.append({
                    "rule_id": str(rule.id),
                    "severity": "hard",
                    "message": {"he": msg, "en": msg},
                })

        return len(reasons) > 0, reasons

    async def _evaluate_condition_group(
        self, conditions, employee, mission, mission_type, attendance, params
    ) -> bool:
        """Evaluate a condition group (AND/OR tree)."""
        if not conditions:
            return False

        operator = conditions.get("operator", "AND")
        conds = conditions.get("conditions", [])

        if not conds:
            return False

        results = []
        for cond in conds:
            if "operator" in cond:
                # Nested group
                r = await self._evaluate_condition_group(
                    cond, employee, mission, mission_type, attendance, params
                )
                results.append(r)
            else:
                r = await self._evaluate_single_condition(
                    cond, employee, mission, mission_type, attendance, params
                )
                results.append(r)

        if operator == "AND":
            return all(results)
        elif operator == "OR":
            return any(results)
        return False

    async def _evaluate_single_condition(
        self, condition, employee, mission, mission_type, attendance, params
    ) -> bool:
        """Evaluate a single condition."""
        field = condition.get("field", "")
        op = condition.get("op", "")
        value = condition.get("value")
        value_param = condition.get("value_param")

        if value_param and value_param in params:
            value = params[value_param]

        # Resolve field value
        field_value = await self._resolve_field(field, employee, mission, mission_type, attendance)

        # Apply operator
        try:
            if op == "less_than":
                return field_value is not None and float(field_value) < float(value)
            elif op == "greater_than":
                return field_value is not None and float(field_value) > float(value)
            elif op == "equals":
                return str(field_value) == str(value)
            elif op == "not_equals":
                return str(field_value) != str(value)
            elif op == "is_true":
                return bool(field_value) is True
            elif op == "is_false":
                return bool(field_value) is False
            elif op == "in":
                return field_value in (value if isinstance(value, list) else [value])
            elif op == "not_in":
                return field_value not in (value if isinstance(value, list) else [value])
            elif op == "between":
                if isinstance(value, list) and len(value) == 2:
                    return float(value[0]) <= float(field_value or 0) <= float(value[1])
            elif op == "is_null":
                return field_value is None
            elif op == "is_not_null":
                return field_value is not None
            elif op == "contains":
                return str(value) in str(field_value or "")
        except (TypeError, ValueError):
            return False

        return False

    async def _resolve_field(self, field, employee, mission, mission_type, attendance) -> any:
        """Resolve a condition field to its actual value."""
        if field == "employee.hours_since_last_mission":
            return await self._hours_since_last_mission(employee.id, mission.date, mission.start_time)
        elif field == "employee.total_work_hours_today":
            return await self._total_work_hours_today(employee.id, mission.date)
        elif field == "employee.assignments_count_today":
            return await self._assignments_count_today(employee.id, mission.date)
        elif field == "employee.last_mission_was_night":
            return await self._last_mission_was_night(employee.id, mission.date)
        elif field == "employee.next_day_attendance_status":
            next_day = mission.date + timedelta(days=1)
            att = attendance.get((str(employee.id), str(next_day)))
            return att["status_code"] if att else None
        elif field == "employee.current_day_attendance_status":
            att = attendance.get((str(employee.id), str(mission.date)))
            return att["status_code"] if att else None
        elif field == "employee.yesterday_was_standby_not_activated":
            return await self._yesterday_standby_not_activated(employee.id, mission.date)
        elif field == "mission.start_hour":
            return mission.start_time.hour if mission.start_time else None
        elif field == "mission.is_night":
            if mission.start_time:
                h = mission.start_time.hour
                return h >= 22 or h < 6
            return False
        elif field == "mission.type_id":
            return str(mission.mission_type_id)
        elif field == "mission.duration_hours":
            if mission_type and mission_type.duration_hours:
                return float(mission_type.duration_hours)
            return None
        return None

    async def _hours_since_last_mission(self, employee_id, mission_date, mission_start_time) -> float:
        """Calculate hours since the employee's last mission ended."""
        result = await self.db.execute(
            select(Mission)
            .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.date <= mission_date,
            )
            .order_by(Mission.date.desc(), Mission.end_time.desc())
            .limit(1)
        )
        last_mission = result.scalar_one_or_none()
        if not last_mission:
            return 999  # No previous mission

        # Calculate hours between end of last mission and start of this one
        last_end = datetime.combine(last_mission.date, last_mission.end_time)
        this_start = datetime.combine(mission_date, mission_start_time)

        # Handle cross-midnight missions
        if last_mission.end_time < last_mission.start_time:
            last_end = datetime.combine(last_mission.date + timedelta(days=1), last_mission.end_time)

        diff = (this_start - last_end).total_seconds() / 3600
        return max(0, diff)

    async def _total_work_hours_today(self, employee_id, mission_date) -> float:
        result = await self.db.execute(
            select(Mission)
            .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.date == mission_date,
            )
        )
        total = 0
        for m in result.scalars().all():
            start_h = m.start_time.hour + m.start_time.minute / 60
            end_h = m.end_time.hour + m.end_time.minute / 60
            if end_h < start_h:
                end_h += 24  # Cross-midnight
            total += end_h - start_h
        return total

    async def _assignments_count_today(self, employee_id, mission_date) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(MissionAssignment)
            .join(Mission, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.date == mission_date,
            )
        )
        return result.scalar() or 0

    async def _last_mission_was_night(self, employee_id, mission_date) -> bool:
        result = await self.db.execute(
            select(Mission)
            .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.date < mission_date,
            )
            .order_by(Mission.date.desc(), Mission.end_time.desc())
            .limit(1)
        )
        m = result.scalar_one_or_none()
        if m and m.start_time:
            return m.start_time.hour >= 22 or m.start_time.hour < 6
        return False

    async def _yesterday_standby_not_activated(self, employee_id, mission_date) -> bool:
        yesterday = mission_date - timedelta(days=1)
        result = await self.db.execute(
            select(Mission)
            .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
            .join(MissionType, Mission.mission_type_id == MissionType.id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.date == yesterday,
                MissionType.is_standby.is_(True),
                Mission.is_activated.is_(False),
            )
        )
        return result.scalar_one_or_none() is not None

    async def _calculate_score(
        self, employee, mission, mission_type, all_missions,
        attendance, preferences, employee_roles, all_employees, current_assignments
    ) -> dict:
        """Calculate comprehensive score for an employee-mission pair."""
        score = 100
        breakdown = {}
        soft_warnings = []

        # Load balance: fewer assignments in last 7 days = higher score
        week_ago = mission.date - timedelta(days=7)
        week_count = await self._count_assignments_in_range(employee.id, week_ago, mission.date)

        # Calculate average
        avg_counts = []
        for emp in all_employees:
            c = await self._count_assignments_in_range(emp.id, week_ago, mission.date)
            avg_counts.append(c)
        avg = sum(avg_counts) / len(avg_counts) if avg_counts else 0

        if week_count < avg:
            score += 20
            breakdown["load_balance"] = +20
        elif week_count > avg + 2:
            score -= 15
            breakdown["load_balance"] = -15
            soft_warnings.append({
                "type": "high_load",
                "severity": "soft",
                "message": {"he": f"עומס גבוה: {week_count} שיבוצים ב-7 ימים אחרונים", "en": f"High load: {week_count} assignments in last 7 days"},
            })

        # Partner preference
        emp_prefs = preferences.get(str(employee.id))
        if emp_prefs and emp_prefs.partner_preferences:
            for pp in emp_prefs.partner_preferences:
                partner_id = pp.get("employee_id")
                weight = pp.get("weight", 10)
                # Check if partner is already assigned to this mission
                for a in current_assignments:
                    if str(a.employee_id) == partner_id and a.status != "replaced":
                        score += min(weight, 15)
                        breakdown["partner_pref"] = min(weight, 15)
                        break

        # Mission type preference
        if emp_prefs and emp_prefs.mission_type_preferences:
            for mp in emp_prefs.mission_type_preferences:
                if mp.get("mission_type_id") == str(mission.mission_type_id):
                    pref = mp.get("preference", "neutral")
                    if pref == "prefer":
                        score += 10
                        breakdown["mission_pref"] = +10
                    elif pref == "avoid":
                        score -= 10
                        breakdown["mission_pref"] = -10
                        soft_warnings.append({
                            "type": "preference_mismatch",
                            "severity": "soft",
                            "message": {"he": "החייל מעדיף להימנע מסוג משימה זה", "en": "Soldier prefers to avoid this mission type"},
                        })

        # Time slot preference
        if emp_prefs and emp_prefs.time_slot_preferences:
            is_night = mission.start_time and (mission.start_time.hour >= 22 or mission.start_time.hour < 6)
            is_morning = mission.start_time and 6 <= mission.start_time.hour < 14
            slot_key = "night" if is_night else ("morning" if is_morning else "afternoon")
            for tp in emp_prefs.time_slot_preferences:
                if tp.get("slot_key") == slot_key:
                    pref = tp.get("preference", "neutral")
                    if pref == "prefer":
                        score += 10
                        breakdown["time_pref"] = +10
                    elif pref == "avoid":
                        score -= 10
                        breakdown["time_pref"] = -10

        # Variety: bonus if hasn't done this type recently
        recent_same_type = await self._recent_same_type_count(
            employee.id, mission.mission_type_id, mission.date
        )
        if recent_same_type == 0:
            score += 5
            breakdown["variety"] = +5

        # Soft rules
        for rule in await self._get_soft_rules():
            triggered = await self._evaluate_condition_group(
                rule.condition_expression or {}, employee, mission, mission_type, attendance, rule.parameters or {}
            )
            if triggered:
                score -= 10
                breakdown["soft_rule"] = breakdown.get("soft_rule", 0) - 10
                rule_name = rule.name if isinstance(rule.name, str) else (rule.name.get("he", "") if isinstance(rule.name, dict) else "")
                soft_warnings.append({
                    "type": "soft_rule",
                    "rule_id": str(rule.id),
                    "severity": "soft",
                    "message": {"he": rule_name, "en": rule_name},
                })

        # Future impact: check if assigning now creates hard conflict in next 48h
        future_conflict = await self._check_future_impact(employee.id, mission)
        if future_conflict:
            score -= 20
            breakdown["future_impact"] = -20
            soft_warnings.append({
                "type": "future_impact",
                "severity": "soft",
                "message": {"he": "שיבוץ זה עלול לגרום להתנגשות ב-48 השעות הקרובות", "en": "This assignment may cause a conflict in the next 48 hours"},
            })

        # Recent night penalty
        last_night = await self._last_mission_was_night(employee.id, mission.date)
        if last_night and mission.start_time and mission.start_time.hour >= 22:
            score -= 15
            breakdown["recent_night"] = -15

        return {
            "total": score,
            "breakdown": breakdown,
            "soft_warnings": soft_warnings,
        }

    def _apply_partner_boost(self, scored, current_assignments, preferences) -> list:
        """Boost score for partner pairs."""
        for i, (emp, score) in enumerate(scored):
            emp_prefs = preferences.get(str(emp.id))
            if not emp_prefs or not emp_prefs.partner_preferences:
                continue
            for pp in emp_prefs.partner_preferences:
                partner_id = pp.get("employee_id")
                # Check if partner is also in scored list
                for j, (other_emp, other_score) in enumerate(scored):
                    if str(other_emp.id) == partner_id:
                        # Both want each other? Mutual boost
                        other_prefs = preferences.get(str(other_emp.id))
                        if other_prefs and other_prefs.partner_preferences:
                            for op in other_prefs.partner_preferences:
                                if op.get("employee_id") == str(emp.id):
                                    scored[i] = (emp, {**score, "total": score["total"] + 25})
                                    scored[j] = (other_emp, {**other_score, "total": other_score["total"] + 25})
        return scored

    async def _count_assignments_in_range(self, employee_id, date_from, date_to) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(MissionAssignment)
            .join(Mission, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.date >= date_from,
                Mission.date <= date_to,
            )
        )
        return result.scalar() or 0

    async def _recent_same_type_count(self, employee_id, mission_type_id, mission_date) -> int:
        week_ago = mission_date - timedelta(days=7)
        result = await self.db.execute(
            select(func.count())
            .select_from(MissionAssignment)
            .join(Mission, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.mission_type_id == mission_type_id,
                Mission.date >= week_ago,
                Mission.date < mission_date,
            )
        )
        return result.scalar() or 0

    async def _get_soft_rules(self) -> list:
        result = await self.db.execute(
            select(RuleDefinition).where(
                RuleDefinition.tenant_id == self.tenant_id,
                RuleDefinition.is_active.is_(True),
                RuleDefinition.severity == "soft",
            ).order_by(RuleDefinition.priority)
        )
        return list(result.scalars().all())

    async def _check_future_impact(self, employee_id, mission) -> bool:
        """Check if assigning this mission creates issues in the next 48h."""
        # Simple check: after this mission ends, does the employee have enough rest
        # before their next mission in the next 48h?
        future_date = mission.date + timedelta(days=2)
        result = await self.db.execute(
            select(Mission)
            .join(MissionAssignment, Mission.id == MissionAssignment.mission_id)
            .where(
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.notin_(["replaced", "cancelled"]),
                Mission.date > mission.date,
                Mission.date <= future_date,
            )
            .order_by(Mission.date, Mission.start_time)
            .limit(1)
        )
        next_mission = result.scalar_one_or_none()
        if not next_mission:
            return False

        # Calculate rest hours
        mission_end = datetime.combine(mission.date, mission.end_time)
        if mission.end_time < mission.start_time:
            mission_end = datetime.combine(mission.date + timedelta(days=1), mission.end_time)

        next_start = datetime.combine(next_mission.date, next_mission.start_time)
        rest_hours = (next_start - mission_end).total_seconds() / 3600

        return rest_hours < 16  # Default minimum rest
