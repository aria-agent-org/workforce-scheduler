"""Audit log endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.permissions import require_permission
from app.models.audit import AuditLog
from app.models.user import User

router = APIRouter()


@router.get("", dependencies=[Depends(require_permission("audit_log", "read"))])
async def list_audit_logs(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
    page: int = 1, page_size: int = 50,
    entity_type: str | None = None,
    action: str | None = None,
    user_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    query = select(AuditLog, User).join(User, AuditLog.user_id == User.id).where(
        AuditLog.tenant_id == tenant.id
    )
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if action:
        query = query.where(AuditLog.action == action)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if date_from:
        from datetime import datetime
        query = query.where(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        from datetime import datetime
        query = query.where(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))

    # Count
    count_query = select(func.count()).where(AuditLog.tenant_id == tenant.id)
    if entity_type:
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)

    items = []
    for log, usr in result.all():
        items.append({
            "id": str(log.id),
            "tenant_id": str(log.tenant_id),
            "user_id": str(log.user_id),
            "user_email": usr.email,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "before_state": log.before_state,
            "after_state": log.after_state,
            "ip_address": log.ip_address,
            "created_at": str(log.created_at),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
