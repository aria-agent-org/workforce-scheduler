"""Notification template management router."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.permissions import require_permission
from app.models.notification import NotificationTemplate
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notification-templates"])

# Template variables reference
TEMPLATE_VARIABLES = {
    "employee_name": "שם החייל",
    "mission_name": "שם המשימה",
    "mission_date": "תאריך המשימה",
    "mission_time": "שעת המשימה",
    "manager_name": "שם המנהל",
    "tenant_name": "שם הארגון",
    "swap_date": "תאריך ההחלפה",
    "reset_link": "קישור איפוס סיסמה",
    "invite_link": "קישור הזמנה",
}


class TemplateUpdate(BaseModel):
    name: str | None = None
    subject_template: str | None = None
    is_active: bool | None = None


class TemplatePreview(BaseModel):
    template: str
    variables: dict = {}


@router.get("/notification-templates")
async def list_templates(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all notification templates for this tenant."""
    result = await db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.tenant_id.in_([tenant.id, None])
        ).order_by(NotificationTemplate.event_type_code)
    )
    templates = result.scalars().all()

    return {
        "items": [
            {
                "id": str(t.id),
                "name": t.name,
                "event_type_code": t.event_type_code,
                "channels": t.channels,
                "subject_template": getattr(t, "subject_template", None),
                "channel": getattr(t, "channel", None),
                "is_active": t.is_active,
                "is_system": t.tenant_id is None,
                "send_offset_minutes": t.send_offset_minutes,
                "variables_schema": getattr(t, "variables_schema", None),
            }
            for t in templates
        ],
        "available_variables": TEMPLATE_VARIABLES,
    }


@router.put("/notification-templates/{template_id}")
async def update_template(
    template_id: str,
    body: TemplateUpdate,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Update a notification template."""
    result = await db.execute(
        select(NotificationTemplate).where(NotificationTemplate.id == UUID(template_id))
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # If it's a system template, create a tenant override
    if template.tenant_id is None:
        override = NotificationTemplate(
            tenant_id=tenant.id,
            name=body.name or template.name,
            event_type_code=template.event_type_code,
            channels=template.channels,
            is_active=body.is_active if body.is_active is not None else template.is_active,
        )
        db.add(override)
        await db.commit()
        return {"message": "Template override created", "id": str(override.id)}

    # Update existing tenant template
    if body.name is not None:
        template.name = body.name
    if body.is_active is not None:
        template.is_active = body.is_active

    await db.commit()
    return {"message": "Template updated", "id": str(template.id)}


@router.post("/notification-templates/preview")
async def preview_template(
    body: TemplatePreview,
    user=Depends(get_current_user),
):
    """Preview a template with sample variables."""
    sample_vars = {
        "employee_name": "ישראל ישראלי",
        "mission_name": "שמירה שער 3",
        "mission_date": "02/04/2026",
        "mission_time": "08:00-16:00",
        "manager_name": "רס״ל כהן",
        "tenant_name": "יחידה 8200",
        "swap_date": "03/04/2026",
        "reset_link": "https://shavtzak.site/reset/abc123",
        "invite_link": "https://shavtzak.site/join/xyz789",
    }
    sample_vars.update(body.variables)

    try:
        rendered = body.template
        for key, value in sample_vars.items():
            rendered = rendered.replace(f"{{{key}}}", value)
        return {"rendered": rendered, "variables_used": list(sample_vars.keys())}
    except Exception as e:
        return {"rendered": body.template, "error": str(e)}


@router.post("/notification-templates/{template_id}/reset")
async def reset_template(
    template_id: str,
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Reset a tenant template to system default (delete override)."""
    result = await db.execute(
        select(NotificationTemplate).where(
            NotificationTemplate.id == UUID(template_id),
            NotificationTemplate.tenant_id == tenant.id,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Tenant template override not found")

    await db.delete(template)
    await db.commit()
    return {"message": "Template reset to system default"}
