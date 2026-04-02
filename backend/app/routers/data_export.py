"""Tenant data export/import — GDPR-style data portability."""

import csv
import io
import json
import logging
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_tenant
from app.permissions import require_permission
from app.models.employee import Employee
from app.models.scheduling import Mission, MissionAssignment, ScheduleWindow
from app.models.attendance import AttendanceSchedule
from app.models.rules import RuleDefinition
from app.models.audit import AuditLog
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["data-export"])


@router.get("/data-export")
async def export_tenant_data(
    user=Depends(get_current_user),
    tenant: Tenant = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Export all tenant data as a ZIP file containing JSON + CSV."""

    # Collect all data
    data = {}

    # Employees
    emp_result = await db.execute(
        select(Employee).where(Employee.tenant_id == tenant.id)
    )
    employees = emp_result.scalars().all()
    data["employees"] = [
        {
            "id": str(e.id),
            "full_name": e.full_name,
            "employee_number": e.employee_number,
            "phone": e.phone,
            "email": e.email,
            "is_active": e.is_active,
        }
        for e in employees
    ]

    # Schedule Windows
    win_result = await db.execute(
        select(ScheduleWindow).where(ScheduleWindow.tenant_id == tenant.id)
    )
    windows = win_result.scalars().all()
    data["schedule_windows"] = [
        {
            "id": str(w.id),
            "name": w.name,
            "start_date": str(w.start_date),
            "end_date": str(w.end_date),
            "status": w.status,
        }
        for w in windows
    ]

    # Missions
    mission_result = await db.execute(
        select(Mission).where(Mission.tenant_id == tenant.id)
    )
    missions = mission_result.scalars().all()
    data["missions"] = [
        {
            "id": str(m.id),
            "name": m.name,
            "date": str(m.date),
            "start_time": str(m.start_time) if m.start_time else None,
            "end_time": str(m.end_time) if m.end_time else None,
            "status": m.status,
        }
        for m in missions
    ]

    # Assignments
    assign_result = await db.execute(
        select(MissionAssignment).where(
            MissionAssignment.mission_id.in_([m.id for m in missions])
        )
    ) if missions else None
    assignments = assign_result.scalars().all() if assign_result else []
    data["assignments"] = [
        {
            "id": str(a.id),
            "mission_id": str(a.mission_id),
            "employee_id": str(a.employee_id),
        }
        for a in assignments
    ]

    # Rules
    rules_result = await db.execute(
        select(RuleDefinition).where(RuleDefinition.tenant_id == tenant.id)
    )
    rules = rules_result.scalars().all()
    data["rules"] = [
        {
            "id": str(r.id),
            "name": r.name,
            "rule_type": r.rule_type,
            "priority": r.priority,
            "is_active": r.is_active,
        }
        for r in rules
    ]

    # Build ZIP
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # JSON export (full data)
        for key, items in data.items():
            zf.writestr(f"{key}.json", json.dumps(items, ensure_ascii=False, indent=2))

        # CSV exports
        for key, items in data.items():
            if items:
                csv_buffer = io.StringIO()
                writer = csv.DictWriter(csv_buffer, fieldnames=items[0].keys())
                writer.writeheader()
                writer.writerows(items)
                zf.writestr(f"{key}.csv", csv_buffer.getvalue())

        # Metadata
        meta = {
            "tenant_id": str(tenant.id),
            "tenant_name": tenant.name,
            "tenant_slug": tenant.slug,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by": str(user.id),
            "record_counts": {k: len(v) for k, v in data.items()},
        }
        zf.writestr("_metadata.json", json.dumps(meta, ensure_ascii=False, indent=2))

    zip_buffer.seek(0)
    filename = f"shavtzak-export-{tenant.slug}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
