"""Tenant-scoped user management endpoints."""

import csv
import io
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.permissions import require_permission
from app.models.user import User, UserSession, Invitation
from app.models.employee import Employee
from app.models.resource import RoleDefinition
from app.models.audit import AuditLog
from app.services.auth_service import AuthService

router = APIRouter()


class TenantUserCreate(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=6, max_length=128)
    role_definition_id: UUID | None = None
    employee_id: UUID | None = None
    preferred_language: str = "he"


class TenantUserUpdate(BaseModel):
    email: str | None = None
    role_definition_id: UUID | None = None
    employee_id: UUID | None = None
    preferred_language: str | None = None
    is_active: bool | None = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class BulkImportRow(BaseModel):
    full_name: str
    employee_number: str
    phone: str | None = None
    email: str | None = None
    role_name: str | None = None


class BulkImportRequest(BaseModel):
    rows: list[BulkImportRow]


# ═══════════════════════════════════════════
# Bulk Import — User + Employee together
# ═══════════════════════════════════════════

def _parse_uploaded_file(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    """Parse Excel or CSV file into list of row dicts."""
    rows: list[dict[str, Any]] = []

    # Column name mapping (Hebrew → English)
    COL_MAP = {
        "שם מלא": "full_name",
        "full_name": "full_name",
        "שם": "full_name",
        "מספר עובד": "employee_number",
        "employee_number": "employee_number",
        "מספר אישי": "employee_number",
        "טלפון": "phone",
        "phone": "phone",
        "נייד": "phone",
        "אימייל": "email",
        "email": "email",
        "מייל": "email",
        "תפקיד": "role_name",
        "role_name": "role_name",
        "role": "role_name",
    }

    if filename.endswith((".xlsx", ".xls")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True)
        ws = wb.active
        if ws is None:
            return rows
        all_rows = list(ws.iter_rows(values_only=True))
        if not all_rows:
            return rows
        header = [str(c).strip().lower() if c else "" for c in all_rows[0]]
        mapped_header = [COL_MAP.get(h, h) for h in header]
        for row_vals in all_rows[1:]:
            if not any(row_vals):
                continue
            row_dict = {}
            for i, val in enumerate(row_vals):
                if i < len(mapped_header):
                    row_dict[mapped_header[i]] = str(val).strip() if val is not None else None
            rows.append(row_dict)
        wb.close()
    elif filename.endswith(".csv"):
        text = file_bytes.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        for raw_row in reader:
            row_dict = {}
            for key, val in raw_row.items():
                mapped_key = COL_MAP.get(key.strip().lower(), key.strip().lower())
                row_dict[mapped_key] = val.strip() if val else None
            rows.append(row_dict)
    else:
        raise HTTPException(status_code=400, detail="פורמט קובץ לא נתמך. השתמש ב-Excel (.xlsx) או CSV (.csv)")

    return rows


async def _validate_import_rows(
    rows: list[dict[str, Any]],
    tenant_id: UUID,
    db: AsyncSession,
) -> tuple[list[dict], list[dict]]:
    """Validate import rows. Returns (valid_rows, errors)."""
    valid = []
    errors = []

    # Pre-fetch existing employee numbers for this tenant
    existing_emps_res = await db.execute(
        select(Employee.employee_number).where(Employee.tenant_id == tenant_id)
    )
    existing_emp_numbers = {r[0] for r in existing_emps_res.all()}

    # Pre-fetch existing emails (across all tenants)
    existing_emails_res = await db.execute(select(User.email))
    existing_emails = {r[0].lower() for r in existing_emails_res.all()}

    # Pre-fetch role definitions for this tenant
    roles_res = await db.execute(
        select(RoleDefinition).where(RoleDefinition.tenant_id == tenant_id)
    )
    roles_by_name: dict[str, UUID] = {}
    for rd in roles_res.scalars().all():
        roles_by_name[rd.name.lower()] = rd.id
        if rd.label:
            if isinstance(rd.label, dict):
                for lang_val in rd.label.values():
                    if isinstance(lang_val, str):
                        roles_by_name[lang_val.lower()] = rd.id
            elif isinstance(rd.label, str):
                roles_by_name[rd.label.lower()] = rd.id

    seen_emp_numbers: set[str] = set()
    seen_emails: set[str] = set()

    for i, row in enumerate(rows):
        row_num = i + 2  # Excel row (1-indexed header + 1-indexed data)
        row_errors: list[dict] = []

        full_name = row.get("full_name", "").strip() if row.get("full_name") else ""
        employee_number = row.get("employee_number", "").strip() if row.get("employee_number") else ""
        phone = row.get("phone", "").strip() if row.get("phone") else None
        email = row.get("email", "").strip().lower() if row.get("email") else None
        role_name = row.get("role_name", "").strip() if row.get("role_name") else None

        # Required fields
        if not full_name:
            row_errors.append({"row": row_num, "field": "full_name", "reason": "שם מלא הוא שדה חובה"})
        if not employee_number:
            row_errors.append({"row": row_num, "field": "employee_number", "reason": "מספר עובד הוא שדה חובה"})

        # Need at least email or phone for login
        if not email and not phone:
            row_errors.append({"row": row_num, "field": "email/phone", "reason": "חובה לציין אימייל או טלפון"})

        # Duplicate employee_number in file
        if employee_number and employee_number in seen_emp_numbers:
            row_errors.append({"row": row_num, "field": "employee_number", "reason": f"מספר עובד '{employee_number}' מופיע יותר מפעם אחת בקובץ"})
        elif employee_number and employee_number in existing_emp_numbers:
            row_errors.append({"row": row_num, "field": "employee_number", "reason": f"מספר עובד '{employee_number}' כבר קיים במערכת"})

        # Duplicate email in file
        if email and email in seen_emails:
            row_errors.append({"row": row_num, "field": "email", "reason": f"אימייל '{email}' מופיע יותר מפעם אחת בקובץ"})
        elif email and email in existing_emails:
            row_errors.append({"row": row_num, "field": "email", "reason": "אימייל כבר קיים במערכת — פנה למנהל מערכת"})

        # Resolve role
        role_definition_id = None
        if role_name:
            role_definition_id = roles_by_name.get(role_name.lower())
            if not role_definition_id:
                row_errors.append({"row": row_num, "field": "role_name", "reason": f"תפקיד '{role_name}' לא נמצא במערכת"})

        if row_errors:
            errors.extend(row_errors)
        else:
            if employee_number:
                seen_emp_numbers.add(employee_number)
            if email:
                seen_emails.add(email)
            valid.append({
                "full_name": full_name,
                "employee_number": employee_number,
                "phone": phone,
                "email": email,
                "role_definition_id": role_definition_id,
            })

    return valid, errors


@router.post("/bulk-import/preview", dependencies=[Depends(require_permission("users", "write"))])
async def bulk_import_preview(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
) -> dict:
    """Preview bulk import — validate without creating."""
    file_bytes = await file.read()
    rows = _parse_uploaded_file(file_bytes, file.filename or "file.xlsx")

    if not rows:
        raise HTTPException(status_code=400, detail="הקובץ ריק — לא נמצאו שורות לייבוא")

    valid, errors = await _validate_import_rows(rows, tenant.id, db)
    return {
        "total_rows": len(rows),
        "valid": len(valid),
        "errors": errors,
        "preview": [
            {
                "row": i + 2,
                "full_name": v["full_name"],
                "employee_number": v["employee_number"],
                "phone": v.get("phone"),
                "email": v.get("email"),
            }
            for i, v in enumerate(valid)
        ],
    }


@router.post("/bulk-import/json", dependencies=[Depends(require_permission("users", "write"))])
async def bulk_import_preview_json(
    data: BulkImportRequest,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Preview bulk import from JSON body."""
    rows = [r.model_dump() for r in data.rows]
    if not rows:
        raise HTTPException(status_code=400, detail="לא נמצאו שורות לייבוא")

    valid, errors = await _validate_import_rows(rows, tenant.id, db)
    return {
        "total_rows": len(rows),
        "valid": len(valid),
        "errors": errors,
        "preview": [
            {
                "row": i + 2,
                "full_name": v["full_name"],
                "employee_number": v["employee_number"],
                "phone": v.get("phone"),
                "email": v.get("email"),
            }
            for i, v in enumerate(valid)
        ],
    }


@router.post("/bulk-import", dependencies=[Depends(require_permission("users", "write"))])
async def bulk_import_users(
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
) -> dict:
    """Bulk import users + employees from Excel/CSV."""
    file_bytes = await file.read()
    rows = _parse_uploaded_file(file_bytes, file.filename or "file.xlsx")

    if not rows:
        raise HTTPException(status_code=400, detail="הקובץ ריק — לא נמצאו שורות לייבוא")

    valid_rows, errors = await _validate_import_rows(rows, tenant.id, db)
    created_count = 0
    skipped_count = len(rows) - len(valid_rows)

    for v in valid_rows:
        # 1. Create Employee
        notification_channels: dict[str, Any] = {}
        if v["phone"]:
            notification_channels["phone_whatsapp"] = v["phone"]
            notification_channels["active_channels"] = ["whatsapp"]
        if v["email"]:
            notification_channels["email"] = v["email"]
            if "active_channels" not in notification_channels:
                notification_channels["active_channels"] = []
            notification_channels["active_channels"].append("email")

        employee = Employee(
            tenant_id=tenant.id,
            full_name=v["full_name"],
            employee_number=v["employee_number"],
            notification_channels=notification_channels or None,
        )
        db.add(employee)
        await db.flush()
        await db.refresh(employee)

        # 2. Create User (no password — user registers via invitation)
        login_email = v["email"] or f"{v['phone']}@phone.local"
        new_user = User(
            tenant_id=tenant.id,
            email=login_email,
            password_hash=None,  # No password — user sets via invitation
            role_definition_id=v.get("role_definition_id"),
            employee_id=employee.id,
            preferred_language="he",
            is_active=True,
        )
        db.add(new_user)
        await db.flush()
        await db.refresh(new_user)

        # 3. Create invitation so user can register
        token = secrets.token_urlsafe(48)
        invitation = Invitation(
            tenant_id=tenant.id,
            email=v["email"],
            phone=v["phone"],
            token=token,
            role_definition_id=v.get("role_definition_id"),
            employee_id=employee.id,
            invited_by=user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(invitation)

        # 4. Audit
        db.add(AuditLog(
            tenant_id=tenant.id, user_id=user.id, action="bulk_import",
            entity_type="user", entity_id=new_user.id,
            after_state={
                "email": login_email,
                "employee_id": str(employee.id),
                "employee_number": v["employee_number"],
                "full_name": v["full_name"],
            },
            ip_address=request.client.host if request.client else None,
        ))
        created_count += 1

    await db.commit()

    return {
        "created": created_count,
        "skipped": skipped_count,
        "errors": errors,
    }


# ═══════════════════════════════════════════
# Tenant User CRUD
# ═══════════════════════════════════════════

@router.get("", dependencies=[Depends(require_permission("users", "read"))])
async def list_tenant_users(
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = 1, page_size: int = 50,
    search: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
) -> dict:
    """List all users within the current tenant."""
    query = select(User).where(User.tenant_id == tenant.id)
    if search:
        query = query.where(User.email.ilike(f"%{search}%"))
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    total_q = await db.execute(
        select(func.count()).select_from(
            query.subquery()
        )
    )
    total = total_q.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        query.order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    users = result.scalars().all()

    items = []
    for u in users:
        role_name = None
        role_label = None
        if u.role_definition_id:
            rd_res = await db.execute(
                select(RoleDefinition).where(RoleDefinition.id == u.role_definition_id)
            )
            rd = rd_res.scalar_one_or_none()
            if rd:
                role_name = rd.name
                role_label = rd.label

        employee_name = None
        if u.employee_id:
            emp_res = await db.execute(
                select(Employee).where(Employee.id == u.employee_id)
            )
            emp = emp_res.scalar_one_or_none()
            employee_name = emp.full_name if emp else None

        # Count active sessions
        sess_count = (await db.execute(
            select(func.count()).where(
                UserSession.user_id == u.id,
                UserSession.revoked_at.is_(None),
            )
        )).scalar() or 0

        items.append({
            "id": str(u.id),
            "email": u.email,
            "role_definition_id": str(u.role_definition_id) if u.role_definition_id else None,
            "role_name": role_name,
            "role_label": role_label,
            "employee_id": str(u.employee_id) if u.employee_id else None,
            "employee_name": employee_name,
            "preferred_language": u.preferred_language,
            "is_active": u.is_active,
            "two_factor_enabled": u.two_factor_enabled,
            "last_login": str(u.last_login) if u.last_login else None,
            "active_sessions": sess_count,
            "created_at": str(u.created_at),
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_permission("users", "write"))])
async def create_tenant_user(
    data: TenantUserCreate,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a new user within the tenant."""
    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"האימייל '{data.email}' כבר קיים במערכת")

    # Validate role belongs to this tenant
    if data.role_definition_id:
        rd_res = await db.execute(
            select(RoleDefinition).where(
                RoleDefinition.id == data.role_definition_id,
                RoleDefinition.tenant_id == tenant.id,
            )
        )
        if not rd_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="הגדרת תפקיד לא נמצאה")

    # Validate employee belongs to tenant and is not already linked
    if data.employee_id:
        emp_res = await db.execute(
            select(Employee).where(
                Employee.id == data.employee_id,
                Employee.tenant_id == tenant.id,
            )
        )
        if not emp_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="עובד לא נמצא")

        # Check if another user already has this employee_id
        existing_link = await db.execute(
            select(User).where(User.employee_id == data.employee_id)
        )
        linked_user = existing_link.scalar_one_or_none()
        if linked_user:
            raise HTTPException(
                status_code=409,
                detail=f"חייל זה כבר מקושר למשתמש אחר ({linked_user.email})"
            )

    new_user = User(
        tenant_id=tenant.id,
        email=data.email,
        password_hash=AuthService.hash_password(data.password),
        role_definition_id=data.role_definition_id,
        employee_id=data.employee_id,
        preferred_language=data.preferred_language,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="create",
        entity_type="user", entity_id=new_user.id,
        after_state={"email": new_user.email},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {
        "id": str(new_user.id),
        "email": new_user.email,
        "role_definition_id": str(new_user.role_definition_id) if new_user.role_definition_id else None,
        "employee_id": str(new_user.employee_id) if new_user.employee_id else None,
        "is_active": new_user.is_active,
        "created_at": str(new_user.created_at),
    }


@router.get("/{user_id}")
async def get_tenant_user(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get a specific user in the tenant."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    role_name = None
    role_label = None
    if target.role_definition_id:
        rd_res = await db.execute(
            select(RoleDefinition).where(RoleDefinition.id == target.role_definition_id)
        )
        rd = rd_res.scalar_one_or_none()
        if rd:
            role_name = rd.name
            role_label = rd.label

    employee_name = None
    if target.employee_id:
        emp_res = await db.execute(
            select(Employee).where(Employee.id == target.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        employee_name = emp.full_name if emp else None

    # Get sessions
    sess_res = await db.execute(
        select(UserSession).where(
            UserSession.user_id == target.id,
            UserSession.revoked_at.is_(None),
        ).order_by(UserSession.created_at.desc())
    )
    sessions = [
        {
            "id": str(s.id),
            "device_info": s.device_info,
            "ip_address": s.ip_address,
            "auth_method": s.auth_method,
            "last_active_at": str(s.last_active_at) if s.last_active_at else None,
            "created_at": str(s.created_at),
        }
        for s in sess_res.scalars().all()
    ]

    return {
        "id": str(target.id),
        "email": target.email,
        "role_definition_id": str(target.role_definition_id) if target.role_definition_id else None,
        "role_name": role_name,
        "role_label": role_label,
        "employee_id": str(target.employee_id) if target.employee_id else None,
        "employee_name": employee_name,
        "preferred_language": target.preferred_language,
        "is_active": target.is_active,
        "two_factor_enabled": target.two_factor_enabled,
        "last_login": str(target.last_login) if target.last_login else None,
        "sessions": sessions,
        "created_at": str(target.created_at),
    }


@router.patch("/{user_id}", dependencies=[Depends(require_permission("users", "write"))])
async def update_tenant_user(
    user_id: UUID,
    data: TenantUserUpdate,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Update a user within the tenant."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    before = {"email": target.email, "is_active": target.is_active}

    # Check employee_id uniqueness if changing
    update_data = data.model_dump(exclude_unset=True)
    if "employee_id" in update_data and update_data["employee_id"] is not None:
        new_emp_id = update_data["employee_id"]
        if new_emp_id != target.employee_id:
            existing_link = await db.execute(
                select(User).where(
                    User.employee_id == new_emp_id,
                    User.id != target.id,
                )
            )
            linked_user = existing_link.scalar_one_or_none()
            if linked_user:
                raise HTTPException(
                    status_code=409,
                    detail=f"חייל זה כבר מקושר למשתמש אחר ({linked_user.email})"
                )

    for key, value in update_data.items():
        setattr(target, key, value)

    # If deactivating user and linked to employee, deactivate employee too
    if data.is_active is False and target.employee_id:
        emp_res = await db.execute(
            select(Employee).where(Employee.id == target.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        if emp:
            emp.is_active = False

    await db.flush()
    await db.refresh(target)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="update",
        entity_type="user", entity_id=target.id,
        before_state=before,
        after_state={"email": target.email, "is_active": target.is_active},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {
        "id": str(target.id),
        "email": target.email,
        "role_definition_id": str(target.role_definition_id) if target.role_definition_id else None,
        "employee_id": str(target.employee_id) if target.employee_id else None,
        "is_active": target.is_active,
    }


@router.delete("/{user_id}", dependencies=[Depends(require_permission("users", "write"))])
async def deactivate_tenant_user(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Deactivate a user (soft delete)."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    target.is_active = False

    # Also deactivate linked employee
    if target.employee_id:
        emp_res = await db.execute(
            select(Employee).where(Employee.id == target.employee_id)
        )
        emp = emp_res.scalar_one_or_none()
        if emp:
            emp.is_active = False

    # Revoke all sessions
    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == target.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="deactivate",
        entity_type="user", entity_id=target.id,
        after_state={"email": target.email, "is_active": False},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {"id": str(target.id), "is_active": False, "message": "משתמש הושבת"}


@router.post("/{user_id}/link-soldier")
async def link_user_to_soldier(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
    employee_id: UUID | None = None,
) -> dict:
    """Link a user to an employee (soldier)."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    if employee_id:
        emp_res = await db.execute(
            select(Employee).where(
                Employee.id == employee_id,
                Employee.tenant_id == tenant.id,
            )
        )
        if not emp_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="עובד לא נמצא")

        # Check if another user already has this employee_id
        existing_link = await db.execute(
            select(User).where(
                User.employee_id == employee_id,
                User.id != user_id,
            )
        )
        linked_user = existing_link.scalar_one_or_none()
        if linked_user:
            raise HTTPException(
                status_code=409,
                detail=f"חייל זה כבר מקושר למשתמש אחר ({linked_user.email})"
            )

    target.employee_id = employee_id
    await db.flush()
    await db.commit()

    return {
        "id": str(target.id),
        "employee_id": str(target.employee_id) if target.employee_id else None,
        "message": "משתמש קושר לעובד בהצלחה" if employee_id else "קישור לעובד הוסר",
    }


@router.post("/{user_id}/reset-password", dependencies=[Depends(require_permission("users", "write"))])
async def reset_user_password(
    user_id: UUID,
    data: ResetPasswordRequest,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Admin reset password for a user."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    target.password_hash = AuthService.hash_password(data.new_password)

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="reset_password",
        entity_type="user", entity_id=target.id,
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {"message": "סיסמה עודכנה בהצלחה"}


@router.get("/{user_id}/sessions")
async def list_user_sessions(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List active sessions for a user."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    sess_res = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        ).order_by(UserSession.created_at.desc())
    )
    return [
        {
            "id": str(s.id),
            "device_info": s.device_info,
            "ip_address": s.ip_address,
            "auth_method": s.auth_method,
            "last_active_at": str(s.last_active_at) if s.last_active_at else None,
            "created_at": str(s.created_at),
        }
        for s in sess_res.scalars().all()
    ]


@router.post("/{user_id}/force-logout", dependencies=[Depends(require_permission("users", "write"))])
async def force_logout_user(
    user_id: UUID,
    tenant: CurrentTenant, user: CurrentUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force logout a user from all devices."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")

    count = (await db.execute(
        select(func.count()).where(
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    )).scalar() or 0

    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )

    db.add(AuditLog(
        tenant_id=tenant.id, user_id=user.id, action="force_logout",
        entity_type="user", entity_id=user_id,
        after_state={"revoked_sessions": count},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()

    return {"message": f"{count} sessions נותקו בהצלחה"}
