"""Onboarding progress endpoints — persist wizard state per user in DB."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.onboarding import OnboardingProgress

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────


class OnboardingProgressOut(BaseModel):
    current_step: int
    completed_steps: dict
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class SaveProgressRequest(BaseModel):
    current_step: int
    completed_steps: dict


# ─── Helpers ──────────────────────────────────────────────────────────────────


async def _get_or_none(user_id, db: AsyncSession) -> Optional[OnboardingProgress]:
    result = await db.execute(
        select(OnboardingProgress).where(OnboardingProgress.user_id == user_id)
    )
    return result.scalar_one_or_none()


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get(
    "/progress",
    response_model=Optional[OnboardingProgressOut],
    summary="Get onboarding progress for the current user",
)
async def get_progress(
    user: CurrentUser,
    tenant: CurrentTenant,
    db: AsyncSession = Depends(get_db),
):
    """Returns the current user's onboarding progress, or null if none exists."""
    record = await _get_or_none(user.id, db)
    if record is None:
        return None
    return OnboardingProgressOut(
        current_step=record.current_step,
        completed_steps=record.completed_steps or {},
        status=record.status,
        started_at=record.started_at,
        completed_at=record.completed_at,
    )


@router.put(
    "/progress",
    response_model=OnboardingProgressOut,
    summary="Save current step progress",
)
async def save_progress(
    body: SaveProgressRequest,
    user: CurrentUser,
    tenant: CurrentTenant,
    db: AsyncSession = Depends(get_db),
):
    """Upsert onboarding progress — creates or updates the record."""
    record = await _get_or_none(user.id, db)
    now = datetime.now(timezone.utc)

    if record is None:
        record = OnboardingProgress(
            user_id=user.id,
            current_step=body.current_step,
            completed_steps=body.completed_steps,
            status="in_progress",
            started_at=now,
        )
        db.add(record)
    else:
        record.current_step = body.current_step
        record.completed_steps = body.completed_steps
        # Only update status if it was in_progress
        if record.status == "in_progress":
            record.status = "in_progress"

    await db.commit()
    await db.refresh(record)

    return OnboardingProgressOut(
        current_step=record.current_step,
        completed_steps=record.completed_steps or {},
        status=record.status,
        started_at=record.started_at,
        completed_at=record.completed_at,
    )


@router.post(
    "/skip",
    response_model=OnboardingProgressOut,
    summary="Mark onboarding as skipped",
)
async def skip_onboarding(
    user: CurrentUser,
    tenant: CurrentTenant,
    db: AsyncSession = Depends(get_db),
):
    """Mark the onboarding as skipped for this user."""
    record = await _get_or_none(user.id, db)
    now = datetime.now(timezone.utc)

    if record is None:
        record = OnboardingProgress(
            user_id=user.id,
            current_step=0,
            completed_steps={},
            status="skipped",
            started_at=now,
            completed_at=now,
        )
        db.add(record)
    else:
        record.status = "skipped"
        record.completed_at = now

    await db.commit()
    await db.refresh(record)

    return OnboardingProgressOut(
        current_step=record.current_step,
        completed_steps=record.completed_steps or {},
        status=record.status,
        started_at=record.started_at,
        completed_at=record.completed_at,
    )


@router.post(
    "/complete",
    response_model=OnboardingProgressOut,
    summary="Mark onboarding as completed",
)
async def complete_onboarding(
    user: CurrentUser,
    tenant: CurrentTenant,
    db: AsyncSession = Depends(get_db),
):
    """Mark the onboarding as completed for this user."""
    record = await _get_or_none(user.id, db)
    now = datetime.now(timezone.utc)

    if record is None:
        record = OnboardingProgress(
            user_id=user.id,
            current_step=6,
            completed_steps={str(i): True for i in range(7)},
            status="completed",
            started_at=now,
            completed_at=now,
        )
        db.add(record)
    else:
        record.status = "completed"
        record.completed_at = now

    await db.commit()
    await db.refresh(record)

    return OnboardingProgressOut(
        current_step=record.current_step,
        completed_steps=record.completed_steps or {},
        status=record.status,
        started_at=record.started_at,
        completed_at=record.completed_at,
    )
