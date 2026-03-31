"""Swap flow — multi-step swap/give-away request via bot."""

import logging
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.scheduling import Mission, MissionAssignment, SwapRequest
from app.services.bots.bot_engine import BotResponse

logger = logging.getLogger(__name__)


@dataclass
class SwapFlowState:
    """Tracks the current step in a swap conversation flow."""

    step: str = "select_mission"  # select_mission | select_candidate | confirm | done
    employee_id: UUID | None = None
    assignment_id: UUID | None = None
    target_employee_id: UUID | None = None
    swap_type: str = "swap"  # swap | give_away
    reason: str | None = None


class SwapFlow:
    """Handles the multi-step swap request conversation from spec section 9."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def handle_step(
        self,
        tenant_id: UUID,
        employee_id: UUID,
        message: str,
        state: dict | None = None,
    ) -> BotResponse:
        """Process a swap flow step and return the next response."""
        flow_state = self._parse_state(state, employee_id)

        if flow_state.step == "select_mission":
            return await self._step_select_mission(tenant_id, employee_id, message)
        elif flow_state.step == "select_candidate":
            return await self._step_select_candidate(tenant_id, flow_state, message)
        elif flow_state.step == "confirm":
            return await self._step_confirm(tenant_id, flow_state, message)
        else:
            return BotResponse(text="🔄 תהליך ההחלפה הסתיים. שלח 'תפריט' לחזרה.")

    # ── Steps ───────────────────────────────────────────────────────

    async def _step_select_mission(
        self,
        tenant_id: UUID,
        employee_id: UUID,
        message: str,
    ) -> BotResponse:
        """Step 1: Show upcoming missions and let user pick one."""
        today = date.today()

        result = await self.db.execute(
            select(Mission, MissionAssignment)
            .join(MissionAssignment, MissionAssignment.mission_id == Mission.id)
            .where(
                Mission.tenant_id == tenant_id,
                MissionAssignment.employee_id == employee_id,
                MissionAssignment.status.in_(["assigned", "confirmed"]),
                Mission.date >= today,
            )
            .order_by(Mission.date, Mission.start_time)
            .limit(10)
        )
        rows = result.all()

        if not rows:
            return BotResponse(text="אין לך משמרות קרובות להחלפה.")

        lines = ["🔄 בחר את המשמרת שברצונך להחליף (שלח את המספר):"]
        buttons = []
        for idx, (mission, assignment) in enumerate(rows, 1):
            day = mission.date.strftime("%d/%m/%Y")
            start = mission.start_time.strftime("%H:%M")
            end = mission.end_time.strftime("%H:%M")
            label = f"{idx}. {mission.name} — {day} {start}-{end}"
            lines.append(label)
            buttons.append({
                "code": str(idx),
                "label": label,
                "assignment_id": str(assignment.id),
                "mission_id": str(mission.id),
            })

        return BotResponse(
            text="\n".join(lines),
            buttons=buttons,
            metadata={
                "flow": "swap",
                "step": "select_candidate",
                "assignments": [
                    {"idx": idx, "assignment_id": str(a.id), "mission_id": str(m.id)}
                    for idx, (m, a) in enumerate(rows, 1)
                ],
            },
        )

    async def _step_select_candidate(
        self,
        tenant_id: UUID,
        state: SwapFlowState,
        message: str,
    ) -> BotResponse:
        """Step 2: Find eligible candidates for swap."""
        if state.assignment_id is None:
            return BotResponse(
                text="⚠️ לא נבחרה משמרת. שלח 'החלפה' כדי להתחיל מחדש.",
                metadata={"flow": "swap", "step": "select_mission"},
            )

        # Load the original assignment's mission
        assignment_result = await self.db.execute(
            select(MissionAssignment).where(MissionAssignment.id == state.assignment_id)
        )
        assignment = assignment_result.scalar_one_or_none()
        if not assignment:
            return BotResponse(text="⚠️ המשמרת לא נמצאה.")

        mission_result = await self.db.execute(
            select(Mission).where(Mission.id == assignment.mission_id)
        )
        mission = mission_result.scalar_one_or_none()
        if not mission:
            return BotResponse(text="⚠️ המשמרת לא נמצאה.")

        # Find employees with the same work role who are not already assigned
        from app.models.employee import EmployeeWorkRole

        assigned_ids_result = await self.db.execute(
            select(MissionAssignment.employee_id).where(
                MissionAssignment.mission_id == mission.id,
                MissionAssignment.status.in_(["assigned", "confirmed"]),
            )
        )
        assigned_ids = {row[0] for row in assigned_ids_result.all()}

        candidates_result = await self.db.execute(
            select(Employee)
            .join(EmployeeWorkRole, EmployeeWorkRole.employee_id == Employee.id)
            .where(
                Employee.tenant_id == tenant_id,
                Employee.is_active.is_(True),
                EmployeeWorkRole.work_role_id == assignment.work_role_id,
                Employee.id.notin_(assigned_ids),
            )
            .limit(10)
        )
        candidates = candidates_result.scalars().all()

        if not candidates:
            return BotResponse(
                text=(
                    "לא נמצאו מחליפים זמינים למשמרת זו. "
                    "ניתן לשלוח בקשת ויתור (give-away) שתפורסם לכולם.\n"
                    "שלח 'ויתור' או 'ביטול'."
                ),
                metadata={
                    "flow": "swap",
                    "step": "confirm",
                    "assignment_id": str(state.assignment_id),
                    "swap_type": "give_away",
                },
            )

        lines = ["👥 מחליפים אפשריים (שלח את המספר):"]
        buttons = []
        for idx, emp in enumerate(candidates, 1):
            label = f"{idx}. {emp.full_name}"
            lines.append(label)
            buttons.append({"code": str(idx), "label": label, "employee_id": str(emp.id)})

        lines.append(f"\n{len(candidates) + 1}. ויתור על המשמרת (give-away)")

        return BotResponse(
            text="\n".join(lines),
            buttons=buttons,
            metadata={
                "flow": "swap",
                "step": "confirm",
                "assignment_id": str(state.assignment_id),
                "candidates": [{"idx": idx, "employee_id": str(e.id)} for idx, e in enumerate(candidates, 1)],
            },
        )

    async def _step_confirm(
        self,
        tenant_id: UUID,
        state: SwapFlowState,
        message: str,
    ) -> BotResponse:
        """Step 3: Create the SwapRequest."""
        text = message.strip().lower()

        if text in ("ביטול", "cancel", "לא"):
            return BotResponse(
                text="❌ בקשת ההחלפה בוטלה.",
                metadata={"flow": "swap", "step": "done"},
            )

        if state.assignment_id is None:
            return BotResponse(text="⚠️ אירעה שגיאה. שלח 'החלפה' כדי להתחיל מחדש.")

        # Create swap request
        swap = SwapRequest(
            tenant_id=tenant_id,
            requester_employee_id=state.employee_id,
            requester_assignment_id=state.assignment_id,
            target_employee_id=state.target_employee_id,
            swap_type=state.swap_type,
            reason=state.reason or message,
            status="pending",
            target_response="pending",
            channel="bot",
        )
        self.db.add(swap)

        if state.target_employee_id:
            return BotResponse(
                text="✅ בקשת ההחלפה נשלחה! תקבל עדכון כשהמחליף יגיב.",
                metadata={"flow": "swap", "step": "done", "swap_request_id": str(swap.id)},
            )
        else:
            return BotResponse(
                text="✅ בקשת הויתור נשלחה! המשמרת תפורסם לעובדים מתאימים.",
                metadata={"flow": "swap", "step": "done", "swap_request_id": str(swap.id)},
            )

    # ── Helpers ─────────────────────────────────────────────────────

    def _parse_state(self, state: dict | None, employee_id: UUID) -> SwapFlowState:
        """Parse state dict into SwapFlowState."""
        if state is None:
            return SwapFlowState(employee_id=employee_id)

        return SwapFlowState(
            step=state.get("step", "select_mission"),
            employee_id=employee_id,
            assignment_id=UUID(state["assignment_id"]) if state.get("assignment_id") else None,
            target_employee_id=UUID(state["target_employee_id"]) if state.get("target_employee_id") else None,
            swap_type=state.get("swap_type", "swap"),
            reason=state.get("reason"),
        )
