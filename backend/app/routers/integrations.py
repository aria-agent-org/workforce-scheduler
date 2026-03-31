"""Integrations endpoints: Google Sheets config, sync, conflicts."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentUser, CurrentTenant
from app.models.resource import GoogleSheetsConfig
from app.permissions import require_permission

router = APIRouter()


# ═══════════════════════════════════════════
# Schemas
# ═══════════════════════════════════════════

class GoogleSheetsConfigResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    spreadsheet_id: str
    sheet_name: str
    sync_direction: str
    auto_sync_inbound: bool
    auto_sync_outbound: bool
    ask_before_push: bool
    column_mapping: dict | None = None
    status_code_mapping: dict | None = None
    conflict_notification_user_ids: list | None = None
    last_sync_at: str | None = None
    last_sync_status: str | None = None

    model_config = {"from_attributes": True}


class GoogleSheetsConfigUpdate(BaseModel):
    spreadsheet_id: str | None = None
    sheet_name: str | None = None
    sync_direction: str | None = None
    auto_sync_inbound: bool | None = None
    auto_sync_outbound: bool | None = None
    ask_before_push: bool | None = None
    column_mapping: dict | None = None
    status_code_mapping: dict | None = None
    conflict_notification_user_ids: list | None = None
    credentials_secret_arn: str | None = None
    schedule_window_id: str | None = None


# ═══════════════════════════════════════════
# Google Sheets Config
# ═══════════════════════════════════════════

@router.get("/google-sheets", dependencies=[Depends(require_permission("settings", "read"))])
async def get_google_sheets_config(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict | None:
    """Get Google Sheets integration config for tenant."""
    result = await db.execute(
        select(GoogleSheetsConfig).where(GoogleSheetsConfig.tenant_id == tenant.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        return {"configured": False}
    return GoogleSheetsConfigResponse.model_validate(config).model_dump()


@router.put("/google-sheets", dependencies=[Depends(require_permission("settings", "write"))])
async def update_google_sheets_config(
    data: GoogleSheetsConfigUpdate, tenant: CurrentTenant, user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or update Google Sheets integration config."""
    result = await db.execute(
        select(GoogleSheetsConfig).where(GoogleSheetsConfig.tenant_id == tenant.id)
    )
    config = result.scalar_one_or_none()

    update_data = data.model_dump(exclude_unset=True)
    if not config:
        # Must provide at least spreadsheet_id and sheet_name for creation
        if not update_data.get("spreadsheet_id") or not update_data.get("sheet_name"):
            raise HTTPException(
                status_code=400,
                detail="יש לספק spreadsheet_id ו-sheet_name ליצירת תצורה חדשה",
            )
        config = GoogleSheetsConfig(tenant_id=tenant.id, **update_data)
        db.add(config)
    else:
        for key, value in update_data.items():
            setattr(config, key, value)

    await db.flush()
    await db.refresh(config)
    await db.commit()
    return GoogleSheetsConfigResponse.model_validate(config).model_dump()


@router.post("/google-sheets/sync", dependencies=[Depends(require_permission("settings", "write"))])
async def trigger_google_sheets_sync(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    """Trigger a manual Google Sheets sync."""
    result = await db.execute(
        select(GoogleSheetsConfig).where(GoogleSheetsConfig.tenant_id == tenant.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="תצורת Google Sheets לא נמצאה")

    # TODO: trigger actual sync job via background task / celery
    # For now, return a queued status
    return {
        "status": "queued",
        "message": "סנכרון הועבר לתור העיבוד",
        "spreadsheet_id": config.spreadsheet_id,
        "sheet_name": config.sheet_name,
        "sync_direction": config.sync_direction,
    }


@router.post("/google-sheets/test", dependencies=[Depends(require_permission("settings", "write"))])
async def test_google_sheets_connection(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> dict:
    """Test the Google Sheets connection."""
    result = await db.execute(
        select(GoogleSheetsConfig).where(GoogleSheetsConfig.tenant_id == tenant.id)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="תצורת Google Sheets לא נמצאה")

    # TODO: actually test connection to Google Sheets API
    # For now, validate that required fields exist
    if not config.spreadsheet_id or not config.sheet_name:
        return {"success": False, "error": "חסרים פרטי גיליון"}

    if not config.credentials_secret_arn:
        return {"success": False, "error": "חסרים פרטי הרשאה"}

    return {
        "success": True,
        "message": "החיבור תקין",
        "spreadsheet_id": config.spreadsheet_id,
        "sheet_name": config.sheet_name,
    }


@router.get("/google-sheets/conflicts", dependencies=[Depends(require_permission("settings", "read"))])
async def list_google_sheets_conflicts(
    tenant: CurrentTenant, user: CurrentUser, db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List sync conflicts for Google Sheets integration."""
    # TODO: implement conflict tracking table
    # For now, return empty list — conflicts will be stored when sync engine is built
    return []
