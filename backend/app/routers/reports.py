"""Report endpoints with real data."""

from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee
from app.models.scheduling import Mission, MissionAssignment, ScheduleWindow
from app.models.attendance import AttendanceSchedule
from app.models.notification import NotificationLog

router = APIRouter()


@router.get("/dashboard")
async def dashboard_stats(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    """Dashboard KPI stats."""
    today = date.today()

    # Total active employees
    total_employees = (await db.execute(
        select(func.count()).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True))
    )).scalar() or 0

    # Present today
    present = (await db.execute(
        select(func.count()).where(
            AttendanceSchedule.tenant_id == tenant.id,
            AttendanceSchedule.date == today,
            AttendanceSchedule.status_code == "present",
        )
    )).scalar() or 0

    # Missions today
    missions_today = (await db.execute(
        select(func.count()).where(Mission.tenant_id == tenant.id, Mission.date == today)
    )).scalar() or 0

    # Conflicts (assignments with detected conflicts)
    conflicts = (await db.execute(
        select(func.count())
        .select_from(MissionAssignment)
        .join(Mission, MissionAssignment.mission_id == Mission.id)
        .where(
            Mission.tenant_id == tenant.id,
            MissionAssignment.conflicts_detected.isnot(None),
            MissionAssignment.status != "replaced",
        )
    )).scalar() or 0

    # Active schedule windows
    active_windows = (await db.execute(
        select(func.count()).where(
            ScheduleWindow.tenant_id == tenant.id,
            ScheduleWindow.status == "active",
        )
    )).scalar() or 0

    return {
        "total_employees": total_employees,
        "present_today": present,
        "missions_today": missions_today,
        "conflicts": conflicts,
        "active_windows": active_windows,
    }


@router.get("/workload")
async def workload_report(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    window_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Employee workload distribution."""
    if not date_from:
        date_from = date.today() - timedelta(days=7)
    if not date_to:
        date_to = date.today()

    # Get all employees
    emp_result = await db.execute(
        select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True))
        .order_by(Employee.full_name)
    )
    employees = emp_result.scalars().all()

    items = []
    total_hours = 0
    for emp in employees:
        # Count assignments
        query = (
            select(func.count(), func.sum(
                func.extract("hour", Mission.end_time) - func.extract("hour", Mission.start_time)
            ))
            .select_from(MissionAssignment)
            .join(Mission, MissionAssignment.mission_id == Mission.id)
            .where(
                MissionAssignment.employee_id == emp.id,
                MissionAssignment.status != "replaced",
                Mission.date >= date_from,
                Mission.date <= date_to,
            )
        )
        if window_id:
            query = query.where(Mission.schedule_window_id == window_id)

        result = await db.execute(query)
        row = result.one()
        count = row[0] or 0
        hours = float(row[1] or 0)
        total_hours += hours

        items.append({
            "employee_id": str(emp.id),
            "employee_name": emp.full_name,
            "employee_number": emp.employee_number,
            "assignments_count": count,
            "total_hours": hours,
        })

    avg_hours = total_hours / len(items) if items else 0

    return {
        "employees": items,
        "average_hours": round(avg_hours, 1),
        "total_hours": round(total_hours, 1),
        "period": {"from": str(date_from), "to": str(date_to)},
    }


@router.get("/missions")
async def missions_report(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    date_from: date | None = None, date_to: date | None = None,
) -> dict:
    """Missions summary report."""
    if not date_from:
        date_from = date.today() - timedelta(days=30)
    if not date_to:
        date_to = date.today()

    total = (await db.execute(
        select(func.count()).where(
            Mission.tenant_id == tenant.id,
            Mission.date >= date_from, Mission.date <= date_to,
        )
    )).scalar() or 0

    by_status = {}
    for s in ["draft", "approved", "completed", "cancelled"]:
        count = (await db.execute(
            select(func.count()).where(
                Mission.tenant_id == tenant.id,
                Mission.status == s,
                Mission.date >= date_from, Mission.date <= date_to,
            )
        )).scalar() or 0
        by_status[s] = count

    return {
        "total_missions": total,
        "by_status": by_status,
        "period": {"from": str(date_from), "to": str(date_to)},
    }


@router.get("/attendance")
async def attendance_report(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    date_from: date | None = None, date_to: date | None = None,
) -> dict:
    """Attendance summary report."""
    if not date_from:
        date_from = date.today() - timedelta(days=7)
    if not date_to:
        date_to = date.today()

    total_employees = (await db.execute(
        select(func.count()).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True))
    )).scalar() or 0

    # Count by status code
    status_counts = {}
    result = await db.execute(
        select(AttendanceSchedule.status_code, func.count())
        .where(
            AttendanceSchedule.tenant_id == tenant.id,
            AttendanceSchedule.date >= date_from,
            AttendanceSchedule.date <= date_to,
        )
        .group_by(AttendanceSchedule.status_code)
    )
    for code, count in result.all():
        status_counts[code] = count

    return {
        "total_employees": total_employees,
        "by_status": status_counts,
        "period": {"from": str(date_from), "to": str(date_to)},
    }


@router.get("/costs")
async def cost_report(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    date_from: date | None = None, date_to: date | None = None,
) -> dict:
    """Notification cost report."""
    if not date_from:
        date_from = date.today() - timedelta(days=30)
    if not date_to:
        date_to = date.today()

    result = await db.execute(
        select(NotificationLog.channel, func.count(), func.sum(NotificationLog.cost_usd))
        .where(
            NotificationLog.tenant_id == tenant.id,
            NotificationLog.sent_at >= datetime.combine(date_from, datetime.min.time()),
            NotificationLog.sent_at <= datetime.combine(date_to, datetime.max.time()),
        )
        .group_by(NotificationLog.channel)
    )

    by_channel = {}
    total_cost = 0.0
    for channel, count, cost in result.all():
        c = float(cost or 0)
        by_channel[channel] = {"count": count, "cost_usd": c}
        total_cost += c

    return {
        "total_cost_usd": round(total_cost, 4),
        "by_channel": by_channel,
        "period": {"from": str(date_from), "to": str(date_to)},
    }
