"""Production-quality auto-scheduling algorithm per spec Section 5.

Steps:
1. GENERATE MISSIONS — from templates for date range
2. HARD FILTER — attendance, work_role, hard rules per slot (6-stage engine)
3. SCORING — load balance, preferences, partner prefs, variety, soft warnings, future impact
4. PREFERENCE OPTIMIZATION — partner pair boost (second pass)
5. CONFLICT CHECK + FUTURE SIMULATION — 48h lookahead
6. OUTPUT — proposed assignments with conflicts summary

Scoring factors:
  load_balance:   +20 if fewer assignments than avg in last 7 days
  partner_pref:   +15 if preferred partner already assigned to same mission
  mission_pref:   +10 if employee prefers this mission type
  time_slot_pref: +10 if employee prefers this time slot
  variety:        +5  if hasn't done this mission type recently
  soft_warnings:  -10 per soft warning
  future_impact:  -20 if creates hard conflict in next 48h
  recent_night:   -15 if did night + standby not activated
  mutual_partner: +25 if two employees prefer each other AND both fill slots (second pass)
"""

from datetime import date, timedelta, datetime
from uuid import UUID
from collections import defaultdict

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scheduling import (
    ScheduleWindow, ScheduleWindowEmployee, MissionType, Mission, MissionAssignment,
)
from app.models.employee import Employee, EmployeeWorkRole, EmployeePreference
from app.models.attendance import AttendanceSchedule, AttendanceStatusDefinition
from app.models.rules import RuleDefinition

from app.services.rules_engine import (
    evaluate_condition,
    build_employee_context,
    simulate_future_impact,
)


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
        if not employees:
            return {
                "error": "אין חיילים בלוח זה. הוסף חיילים ללוח לפני שיבוץ אוטומטי.",
                "total_assigned": 0, "unresolved_slots": 0,
                "total_conflicts_hard": 0, "total_conflicts_soft": 0,
                "assignments": [],
            }
        mission_types = await self._load_mission_types()
        rules = await self._load_rules()
        attendance = await self._load_attendance(
            [e.id for e in employees], date_from, date_to
        )
        attendance_defs = await self._load_attendance_definitions()
        preferences = await self._load_preferences([e.id for e in employees])
        employee_roles = await self._load_employee_roles([e.id for e in employees])

        # Pre-compute weekly assignment counts for load balancing
        week_counts = await self._precompute_week_counts(employees, date_from)

        # Get all draft missions in the window for the date range
        missions = await self._load_missions(window_id, date_from, date_to)

        total_assigned = 0
        total_conflicts_hard = 0
        total_conflicts_soft = 0
        unresolved_slots = 0
        assignment_results = []

        for mission in missions:
            mt = mission_types.get(str(mission.mission_type_id))
            # Use slots copied to mission first, fall back to mission type slots
            mission_slots = getattr(mission, "required_slots", None)
            if mission_slots is None and mt:
                mission_slots = mt.required_slots
            if not mission_slots:
                continue

            required_slots = mission_slots if isinstance(mission_slots, list) else []

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

                    # STEP 2: HARD FILTER (6-stage aware)
                    eligible = []
                    for emp in employees:
                        if not emp.is_active:
                            continue

                        # Check work_role match
                        if work_role_id and work_role_id not in employee_roles.get(str(emp.id), set()):
                            continue

                        # Check attendance - is schedulable?
                        emp_attendance = attendance.get((str(emp.id), str(mission.date)))
                        if emp_attendance:
                            status_code = emp_attendance.get("status_code")
                            status_def = attendance_defs.get(status_code)
                            if status_def and not status_def.is_schedulable:
                                continue
                            # Fallback: hard-coded non-schedulable statuses
                            if not status_def and status_code in (
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

                        # Check hard rules (stages 2-4)
                        hard_blocked, hard_reasons = await self._evaluate_hard_rules(
                            emp, mission, mt, rules, attendance
                        )
                        if hard_blocked:
                            total_conflicts_hard += 1
                            continue

                        eligible.append(emp)

                    if not eligible:
                        unresolved_slots += 1
                        assignment_results.append({
                            "mission_name": mission.name,
                            "slot_id": slot_key,
                            "employee_name": None,
                            "score": 0,
                            "soft_warnings": [],
                            "status": "unresolved",
                            "reason": "אין חיילים זמינים לסלוט זה — כולם חולים, בבית, או עם התנגשות",
                        })
                        continue

                    # STEP 3: SCORING (enhanced with all factors)
                    scored = []
                    for emp in eligible:
                        score = await self._calculate_score(
                            emp, mission, mt, missions, attendance,
                            preferences, employee_roles, employees, existing,
                            week_counts, rules,
                        )
                        scored.append((emp, score))

                    # Sort by score descending
                    scored.sort(key=lambda x: x[1]["total"], reverse=True)

                    # STEP 4: PREFERENCE OPTIMIZATION — mutual partner boost (second pass)
                    scored = self._apply_partner_boost(scored, existing, preferences)
                    scored.sort(key=lambda x: x[1]["total"], reverse=True)

                    # STEP 6: Assign top scorer
                    best_emp, best_score = scored[0]

                    soft_warnings = best_score.get("soft_warnings", [])
                    if soft_warnings:
                        total_conflicts_soft += len(soft_warnings)

                    # Determine work_role_id for the assignment
                    assign_role_id = work_role_id
                    if not assign_role_id:
                        emp_roles = employee_roles.get(str(best_emp.id), set())
                        assign_role_id = list(emp_roles)[0] if emp_roles else None

                    # Convert string role ID to UUID if needed
                    from uuid import UUID as _UUID
                    if assign_role_id and isinstance(assign_role_id, str):
                        try:
                            assign_role_id = _UUID(assign_role_id)
                        except ValueError:
                            assign_role_id = None

                    assignment = MissionAssignment(
                        mission_id=mission.id,
                        employee_id=best_emp.id,
                        work_role_id=assign_role_id,
                        slot_id=slot_key,
                        status="proposed",
                        assigned_at=datetime.now(timezone.utc),
                        conflicts_detected=soft_warnings if soft_warnings else None,
                    )
                    self.db.add(assignment)
                    await self.db.flush()

                    existing.append(assignment)
                    filled_slots.add(slot_key)
                    total_assigned += 1

                    # Update in-memory week counts for load balance accuracy
                    week_key = str(best_emp.id)
                    week_counts[week_key] = week_counts.get(week_key, 0) + 1

                    assignment_results.append({
                        "mission_id": str(mission.id),
                        "mission_name": mission.name,
                        "employee_id": str(best_emp.id),
                        "employee_name": best_emp.full_name,
                        "slot_id": slot_key,
                        "score": best_score["total"],
                        "score_breakdown": best_score.get("breakdown", {}),
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

    # ===================================================================
    # Data loaders
    # ===================================================================

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

    async def _load_attendance_definitions(self) -> dict:
        """Load all attendance status definitions for this tenant."""
        result = await self.db.execute(
            select(AttendanceStatusDefinition).where(
                AttendanceStatusDefinition.tenant_id == self.tenant_id,
            )
        )
        return {d.code: d for d in result.scalars().all()}

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
                Mission.status.in_(["draft", "proposed", "active", "published"]),
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

    async def _precompute_week_counts(self, employees: list, ref_date: date) -> dict:
        """Pre-compute assignment counts in the last 7 days for all employees."""
        week_ago = ref_date - timedelta(days=7)
        counts = {}
        for emp in employees:
            result = await self.db.execute(
                select(func.count())
                .select_from(MissionAssignment)
                .join(Mission, MissionAssignment.mission_id == Mission.id)
                .where(
                    MissionAssignment.employee_id == emp.id,
                    MissionAssignment.status.notin_(["replaced", "cancelled"]),
                    Mission.date >= week_ago,
                    Mission.date <= ref_date,
                )
            )
            counts[str(emp.id)] = result.scalar() or 0
        return counts

    # ===================================================================
    # Hard filter helpers
    # ===================================================================

    async def _check_time_overlap(
        self, employee_id: UUID, mission_date: date,
        start_time, end_time, exclude_mission_id: UUID
    ) -> bool:
        if not start_time or not end_time:
            return False  # Can't check overlap without times
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
        return result.scalars().first() is not None

    async def _evaluate_hard_rules(
        self, employee, mission, mission_type, rules, attendance
    ) -> tuple[bool, list]:
        """Evaluate hard rules (stages 2-4). Returns (is_blocked, reasons)."""
        reasons = []

        # Build context once for this employee+mission
        emp_ctx = await build_employee_context(
            self.db, self.tenant_id, employee.id, mission.date, mission.start_time
        )
        is_night = mission.start_time and (mission.start_time.hour >= 22 or mission.start_time.hour < 6)

        context = {
            "employee": {
                "id": str(employee.id),
                "status": employee.status,
                **emp_ctx,
            },
            "mission": {
                "id": str(mission.id),
                "type_id": str(mission.mission_type_id),
                "start_hour": mission.start_time.hour if mission.start_time else 0,
                "end_hour": mission.end_time.hour if mission.end_time else 0,
                "is_night": is_night,
                "duration_hours": (
                    mission_type.duration_hours
                    if mission_type and mission_type.duration_hours
                    else self._calc_duration(mission)
                ),
                "is_weekend": mission.date.weekday() >= 5,
            },
        }

        for rule in rules:
            if rule.severity != "hard":
                continue
            if not rule.condition_expression:
                continue

            # Scope filtering
            if rule.scope == "mission_type" and rule.scope_ref_id:
                if str(mission.mission_type_id) != str(rule.scope_ref_id):
                    continue
            if rule.scope == "employee" and rule.scope_ref_id:
                if str(employee.id) != str(rule.scope_ref_id):
                    continue

            params = rule.parameters or {}
            ctx = {**context, "_params": params}

            try:
                matched = evaluate_condition(rule.condition_expression, ctx)
            except Exception:
                continue

            if matched:
                msg = rule.name
                if isinstance(msg, dict):
                    msg = msg.get("he", msg.get("en", str(msg)))
                reasons.append({
                    "rule_id": str(rule.id),
                    "severity": "hard",
                    "message": {"he": msg, "en": msg},
                })

        return len(reasons) > 0, reasons

    # ===================================================================
    # Enhanced scoring algorithm
    # ===================================================================

    async def _calculate_score(
        self, employee, mission, mission_type, all_missions,
        attendance, preferences, employee_roles, all_employees, current_assignments,
        week_counts: dict, rules: list,
    ) -> dict:
        """Calculate comprehensive score for an employee-mission pair.

        Factors:
          load_balance:   +20 / -15
          partner_pref:   +15
          mission_pref:   +10 / -10
          time_slot_pref: +10 / -10
          variety:        +5
          soft_warnings:  -10 each
          future_impact:  -20
          recent_night:   -15
        """
        score = 100
        breakdown = {}
        soft_warnings = []

        # ------------------------------------------------------------------
        # 1) LOAD BALANCE: +20 if fewer assignments than avg in last 7 days
        # ------------------------------------------------------------------
        emp_week_count = week_counts.get(str(employee.id), 0)
        all_counts = list(week_counts.values())
        avg = sum(all_counts) / len(all_counts) if all_counts else 0

        if emp_week_count < avg:
            score += 20
            breakdown["load_balance"] = +20
        elif emp_week_count > avg + 2:
            score -= 15
            breakdown["load_balance"] = -15
            soft_warnings.append({
                "type": "high_load",
                "severity": "soft",
                "message": {
                    "he": f"עומס גבוה: {emp_week_count} שיבוצים ב-7 ימים אחרונים",
                    "en": f"High load: {emp_week_count} assignments in last 7 days",
                },
            })
        else:
            breakdown["load_balance"] = 0

        # ------------------------------------------------------------------
        # 2) PARTNER PREFERENCE: +15 if preferred partner already assigned
        # ------------------------------------------------------------------
        emp_prefs = preferences.get(str(employee.id))
        partner_bonus_applied = False
        if emp_prefs and emp_prefs.partner_preferences:
            for pp in emp_prefs.partner_preferences:
                partner_id = pp.get("employee_id")
                weight = min(pp.get("weight", 15), 15)
                for a in current_assignments:
                    if str(a.employee_id) == partner_id and a.status != "replaced":
                        score += weight
                        breakdown["partner_pref"] = weight
                        partner_bonus_applied = True
                        break
                if partner_bonus_applied:
                    break
        if not partner_bonus_applied:
            breakdown["partner_pref"] = 0

        # ------------------------------------------------------------------
        # 3) MISSION TYPE PREFERENCE: +10 prefer / -10 avoid
        # ------------------------------------------------------------------
        mission_pref_applied = False
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
                            "message": {
                                "he": "החייל מעדיף להימנע מסוג משימה זה",
                                "en": "Employee prefers to avoid this mission type",
                            },
                        })
                    else:
                        breakdown["mission_pref"] = 0
                    mission_pref_applied = True
                    break
        if not mission_pref_applied:
            breakdown["mission_pref"] = 0

        # ------------------------------------------------------------------
        # 4) TIME SLOT PREFERENCE: +10 prefer / -10 avoid
        # ------------------------------------------------------------------
        is_night = mission.start_time and (
            mission.start_time.hour >= 22 or mission.start_time.hour < 6
        )
        is_morning = mission.start_time and 6 <= mission.start_time.hour < 14
        slot_key = "night" if is_night else ("morning" if is_morning else "afternoon")

        time_pref_applied = False
        if emp_prefs and emp_prefs.time_slot_preferences:
            for tp in emp_prefs.time_slot_preferences:
                if tp.get("slot_key") == slot_key:
                    pref = tp.get("preference", "neutral")
                    if pref == "prefer":
                        score += 10
                        breakdown["time_slot_pref"] = +10
                    elif pref == "avoid":
                        score -= 10
                        breakdown["time_slot_pref"] = -10
                    else:
                        breakdown["time_slot_pref"] = 0
                    time_pref_applied = True
                    break
        if not time_pref_applied:
            breakdown["time_slot_pref"] = 0

        # ------------------------------------------------------------------
        # 5) VARIETY: +5 if hasn't done this mission type in last 7 days
        # ------------------------------------------------------------------
        recent_same = await self._recent_same_type_count(
            employee.id, mission.mission_type_id, mission.date
        )
        if recent_same == 0:
            score += 5
            breakdown["variety"] = +5
        else:
            breakdown["variety"] = 0

        # ------------------------------------------------------------------
        # 6) SOFT WARNINGS: -10 per soft rule triggered
        # ------------------------------------------------------------------
        emp_ctx = await build_employee_context(
            self.db, self.tenant_id, employee.id, mission.date, mission.start_time
        )
        context = {
            "employee": {
                "id": str(employee.id),
                "status": employee.status,
                **emp_ctx,
            },
            "mission": {
                "id": str(mission.id),
                "type_id": str(mission.mission_type_id),
                "start_hour": mission.start_time.hour if mission.start_time else 0,
                "end_hour": mission.end_time.hour if mission.end_time else 0,
                "is_night": is_night,
                "duration_hours": self._calc_duration(mission),
                "is_weekend": mission.date.weekday() >= 5,
            },
        }

        soft_rule_penalty = 0
        for rule in rules:
            if rule.severity != "soft":
                continue
            if not rule.condition_expression:
                continue
            # Scope filtering
            if rule.scope == "mission_type" and rule.scope_ref_id:
                if str(rule.scope_ref_id) != str(mission.mission_type_id):
                    continue
            if rule.scope == "employee" and rule.scope_ref_id:
                if str(rule.scope_ref_id) != str(employee.id):
                    continue

            ctx = {**context, "_params": rule.parameters or {}}
            try:
                triggered = evaluate_condition(rule.condition_expression, ctx)
            except Exception:
                continue

            if triggered:
                soft_rule_penalty -= 10
                rule_name = rule.name
                if isinstance(rule_name, dict):
                    rule_name = rule_name.get("he", rule_name.get("en", ""))
                soft_warnings.append({
                    "type": "soft_rule",
                    "rule_id": str(rule.id),
                    "severity": "soft",
                    "message": {"he": rule_name, "en": rule_name},
                })

        score += soft_rule_penalty
        breakdown["soft_warnings"] = soft_rule_penalty

        # ------------------------------------------------------------------
        # 7) FUTURE IMPACT: -20 if creates hard conflict in next 48h
        # ------------------------------------------------------------------
        impact = await simulate_future_impact(
            self.db, self.tenant_id, employee.id, mission, hours=48
        )
        if impact["has_conflict"]:
            score -= 20
            breakdown["future_impact"] = -20
            soft_warnings.append({
                "type": "future_impact",
                "severity": "soft",
                "message": {
                    "he": "שיבוץ זה עלול לגרום להתנגשות ב-48 השעות הקרובות",
                    "en": "This assignment may cause a conflict in the next 48 hours",
                },
                "details": impact["conflicts"],
            })
        else:
            breakdown["future_impact"] = 0

        # ------------------------------------------------------------------
        # 8) RECENT NIGHT: -15 if last mission was night + standby not activated
        # ------------------------------------------------------------------
        last_was_night = emp_ctx.get("last_mission_was_night", False)
        if last_was_night:
            # Check if yesterday was standby not activated
            yesterday_standby = await self._yesterday_standby_not_activated(
                employee.id, mission.date
            )
            if not yesterday_standby:
                # Night shift without standby rest → penalize
                score -= 15
                breakdown["recent_night"] = -15
            else:
                breakdown["recent_night"] = 0
        else:
            breakdown["recent_night"] = 0

        return {
            "total": score,
            "breakdown": breakdown,
            "soft_warnings": soft_warnings,
        }

    # ===================================================================
    # Preference optimization — second pass partner boost
    # ===================================================================

    def _apply_partner_boost(self, scored, current_assignments, preferences) -> list:
        """Second pass: if two employees in the candidate list prefer each other
        AND both can fill slots → mutual boost +25 each."""
        # Build lookup: employee_id → index in scored
        id_to_idx = {str(emp.id): i for i, (emp, _) in enumerate(scored)}

        boosted = set()  # track already-boosted pairs to avoid double-boosting

        for i, (emp, score_dict) in enumerate(scored):
            emp_prefs = preferences.get(str(emp.id))
            if not emp_prefs or not emp_prefs.partner_preferences:
                continue

            for pp in emp_prefs.partner_preferences:
                partner_id = pp.get("employee_id")
                if partner_id not in id_to_idx:
                    continue
                j = id_to_idx[partner_id]
                if j == i:
                    continue

                pair_key = tuple(sorted([i, j]))
                if pair_key in boosted:
                    continue

                # Check if partner also prefers this employee (mutual)
                other_emp, other_score = scored[j]
                other_prefs = preferences.get(str(other_emp.id))
                if not other_prefs or not other_prefs.partner_preferences:
                    continue

                is_mutual = any(
                    op.get("employee_id") == str(emp.id)
                    for op in other_prefs.partner_preferences
                )
                if is_mutual:
                    # Also check if partner is already assigned to this mission
                    # (only boost if BOTH are candidates, i.e., both filling slots)
                    scored[i] = (emp, {
                        **score_dict,
                        "total": score_dict["total"] + 25,
                        "breakdown": {**score_dict.get("breakdown", {}), "mutual_partner": 25},
                    })
                    scored[j] = (other_emp, {
                        **other_score,
                        "total": other_score["total"] + 25,
                        "breakdown": {**other_score.get("breakdown", {}), "mutual_partner": 25},
                    })
                    boosted.add(pair_key)

        return scored

    # ===================================================================
    # Utility methods
    # ===================================================================

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

    async def _yesterday_standby_not_activated(self, employee_id, mission_date) -> bool:
        """Check if employee had a standby shift yesterday that was NOT activated."""
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
        return result.scalars().first() is not None

    async def _check_future_impact(self, employee_id, mission) -> bool:
        """Legacy wrapper — now delegates to rules_engine.simulate_future_impact."""
        impact = await simulate_future_impact(
            self.db, self.tenant_id, employee_id, mission, hours=48
        )
        return impact["has_conflict"]

    @staticmethod
    def _calc_duration(mission) -> float:
        """Calculate mission duration in hours."""
        if not mission.start_time or not mission.end_time:
            return 0
        s = mission.start_time.hour + mission.start_time.minute / 60
        e = mission.end_time.hour + mission.end_time.minute / 60
        if e <= s:
            e += 24
        return e - s
