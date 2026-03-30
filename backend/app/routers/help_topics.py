"""Help Topics CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.help import HelpTopic
from app.permissions import require_permission

router = APIRouter()


# ═══════════════════════════════════════════
# Schemas
# ═══════════════════════════════════════════

class HelpTopicCreate(BaseModel):
    topic_key: str
    title: dict
    content: dict
    examples: dict | None = None
    video_url: str | None = None


class HelpTopicUpdate(BaseModel):
    title: dict | None = None
    content: dict | None = None
    examples: dict | None = None
    video_url: str | None = None


class HelpTopicResponse(BaseModel):
    id: UUID
    topic_key: str
    tenant_id: UUID | None = None
    title: dict
    content: dict
    examples: dict | None = None
    video_url: str | None = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════

@router.get("")
async def list_help_topics(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List help topics — tenant-specific + system (tenant_id IS NULL)."""
    from sqlalchemy import or_

    result = await db.execute(
        select(HelpTopic).where(
            or_(HelpTopic.tenant_id == tenant.id, HelpTopic.tenant_id.is_(None))
        ).order_by(HelpTopic.topic_key)
    )
    return [HelpTopicResponse.model_validate(ht).model_dump() for ht in result.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("settings", "write"))])
async def create_help_topic(
    data: HelpTopicCreate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a tenant-specific help topic."""
    # Check for duplicate topic_key within tenant
    existing = await db.execute(
        select(HelpTopic).where(
            HelpTopic.tenant_id == tenant.id,
            HelpTopic.topic_key == data.topic_key,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"נושא עזרה '{data.topic_key}' כבר קיים",
        )
    ht = HelpTopic(tenant_id=tenant.id, **data.model_dump())
    db.add(ht)
    await db.flush()
    await db.refresh(ht)
    await db.commit()
    return HelpTopicResponse.model_validate(ht).model_dump()


@router.patch("/{topic_id}", dependencies=[Depends(require_permission("settings", "write"))])
async def update_help_topic(
    topic_id: UUID, data: HelpTopicUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a help topic (only tenant-owned)."""
    result = await db.execute(
        select(HelpTopic).where(HelpTopic.id == topic_id, HelpTopic.tenant_id == tenant.id)
    )
    ht = result.scalar_one_or_none()
    if not ht:
        raise HTTPException(status_code=404, detail="נושא עזרה לא נמצא")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(ht, key, value)
    await db.flush()
    await db.refresh(ht)
    await db.commit()
    return HelpTopicResponse.model_validate(ht).model_dump()


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_permission("settings", "write"))])
async def delete_help_topic(
    topic_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a help topic (only tenant-owned, not system topics)."""
    result = await db.execute(
        select(HelpTopic).where(HelpTopic.id == topic_id, HelpTopic.tenant_id == tenant.id)
    )
    ht = result.scalar_one_or_none()
    if not ht:
        raise HTTPException(status_code=404, detail="נושא עזרה לא נמצא")
    await db.delete(ht)
    await db.commit()
