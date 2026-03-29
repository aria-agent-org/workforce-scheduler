"""Rules engine endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.rules import RuleDefinition

router = APIRouter()


@router.get("")
async def list_rules(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all active rules for the tenant."""
    result = await db.execute(
        select(RuleDefinition)
        .where(RuleDefinition.tenant_id == tenant.id, RuleDefinition.is_active.is_(True))
        .order_by(RuleDefinition.priority.desc())
    )
    rules = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "category": r.category,
            "severity": r.severity,
            "scope": r.scope,
            "is_active": r.is_active,
            "priority": r.priority,
        }
        for r in rules
    ]


@router.post("/evaluate")
async def evaluate_rules(
    tenant: CurrentTenant,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Evaluate rules against a proposed assignment (dry run)."""
    # Placeholder — full engine in services/rules_engine.py
    return {
        "is_blocked": False,
        "hard_conflicts": [],
        "soft_warnings": [],
        "score_adjustment": 0,
    }


@router.get("/condition-fields")
async def get_condition_fields(
    tenant: CurrentTenant,
    user: CurrentUser,
) -> list[dict]:
    """Get available condition fields for rule building."""
    return [
        {"field": "employee.hours_since_last_mission", "type": "number", "label": {"he": "שעות מאז משימה אחרונה", "en": "Hours since last mission"}},
        {"field": "employee.last_mission_was_night", "type": "bool", "label": {"he": "משימה אחרונה הייתה לילה", "en": "Last mission was night"}},
        {"field": "employee.assignments_count_today", "type": "number", "label": {"he": "שיבוצים היום", "en": "Assignments today"}},
        {"field": "employee.total_work_hours_today", "type": "number", "label": {"he": "שעות עבודה היום", "en": "Work hours today"}},
        {"field": "mission.start_hour", "type": "number", "label": {"he": "שעת התחלת משימה", "en": "Mission start hour"}},
        {"field": "mission.is_night", "type": "bool", "label": {"he": "משימת לילה", "en": "Night mission"}},
        {"field": "mission.duration_hours", "type": "number", "label": {"he": "אורך משימה", "en": "Mission duration"}},
    ]
