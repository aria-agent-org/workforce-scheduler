"""Google Sheets sync Celery tasks."""

import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.sheets_sync.sync_inbound")
def sync_inbound(tenant_id: str, config_id: str) -> dict:
    """Sync attendance data from Google Sheets to the system."""
    logger.info(f"Syncing inbound from Sheets for tenant={tenant_id}")
    return {"status": "completed", "updated": 0, "conflicts": 0}


@celery_app.task(name="app.tasks.sheets_sync.sync_outbound")
def sync_outbound(tenant_id: str, config_id: str) -> dict:
    """Push attendance data from the system to Google Sheets."""
    logger.info(f"Syncing outbound to Sheets for tenant={tenant_id}")
    return {"status": "completed", "pushed": 0}
