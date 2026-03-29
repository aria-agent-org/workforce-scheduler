"""Report endpoints."""

from fastapi import APIRouter
from app.dependencies import CurrentUser, CurrentTenant

router = APIRouter()


@router.get("/costs")
async def cost_report(
    tenant: CurrentTenant,
    user: CurrentUser,
) -> dict:
    """Get notification cost report."""
    return {
        "total_cost_usd": 0.0,
        "by_channel": {},
        "period": "current_month",
    }


@router.get("/workload")
async def workload_report(
    tenant: CurrentTenant,
    user: CurrentUser,
) -> dict:
    """Get employee workload distribution report."""
    return {
        "employees": [],
        "average_hours": 0,
        "period": "current_week",
    }


@router.get("/attendance")
async def attendance_report(
    tenant: CurrentTenant,
    user: CurrentUser,
) -> dict:
    """Get attendance summary report."""
    return {
        "total_employees": 0,
        "present": 0,
        "absent": 0,
        "period": "today",
    }
