"""Daily board — employee-facing daily view."""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee
from app.models.scheduling import (
    Mission, MissionAssignment, MissionType, DailyBoardTemplate,
)
from app.models.tenant import TenantSetting

router = APIRouter()

VISIBILITY_KEY = "visibility_settings"


@router.get("/daily")
async def get_daily_board(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    target_date: date | None = None,
) -> dict:
    """Employee-facing daily board view, filtered by visibility settings."""
    board_date = target_date or date.today()

    # Load visibility settings
    vis_result = await db.execute(
        select(TenantSetting).where(
            TenantSetting.tenant_id == tenant.id,
            TenantSetting.key == VISIBILITY_KEY,
        )
    )
    vis_setting = vis_result.scalar_one_or_none()
    visibility = vis_setting.value if vis_setting else {
        "show_employee_names": True,
        "show_employee_numbers": True,
        "show_mission_details": True,
        "show_assignment_status": True,
        "board_visible_to_all": False,
    }

    # Load default board template
    tmpl_result = await db.execute(
        select(DailyBoardTemplate).where(
            DailyBoardTemplate.tenant_id == tenant.id,
            DailyBoardTemplate.is_default.is_(True),
            DailyBoardTemplate.is_active.is_(True),
        )
    )
    template = tmpl_result.scalar_one_or_none()

    # Fetch missions for the date
    missions_result = await db.execute(
        select(Mission).where(
            Mission.tenant_id == tenant.id,
            Mission.date == board_date,
            Mission.status.not_in(["cancelled", "draft"]),
        ).order_by(Mission.start_time)
    )
    missions = missions_result.scalars().all()

    # Batch-load mission types
    mt_ids = list({m.mission_type_id for m in missions})
    mt_map = {}
    if mt_ids:
        mt_result = await db.execute(select(MissionType).where(MissionType.id.in_(mt_ids)))
        for mt in mt_result.scalars().all():
            mt_map[str(mt.id)] = mt

    # Batch-load assignments
    mission_ids = [m.id for m in missions]
    assignment_map: dict[str, list] = {str(mid): [] for mid in mission_ids}
    if mission_ids:
        assign_result = await db.execute(
            select(MissionAssignment, Employee)
            .join(Employee, MissionAssignment.employee_id == Employee.id)
            .where(
                MissionAssignment.mission_id.in_(mission_ids),
                MissionAssignment.status != "replaced",
            )
        )
        for ma, emp in assign_result.all():
            entry = {
                "slot_id": ma.slot_id,
                "status": ma.status if visibility.get("show_assignment_status", True) else None,
            }
            if visibility.get("show_employee_names", True):
                entry["employee_name"] = emp.full_name
            if visibility.get("show_employee_numbers", True):
                entry["employee_number"] = emp.employee_number
            assignment_map[str(ma.mission_id)].append(entry)

    # Build response
    mission_items = []
    for m in missions:
        mt = mt_map.get(str(m.mission_type_id))
        item = {
            "id": str(m.id),
            "name": m.name,
            "start_time": str(m.start_time),
            "end_time": str(m.end_time),
            "status": m.status,
            "is_activated": m.is_activated,
            "assignments": assignment_map.get(str(m.id), []),
        }
        if mt:
            item["mission_type_name"] = mt.name
            item["mission_type_color"] = mt.color
            item["mission_type_icon"] = mt.icon
        if visibility.get("show_mission_details", True):
            item["schedule_window_id"] = str(m.schedule_window_id)
        mission_items.append(item)

    return {
        "date": str(board_date),
        "template": {
            "id": str(template.id) if template else None,
            "name": template.name if template else None,
            "layout": template.layout if template else None,
            "columns": template.columns if template else None,
        } if template else None,
        "visibility": visibility,
        "missions": mission_items,
        "total_missions": len(mission_items),
    }
