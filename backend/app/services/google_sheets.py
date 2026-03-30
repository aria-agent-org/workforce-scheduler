"""Google Sheets integration service for attendance sync."""

import json
import logging
from datetime import date, datetime, timezone
from uuid import UUID

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.attendance import AttendanceSchedule, AttendanceSyncConflict
from app.models.employee import Employee
from app.models.resource import GoogleSheetsConfig

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def _get_sheets_service(config: GoogleSheetsConfig):
    """Build a Google Sheets API service instance."""
    settings = get_settings()

    creds_json = settings.google_service_account_json
    if not creds_json:
        raise ValueError("Google Sheets not configured — missing GOOGLE_SERVICE_ACCOUNT_JSON")

    # Support both a JSON string and a file path
    if creds_json.strip().startswith("{"):
        info = json.loads(creds_json)
        credentials = Credentials.from_service_account_info(info, scopes=SCOPES)
    else:
        credentials = Credentials.from_service_account_file(creds_json, scopes=SCOPES)

    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


def _read_sheet(service, spreadsheet_id: str, sheet_name: str) -> list[list[str]]:
    """Read all rows from a sheet."""
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=sheet_name)
        .execute()
    )
    return result.get("values", [])


def _write_sheet(service, spreadsheet_id: str, range_str: str, rows: list[list[str]]):
    """Write rows to a sheet range."""
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_str,
        valueInputOption="USER_ENTERED",
        body={"values": rows},
    ).execute()


async def test_connection(config: GoogleSheetsConfig) -> bool:
    """
    Test connectivity to a Google Sheet.

    Returns:
        True if the sheet is accessible, False otherwise.
    """
    try:
        service = _get_sheets_service(config)
        meta = (
            service.spreadsheets()
            .get(spreadsheetId=config.spreadsheet_id)
            .execute()
        )
        title = meta.get("properties", {}).get("title", "unknown")
        logger.info(f"Google Sheets connection OK — spreadsheet: {title}")
        return True
    except HttpError as exc:
        logger.error(f"Google Sheets API error: {exc}")
        return False
    except Exception as exc:
        logger.error(f"Google Sheets connection failed: {exc}")
        return False


async def sync_inbound(
    config: GoogleSheetsConfig,
    db: AsyncSession,
) -> dict:
    """
    Read attendance data from Google Sheets and update the system.

    Reads the configured sheet, maps columns using config.column_mapping,
    and upserts AttendanceSchedule records. If the system already has a
    different value, creates an AttendanceSyncConflict record.

    Returns:
        Dict with keys: updated, skipped, conflicts, errors.
    """
    stats = {"updated": 0, "skipped": 0, "conflicts": 0, "errors": 0}

    try:
        service = _get_sheets_service(config)
        rows = _read_sheet(service, config.spreadsheet_id, config.sheet_name)
    except Exception as exc:
        logger.error(f"Failed to read Google Sheet: {exc}")
        stats["errors"] += 1
        return stats

    if len(rows) < 2:
        logger.warning("Sheet has no data rows")
        return stats

    # Column mapping: {"employee_number": 0, "date": 1, "status": 2, ...}
    col_map = config.column_mapping or {}
    emp_col = col_map.get("employee_number", 0)
    date_col = col_map.get("date", 1)
    status_col = col_map.get("status", 2)

    # Status code mapping: {"נוכח": "present", "בית": "home", ...}
    status_map = config.status_code_mapping or {}

    # Header row
    header = rows[0]
    data_rows = rows[1:]

    # Load employees for this tenant
    emp_result = await db.execute(
        select(Employee).where(
            Employee.tenant_id == config.tenant_id,
            Employee.is_active.is_(True),
        )
    )
    employees = {e.employee_number: e for e in emp_result.scalars().all()}

    for row_idx, row in enumerate(data_rows, start=2):
        try:
            if len(row) <= max(emp_col, date_col, status_col):
                stats["skipped"] += 1
                continue

            emp_number = str(row[emp_col]).strip()
            date_str = str(row[date_col]).strip()
            raw_status = str(row[status_col]).strip()

            # Map status
            status_code = status_map.get(raw_status, raw_status)

            # Find employee
            employee = employees.get(emp_number)
            if not employee:
                logger.debug(f"Row {row_idx}: unknown employee_number={emp_number}")
                stats["skipped"] += 1
                continue

            # Parse date (supports DD/MM/YYYY and YYYY-MM-DD)
            try:
                if "/" in date_str:
                    parts = date_str.split("/")
                    record_date = date(int(parts[2]), int(parts[1]), int(parts[0]))
                else:
                    record_date = date.fromisoformat(date_str)
            except (ValueError, IndexError):
                logger.warning(f"Row {row_idx}: invalid date={date_str}")
                stats["errors"] += 1
                continue

            # Check existing record
            existing_result = await db.execute(
                select(AttendanceSchedule).where(
                    AttendanceSchedule.tenant_id == config.tenant_id,
                    AttendanceSchedule.employee_id == employee.id,
                    AttendanceSchedule.date == record_date,
                )
            )
            existing = existing_result.scalar_one_or_none()

            if existing:
                if existing.status_code == status_code:
                    # No change
                    stats["skipped"] += 1
                    continue

                if existing.source != "google_sheets":
                    # Conflict: system has a different value from a different source
                    conflict = AttendanceSyncConflict(
                        tenant_id=config.tenant_id,
                        employee_id=employee.id,
                        date=record_date,
                        system_value=existing.status_code,
                        sheets_value=status_code,
                        sheets_raw_value=raw_status,
                        conflict_reason={
                            "source": existing.source,
                            "row": row_idx,
                        },
                        status="pending",
                    )
                    db.add(conflict)
                    stats["conflicts"] += 1
                    continue

                # Update from sheets source
                existing.status_code = status_code
                existing.google_sheets_synced_at = datetime.now(timezone.utc)
                stats["updated"] += 1
            else:
                # New record from sheets
                new_record = AttendanceSchedule(
                    tenant_id=config.tenant_id,
                    schedule_window_id=config.schedule_window_id,
                    employee_id=employee.id,
                    date=record_date,
                    status_code=status_code,
                    source="google_sheets",
                    google_sheets_synced_at=datetime.now(timezone.utc),
                )
                db.add(new_record)
                stats["updated"] += 1

        except Exception as exc:
            logger.error(f"Row {row_idx}: unexpected error — {exc}")
            stats["errors"] += 1

    # Update config sync status
    config.last_sync_at = datetime.now(timezone.utc).isoformat()
    config.last_sync_status = "completed"

    await db.flush()

    logger.info(
        f"Sheets inbound sync complete — "
        f"updated={stats['updated']} skipped={stats['skipped']} "
        f"conflicts={stats['conflicts']} errors={stats['errors']}"
    )
    return stats


async def sync_outbound(
    config: GoogleSheetsConfig,
    db: AsyncSession,
) -> dict:
    """
    Push attendance data from the system to Google Sheets.

    Reads current attendance records and writes them to the configured sheet.

    Returns:
        Dict with keys: pushed, errors.
    """
    stats = {"pushed": 0, "errors": 0}

    try:
        service = _get_sheets_service(config)
    except Exception as exc:
        logger.error(f"Failed to connect to Google Sheets: {exc}")
        stats["errors"] += 1
        return stats

    # Column mapping
    col_map = config.column_mapping or {}
    emp_col = col_map.get("employee_number", 0)
    date_col = col_map.get("date", 1)
    status_col = col_map.get("status", 2)

    # Reverse status mapping: {"present": "נוכח", ...}
    status_map = config.status_code_mapping or {}
    reverse_status_map = {v: k for k, v in status_map.items()}

    # Load attendance records
    attendance_result = await db.execute(
        select(AttendanceSchedule).where(
            AttendanceSchedule.tenant_id == config.tenant_id,
        )
    )
    records = attendance_result.scalars().all()

    if not records:
        logger.info("No attendance records to push")
        return stats

    # Load employees
    emp_result = await db.execute(
        select(Employee).where(
            Employee.tenant_id == config.tenant_id,
            Employee.is_active.is_(True),
        )
    )
    employees = {e.id: e for e in emp_result.scalars().all()}

    # Determine max columns needed
    max_col = max(emp_col, date_col, status_col) + 1

    # Build header
    header = [""] * max_col
    header[emp_col] = "מספר חייל"
    header[date_col] = "תאריך"
    header[status_col] = "סטטוס"

    # Build rows
    rows = [header]
    for record in records:
        emp = employees.get(record.employee_id)
        if not emp:
            continue

        row = [""] * max_col
        row[emp_col] = emp.employee_number
        row[date_col] = record.date.strftime("%d/%m/%Y")
        row[status_col] = reverse_status_map.get(record.status_code, record.status_code)
        rows.append(row)
        stats["pushed"] += 1

    try:
        range_str = f"{config.sheet_name}!A1"
        _write_sheet(service, config.spreadsheet_id, range_str, rows)
    except Exception as exc:
        logger.error(f"Failed to write to Google Sheet: {exc}")
        stats["errors"] += 1
        return stats

    # Update config sync status
    config.last_sync_at = datetime.now(timezone.utc).isoformat()
    config.last_sync_status = "completed"
    await db.flush()

    logger.info(f"Sheets outbound sync complete — pushed={stats['pushed']}")
    return stats
