"""Google Sheets sync Celery tasks."""

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select

from app.database import async_session_factory
from app.models.resource import GoogleSheetsConfig
from app.services import google_sheets
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


async def _get_config(session, config_id: str) -> GoogleSheetsConfig | None:
    """Load a GoogleSheetsConfig by ID."""
    result = await session.execute(
        select(GoogleSheetsConfig).where(GoogleSheetsConfig.id == UUID(config_id))
    )
    return result.scalar_one_or_none()


@celery_app.task(name="app.tasks.sheets_sync.sync_inbound")
def sync_inbound(tenant_id: str, config_id: str) -> dict:
    """Sync attendance data from Google Sheets to the system."""

    async def _sync():
        async with async_session_factory() as session:
            config = await _get_config(session, config_id)
            if not config:
                logger.error(f"GoogleSheetsConfig {config_id} not found")
                return {"status": "error", "error": "config_not_found"}

            stats = await google_sheets.sync_inbound(config, session)
            await session.commit()
            return stats

    logger.info(f"Syncing inbound from Sheets for tenant={tenant_id}, config={config_id}")
    result = _run_async(_sync())
    return {"status": "completed", **result}


@celery_app.task(name="app.tasks.sheets_sync.sync_outbound")
def sync_outbound(tenant_id: str, config_id: str) -> dict:
    """Push attendance data from the system to Google Sheets."""

    async def _sync():
        async with async_session_factory() as session:
            config = await _get_config(session, config_id)
            if not config:
                logger.error(f"GoogleSheetsConfig {config_id} not found")
                return {"status": "error", "error": "config_not_found"}

            stats = await google_sheets.sync_outbound(config, session)
            await session.commit()
            return stats

    logger.info(f"Syncing outbound to Sheets for tenant={tenant_id}, config={config_id}")
    result = _run_async(_sync())
    return {"status": "completed", **result}
