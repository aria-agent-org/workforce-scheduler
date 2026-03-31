"""Registration code system for soldier onboarding."""

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.employee import Employee
from app.models.user import User
from app.services.auth_service import AuthService

router = APIRouter()

# In-memory store for reg codes (in production, use Redis or DB table)
# For now we store in a simple DB-adjacent model via employee.notification_channels
# Format: employee.notification_channels.registration = {code, expires_at, used}


def generate_code() -> str:
    """Generate a 6-digit registration code."""
    return f"{secrets.randbelow(1000000):06d}"


class GenerateCodeRequest(BaseModel):
    employee_id: UUID


class RegisterRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=320)  # phone or email
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=6, max_length=128)


class CompleteProfileRequest(BaseModel):
    full_name: str | None = None
    preferred_language: str = "he"


# ═══════════════════════════════════════════
# Admin: Generate Registration Codes
# ═══════════════════════════════════════════

@router.post("/generate-code")
async def generate_registration_code(
    data: GenerateCodeRequest,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a registration code for a soldier."""
    emp_res = await db.execute(
        select(Employee).where(
            Employee.id == data.employee_id,
            Employee.tenant_id == tenant.id,
        )
    )
    emp = emp_res.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="עובד לא נמצא")

    # Check if already has a user account
    existing_user = await db.execute(
        select(User).where(User.employee_id == emp.id, User.is_active.is_(True))
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="לעובד כבר יש חשבון משתמש פעיל")

    code = generate_code()
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()

    channels = emp.notification_channels or {}
    channels["registration"] = {
        "code": code,
        "expires_at": expires_at,
        "used": False,
    }
    emp.notification_channels = channels
    await db.flush()
    await db.commit()

    return {
        "employee_id": str(emp.id),
        "employee_name": emp.full_name,
        "code": code,
        "expires_at": expires_at,
        "status": "ממתין לרישום",
    }


@router.post("/generate-bulk-codes")
async def generate_bulk_codes(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    employee_ids: list[UUID] | None = None,
) -> list[dict]:
    """Generate registration codes for multiple soldiers."""
    query = select(Employee).where(
        Employee.tenant_id == tenant.id,
        Employee.is_active.is_(True),
    )
    if employee_ids:
        query = query.where(Employee.id.in_(employee_ids))

    result = await db.execute(query)
    employees = result.scalars().all()

    codes = []
    for emp in employees:
        # Skip if already has user
        existing = await db.execute(
            select(User).where(User.employee_id == emp.id, User.is_active.is_(True))
        )
        if existing.scalar_one_or_none():
            codes.append({
                "employee_id": str(emp.id),
                "employee_name": emp.full_name,
                "status": "רשום",
                "code": None,
            })
            continue

        code = generate_code()
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()

        channels = emp.notification_channels or {}
        channels["registration"] = {
            "code": code,
            "expires_at": expires_at,
            "used": False,
        }
        emp.notification_channels = channels

        codes.append({
            "employee_id": str(emp.id),
            "employee_name": emp.full_name,
            "code": code,
            "expires_at": expires_at,
            "status": "ממתין לרישום",
        })

    await db.flush()
    await db.commit()
    return codes


@router.get("/registration-status")
async def list_registration_status(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List all soldiers with their registration status."""
    result = await db.execute(
        select(Employee).where(
            Employee.tenant_id == tenant.id,
            Employee.is_active.is_(True),
        ).order_by(Employee.full_name)
    )
    employees = result.scalars().all()
    now = datetime.now(timezone.utc)

    items = []
    for emp in employees:
        # Check if has user account
        user_res = await db.execute(
            select(User).where(User.employee_id == emp.id, User.is_active.is_(True))
        )
        linked_user = user_res.scalar_one_or_none()

        reg_info = (emp.notification_channels or {}).get("registration", {})

        if linked_user:
            status_text = "רשום"
            code = None
            expires_at = None
        elif reg_info.get("used"):
            status_text = "רשום"
            code = None
            expires_at = None
        elif reg_info.get("code"):
            exp = reg_info.get("expires_at", "")
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                if exp_dt < now:
                    status_text = "פג תוקף"
                else:
                    status_text = "ממתין לרישום"
            except Exception:
                status_text = "ממתין לרישום"
            code = reg_info.get("code")
            expires_at = reg_info.get("expires_at")
        else:
            status_text = "ללא קוד"
            code = None
            expires_at = None

        items.append({
            "employee_id": str(emp.id),
            "employee_name": emp.full_name,
            "employee_number": emp.employee_number,
            "phone": (emp.notification_channels or {}).get("phone_whatsapp"),
            "email": (emp.notification_channels or {}).get("email"),
            "status": status_text,
            "code": code,
            "expires_at": expires_at,
            "has_user": linked_user is not None,
            "user_email": linked_user.email if linked_user else None,
        })

    return items


# ═══════════════════════════════════════════
# Public: Register with Code (no auth required)
# ═══════════════════════════════════════════

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_with_code(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Register a new user account using a registration code."""
    # Find employee by phone or email
    result = await db.execute(select(Employee).where(Employee.is_active.is_(True)))
    employees = result.scalars().all()

    target_emp = None
    for emp in employees:
        channels = emp.notification_channels or {}
        phone = channels.get("phone_whatsapp", "")
        email = channels.get("email", "")
        if phone and data.identifier.replace("-", "").replace(" ", "") == phone.replace("-", "").replace(" ", ""):
            target_emp = emp
            break
        if email and data.identifier.lower() == email.lower():
            target_emp = emp
            break
        # Also match employee number
        if emp.employee_number == data.identifier:
            target_emp = emp
            break

    if not target_emp:
        raise HTTPException(status_code=404, detail="לא נמצא עובד עם הפרטים שהוזנו")

    # Validate code
    reg_info = (target_emp.notification_channels or {}).get("registration", {})
    if not reg_info.get("code"):
        raise HTTPException(status_code=400, detail="לא נוצר קוד רישום. פנה למנהל")

    if reg_info.get("used"):
        raise HTTPException(status_code=400, detail="הקוד כבר נוצל")

    if reg_info["code"] != data.code:
        raise HTTPException(status_code=400, detail="קוד שגוי")

    # Check expiry
    try:
        exp = datetime.fromisoformat(reg_info["expires_at"].replace("Z", "+00:00"))
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="הקוד פג תוקף. בקש קוד חדש מהמנהל")
    except (KeyError, ValueError):
        pass

    # Check if user already exists for this employee
    existing = await db.execute(
        select(User).where(User.employee_id == target_emp.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="כבר קיים חשבון לעובד זה")

    # Create user account
    email = (target_emp.notification_channels or {}).get("email") or f"{target_emp.employee_number}@soldier.shavtzak.local"
    # Check email uniqueness
    email_check = await db.execute(select(User).where(User.email == email))
    if email_check.scalar_one_or_none():
        email = f"{target_emp.employee_number}.{target_emp.id.hex[:6]}@soldier.shavtzak.local"

    new_user = User(
        tenant_id=target_emp.tenant_id,
        email=email,
        password_hash=AuthService.hash_password(data.password),
        employee_id=target_emp.id,
        preferred_language=target_emp.preferred_language or "he",
        is_active=True,
    )
    db.add(new_user)

    # Mark code as used
    channels = target_emp.notification_channels or {}
    channels["registration"]["used"] = True
    channels["registration"]["used_at"] = datetime.now(timezone.utc).isoformat()
    target_emp.notification_channels = channels

    await db.flush()
    await db.refresh(new_user)

    # Auto-login: generate tokens
    access_token, expires_in = AuthService.create_access_token(new_user.id)
    refresh_token = AuthService.create_refresh_token(new_user.id)

    await db.commit()

    return {
        "user_id": str(new_user.id),
        "email": new_user.email,
        "employee_name": target_emp.full_name,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "needs_profile_completion": True,
    }
