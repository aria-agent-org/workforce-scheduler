"""Invitation system endpoints (spec 3.4a)."""

import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.user import Invitation, User
from app.models.employee import Employee
from app.models.resource import RoleDefinition
from app.models.audit import AuditLog
from app.services.auth_service import AuthService

router = APIRouter()


# ═══════════════════════════════════════════
# Invitation Management (admin/scheduler)
# ═══════════════════════════════════════════

@router.get("")
async def list_invitations(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = None,
) -> list[dict]:
    query = select(Invitation).where(Invitation.tenant_id == tenant.id)
    if status_filter:
        query = query.where(Invitation.status == status_filter)
    query = query.order_by(Invitation.created_at.desc())
    result = await db.execute(query)

    items = []
    for inv in result.scalars().all():
        # Get employee name if linked
        emp_name = None
        if inv.employee_id:
            emp_result = await db.execute(select(Employee).where(Employee.id == inv.employee_id))
            emp = emp_result.scalar_one_or_none()
            emp_name = emp.full_name if emp else None

        # Get role name
        role_name = None
        if inv.role_definition_id:
            rd_result = await db.execute(select(RoleDefinition).where(RoleDefinition.id == inv.role_definition_id))
            rd = rd_result.scalar_one_or_none()
            role_name = rd.label if rd else None

        # Check if expired
        if inv.status == "pending" and inv.expires_at < datetime.utcnow():
            inv.status = "expired"
            await db.flush()

        items.append({
            "id": str(inv.id),
            "email": inv.email,
            "phone": inv.phone,
            "token": inv.token,
            "role_definition_id": str(inv.role_definition_id) if inv.role_definition_id else None,
            "role_name": role_name,
            "employee_id": str(inv.employee_id) if inv.employee_id else None,
            "employee_name": emp_name,
            "status": inv.status,
            "expires_at": str(inv.expires_at),
            "accepted_at": str(inv.accepted_at) if inv.accepted_at else None,
            "custom_message": inv.custom_message,
            "created_at": str(inv.created_at),
            "invite_link": f"https://app.shavtzak.site/join/{inv.token}",
        })

    await db.commit()
    return items


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    data: dict,
    tenant: CurrentTenant, user: CurrentUser, request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new invitation."""
    token = secrets.token_urlsafe(48)
    expires_days = data.get("expires_days", 7)

    inv = Invitation(
        tenant_id=tenant.id,
        email=data.get("email"),
        phone=data.get("phone"),
        token=token,
        role_definition_id=data.get("role_definition_id"),
        employee_id=data.get("employee_id"),
        invited_by=user.id,
        expires_at=datetime.utcnow() + timedelta(days=expires_days),
        custom_message=data.get("custom_message"),
    )
    db.add(inv)
    await db.flush()
    await db.refresh(inv)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="invitation", entity_id=inv.id,
        after_state={"email": inv.email, "phone": inv.phone, "token": token},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {
        "id": str(inv.id),
        "token": token,
        "invite_link": f"https://app.shavtzak.site/join/{token}",
        "status": inv.status,
        "expires_at": str(inv.expires_at),
    }


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_invitations(
    data: dict,
    tenant: CurrentTenant, user: CurrentUser, request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create invitations for multiple employees."""
    employee_ids = data.get("employee_ids", [])
    role_definition_id = data.get("role_definition_id")
    expires_days = data.get("expires_days", 7)
    custom_message = data.get("custom_message")

    created = []
    for emp_id in employee_ids:
        # Get employee details
        emp_result = await db.execute(
            select(Employee).where(Employee.id == emp_id, Employee.tenant_id == tenant.id)
        )
        emp = emp_result.scalar_one_or_none()
        if not emp:
            continue

        # Check if already has pending invitation
        existing = await db.execute(
            select(Invitation).where(
                Invitation.tenant_id == tenant.id,
                Invitation.employee_id == emp_id,
                Invitation.status == "pending",
            )
        )
        if existing.scalar_one_or_none():
            continue

        token = secrets.token_urlsafe(48)
        inv = Invitation(
            tenant_id=tenant.id,
            email=emp.notification_channels.get("email") if emp.notification_channels else None,
            phone=emp.notification_channels.get("phone_whatsapp") if emp.notification_channels else None,
            token=token,
            role_definition_id=role_definition_id,
            employee_id=emp_id,
            invited_by=user.id,
            expires_at=datetime.utcnow() + timedelta(days=expires_days),
            custom_message=custom_message,
        )
        db.add(inv)
        await db.flush()
        created.append({
            "employee_id": str(emp_id),
            "employee_name": emp.full_name,
            "token": token,
            "invite_link": f"https://app.shavtzak.site/join/{token}",
        })

    await db.commit()
    return {"created": len(created), "invitations": created}


@router.post("/{inv_id}/revoke")
async def revoke_invitation(
    inv_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Invitation).where(Invitation.id == inv_id, Invitation.tenant_id == tenant.id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="ניתן לבטל רק הזמנות ממתינות")
    inv.status = "revoked"
    await db.commit()
    return {"id": str(inv.id), "status": "revoked"}


@router.post("/{inv_id}/resend")
async def resend_invitation(
    inv_id: UUID, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Resend expired invitation with new token."""
    result = await db.execute(
        select(Invitation).where(Invitation.id == inv_id, Invitation.tenant_id == tenant.id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")

    # Revoke old
    inv.status = "revoked"

    # Create new
    new_token = secrets.token_urlsafe(48)
    new_inv = Invitation(
        tenant_id=tenant.id,
        email=inv.email,
        phone=inv.phone,
        token=new_token,
        role_definition_id=inv.role_definition_id,
        employee_id=inv.employee_id,
        invited_by=user.id,
        expires_at=datetime.utcnow() + timedelta(days=7),
        custom_message=inv.custom_message,
    )
    db.add(new_inv)
    await db.flush()
    await db.refresh(new_inv)
    await db.commit()

    return {
        "id": str(new_inv.id),
        "token": new_token,
        "invite_link": f"https://app.shavtzak.site/join/{new_token}",
        "status": "pending",
    }


@router.get("/export-links")
async def export_invitation_links(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Export all pending invitation links as CSV data."""
    result = await db.execute(
        select(Invitation).where(
            Invitation.tenant_id == tenant.id,
            Invitation.status == "pending",
        ).order_by(Invitation.created_at)
    )
    rows = []
    for inv in result.scalars().all():
        emp_name = ""
        if inv.employee_id:
            emp_result = await db.execute(select(Employee).where(Employee.id == inv.employee_id))
            emp = emp_result.scalar_one_or_none()
            emp_name = emp.full_name if emp else ""

        rows.append({
            "name": emp_name,
            "email": inv.email or "",
            "phone": inv.phone or "",
            "link": f"https://app.shavtzak.site/join/{inv.token}",
            "expires": str(inv.expires_at),
        })

    return {"rows": rows}


# ═══════════════════════════════════════════
# Public endpoints (no auth required)
# ═══════════════════════════════════════════

@router.get("/validate/{token}")
async def validate_invitation_token(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public: Validate an invitation token."""
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")

    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="הזמנה כבר מומשה או בוטלה")

    if inv.expires_at < datetime.utcnow():
        inv.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="הלינק פג תוקף")

    # Get employee name if linked
    emp_name = None
    if inv.employee_id:
        emp_result = await db.execute(select(Employee).where(Employee.id == inv.employee_id))
        emp = emp_result.scalar_one_or_none()
        emp_name = emp.full_name if emp else None

    # Get tenant name
    from app.models.tenant import Tenant
    t_result = await db.execute(select(Tenant).where(Tenant.id == inv.tenant_id))
    tenant = t_result.scalar_one_or_none()

    return {
        "valid": True,
        "employee_name": emp_name,
        "tenant_name": tenant.name if tenant else None,
        "role_definition_id": str(inv.role_definition_id) if inv.role_definition_id else None,
    }


@router.post("/accept/{token}")
async def accept_invitation(
    token: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public: Accept invitation and create user account."""
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")

    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="הזמנה כבר מומשה או בוטלה")

    if inv.expires_at < datetime.utcnow():
        inv.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="הלינק פג תוקף")

    # Create user
    email = data.get("email") or inv.email
    password = data.get("password")
    full_name = data.get("full_name")
    phone = data.get("phone")

    if not email or not password:
        raise HTTPException(status_code=400, detail="נדרש אימייל וסיסמה")

    # Check if email exists
    existing_user = await db.execute(select(User).where(User.email == email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="אימייל כבר קיים במערכת")

    from app.utils.security import hash_password
    user = User(
        tenant_id=inv.tenant_id,
        email=email,
        password_hash=hash_password(password),
        role_definition_id=inv.role_definition_id,
        employee_id=inv.employee_id,
        preferred_language="he",
    )
    db.add(user)
    await db.flush()

    # Update employee if linked
    if inv.employee_id:
        emp_result = await db.execute(select(Employee).where(Employee.id == inv.employee_id))
        emp = emp_result.scalar_one_or_none()
        if emp:
            if full_name:
                emp.full_name = full_name
            if phone:
                channels = emp.notification_channels or {}
                channels["phone_whatsapp"] = phone
                emp.notification_channels = channels

    # Mark invitation as accepted
    inv.status = "accepted"
    inv.accepted_at = datetime.utcnow()

    await db.commit()

    # Generate tokens
    auth_service = AuthService(db)
    tokens = await auth_service.create_tokens(user)

    return {
        "user_id": str(user.id),
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "token_type": "bearer",
    }
