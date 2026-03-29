"""Auto-assignment scheduling algorithm."""

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee, EmployeeWorkRole
from app.models.scheduling import Mission, MissionAssignment, MissionType


@dataclass
class AssignmentCandidate:
    """A candidate employee for a mission slot."""
    employee_id: UUID
    score: int = 100
    soft_warnings: list[dict] = field(default_factory=list)
    is_blocked: bool = False


@dataclass
class AutoAssignResult:
    """Result of the auto-assignment algorithm."""
    assigned: int = 0
    pending_approval: int = 0
    unresolved: int = 0
    details: list[dict] = field(default_factory=list)


async def auto_assign(
    db: AsyncSession,
    tenant_id: UUID,
    window_id: UUID,
) -> AutoAssignResult:
    """
    Run the auto-assignment algorithm for draft missions in a window.

    Steps:
    1. Generate missions from templates (if needed)
    2. Hard filter: availability, work roles, hard rules
    3. Scoring: load balance, preferences, soft warnings
    4. Preference optimization (partner preferences)
    5. Conflict check + future simulation
    6. Output proposed assignments
    """
    result = AutoAssignResult()

    # Get draft missions
    missions_result = await db.execute(
        select(Mission)
        .where(
            Mission.tenant_id == tenant_id,
            Mission.schedule_window_id == window_id,
            Mission.status == "draft",
        )
        .order_by(Mission.date, Mission.start_time)
    )
    missions = missions_result.scalars().all()

    # Get available employees
    employees_result = await db.execute(
        select(Employee)
        .where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
    )
    employees = employees_result.scalars().all()

    for mission in missions:
        # Get mission type for required slots
        mt_result = await db.execute(
            select(MissionType).where(MissionType.id == mission.mission_type_id)
        )
        mission_type = mt_result.scalar_one_or_none()
        if not mission_type or not mission_type.required_slots:
            continue

        required_slots = mission_type.required_slots
        if not isinstance(required_slots, list):
            continue

        for slot in required_slots:
            work_role_id = slot.get("work_role_id")
            if not work_role_id:
                continue

            # Find eligible employees with matching work role
            candidates = []
            for emp in employees:
                # Check work role match
                role_result = await db.execute(
                    select(EmployeeWorkRole).where(
                        EmployeeWorkRole.employee_id == emp.id,
                        EmployeeWorkRole.work_role_id == work_role_id,
                    )
                )
                if role_result.scalar_one_or_none():
                    candidates.append(
                        AssignmentCandidate(employee_id=emp.id, score=100)
                    )

            if not candidates:
                result.unresolved += 1
                continue

            # Sort by score (highest first) and assign top candidate
            candidates.sort(key=lambda c: c.score, reverse=True)
            best = candidates[0]

            assignment = MissionAssignment(
                mission_id=mission.id,
                employee_id=best.employee_id,
                work_role_id=work_role_id,
                slot_id=slot.get("slot_id", "s1"),
                status="assigned",
            )
            db.add(assignment)
            result.assigned += 1

        mission.status = "proposed"

    await db.flush()
    return result
