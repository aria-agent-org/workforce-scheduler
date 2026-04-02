"""Analytics dashboard router — charts, trends, predictions."""

import logging
from datetime import date, datetime, timedelta, timezone
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.models.employee import Employee
from app.models.scheduling import Mission, MissionAssignment, ScheduleWindow, SwapRequest
from app.models.attendance import AttendanceSchedule
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analytics"])


@router.get("/analytics/overview")
async def analytics_overview(
    days: int = Query(30, ge=7, le=90),
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics overview for the tenant."""
    since = date.today() - timedelta(days=days)
    today = date.today()

    # Total active employees
    emp_count = await db.execute(
        select(func.count(Employee.id)).where(
            Employee.tenant_id == tenant.id,
            Employee.is_active.is_(True),
        )
    )
    total_employees = emp_count.scalar() or 0

    # Missions in period
    mission_count = await db.execute(
        select(func.count(Mission.id)).where(
            Mission.tenant_id == tenant.id,
            Mission.date >= since,
        )
    )
    total_missions = mission_count.scalar() or 0

    # Assignments in period
    assign_count = await db.execute(
        select(func.count(MissionAssignment.id)).where(
            MissionAssignment.mission_id.in_(
                select(Mission.id).where(
                    Mission.tenant_id == tenant.id,
                    Mission.date >= since,
                )
            )
        )
    )
    total_assignments = assign_count.scalar() or 0

    # Swap requests
    swap_count = await db.execute(
        select(func.count(SwapRequest.id)).where(
            SwapRequest.tenant_id == tenant.id,
            SwapRequest.created_at >= datetime(since.year, since.month, since.day, tzinfo=timezone.utc),
        )
    )
    total_swaps = swap_count.scalar() or 0

    # Coverage rate
    coverage = round((total_assignments / max(total_missions, 1)) * 100, 1)

    return {
        "period_days": days,
        "total_employees": total_employees,
        "total_missions": total_missions,
        "total_assignments": total_assignments,
        "total_swap_requests": total_swaps,
        "coverage_pct": coverage,
        "avg_missions_per_employee": round(total_assignments / max(total_employees, 1), 1),
    }


@router.get("/analytics/missions-by-date")
async def missions_by_date(
    days: int = Query(30, ge=7, le=90),
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Missions count by date for chart."""
    since = date.today() - timedelta(days=days)

    result = await db.execute(
        select(
            Mission.date,
            func.count(Mission.id).label("missions"),
            func.count(MissionAssignment.id).label("assignments"),
        )
        .outerjoin(MissionAssignment, MissionAssignment.mission_id == Mission.id)
        .where(
            Mission.tenant_id == tenant.id,
            Mission.date >= since,
        )
        .group_by(Mission.date)
        .order_by(Mission.date)
    )

    return {
        "data": [
            {
                "date": str(row.date),
                "missions": row.missions,
                "assignments": row.assignments,
                "coverage": round((row.assignments / max(row.missions, 1)) * 100, 1),
            }
            for row in result
        ]
    }


@router.get("/analytics/employee-stats")
async def employee_stats(
    days: int = Query(30, ge=7, le=90),
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Per-employee assignment stats for fair distribution analysis."""
    since = date.today() - timedelta(days=days)

    result = await db.execute(
        select(
            Employee.id,
            Employee.full_name,
            func.count(MissionAssignment.id).label("assignment_count"),
        )
        .outerjoin(MissionAssignment, MissionAssignment.employee_id == Employee.id)
        .outerjoin(Mission, and_(
            Mission.id == MissionAssignment.mission_id,
            Mission.date >= since,
        ))
        .where(
            Employee.tenant_id == tenant.id,
            Employee.is_active.is_(True),
        )
        .group_by(Employee.id, Employee.full_name)
        .order_by(func.count(MissionAssignment.id).desc())
    )

    employees = [
        {
            "id": str(row.id),
            "name": row.full_name,
            "assignments": row.assignment_count,
        }
        for row in result
    ]

    # Calculate fairness
    counts = [e["assignments"] for e in employees if e["assignments"] > 0]
    avg = sum(counts) / max(len(counts), 1)
    max_count = max(counts) if counts else 0
    min_count = min(counts) if counts else 0

    return {
        "employees": employees,
        "fairness": {
            "average": round(avg, 1),
            "max": max_count,
            "min": min_count,
            "deviation_pct": round(((max_count - min_count) / max(avg, 1)) * 100, 1) if avg else 0,
        },
    }


@router.get("/analytics/trends")
async def trends(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Weekly trends for the last 8 weeks."""
    weeks_data = []
    for w in range(8):
        week_end = date.today() - timedelta(weeks=w)
        week_start = week_end - timedelta(days=6)

        mission_count = await db.execute(
            select(func.count(Mission.id)).where(
                Mission.tenant_id == tenant.id,
                Mission.date >= week_start,
                Mission.date <= week_end,
            )
        )

        assign_count = await db.execute(
            select(func.count(MissionAssignment.id)).where(
                MissionAssignment.mission_id.in_(
                    select(Mission.id).where(
                        Mission.tenant_id == tenant.id,
                        Mission.date >= week_start,
                        Mission.date <= week_end,
                    )
                )
            )
        )

        missions = mission_count.scalar() or 0
        assignments = assign_count.scalar() or 0

        weeks_data.append({
            "week_start": str(week_start),
            "week_end": str(week_end),
            "missions": missions,
            "assignments": assignments,
            "coverage_pct": round((assignments / max(missions, 1)) * 100, 1),
        })

    return {"weeks": list(reversed(weeks_data))}
