"""Scheduling endpoints: windows, missions, templates."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.scheduling import ScheduleWindow, Mission

router = APIRouter()


# --- Schedule Windows ---

@router.get("/schedule-windows")
async def list_schedule_windows(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List schedule windows for the current tenant."""
    result = await db.execute(
        select(ScheduleWindow)
        .where(ScheduleWindow.tenant_id == tenant.id)
        .order_by(ScheduleWindow.start_date.desc())
    )
    windows = result.scalars().all()
    return [
        {
            "id": str(w.id),
            "name": w.name,
            "start_date": str(w.start_date),
            "end_date": str(w.end_date),
            "status": w.status,
        }
        for w in windows
    ]


@router.post("/schedule-windows/{window_id}/pause", status_code=status.HTTP_200_OK)
async def pause_schedule_window(
    window_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Pause a schedule window."""
    result = await db.execute(
        select(ScheduleWindow).where(
            ScheduleWindow.id == window_id,
            ScheduleWindow.tenant_id == tenant.id,
        )
    )
    window = result.scalar_one_or_none()
    if not window:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule window not found")
    if window.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active windows can be paused")
    window.status = "paused"
    await db.flush()
    return {"status": "paused", "id": str(window.id)}


@router.post("/schedule-windows/{window_id}/resume", status_code=status.HTTP_200_OK)
async def resume_schedule_window(
    window_id: UUID,
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Resume a paused schedule window."""
    result = await db.execute(
        select(ScheduleWindow).where(
            ScheduleWindow.id == window_id,
            ScheduleWindow.tenant_id == tenant.id,
        )
    )
    window = result.scalar_one_or_none()
    if not window:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule window not found")
    if window.status != "paused":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only paused windows can be resumed")
    window.status = "active"
    await db.flush()
    return {"status": "active", "id": str(window.id)}


# --- Missions ---

@router.get("/missions")
async def list_missions(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    window_id: UUID | None = None,
) -> list[dict]:
    """List missions, optionally filtered by schedule window."""
    query = select(Mission).where(Mission.tenant_id == tenant.id)
    if window_id:
        query = query.where(Mission.schedule_window_id == window_id)
    query = query.order_by(Mission.date, Mission.start_time)
    result = await db.execute(query)
    missions = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "name": m.name,
            "date": str(m.date),
            "start_time": str(m.start_time),
            "end_time": str(m.end_time),
            "status": m.status,
        }
        for m in missions
    ]


@router.post("/missions/auto-assign", status_code=status.HTTP_202_ACCEPTED)
async def auto_assign_missions(
    tenant: CurrentTenant,
    user: CurrentUser,
) -> dict:
    """Trigger auto-assignment for draft missions (async via Celery)."""
    # TODO: Dispatch to Celery task
    return {"detail": "Auto-assignment queued", "status": "accepted"}
