"""Data retention cleanup tasks."""

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, delete, and_

from app.tasks.celery_app import celery_app
from app.database import async_session_factory
from app.models.retention import DataRetentionConfig
from app.models.audit import AuditLog
from app.models.notification import NotificationLog
from app.models.bot import AIUsageLog

logger = logging.getLogger(__name__)

# Map entity_type → model class
ENTITY_MODEL_MAP = {
    "audit_log": AuditLog,
    "notification_log": NotificationLog,
    "ai_chat_log": AIUsageLog,
}


@celery_app.task(name="app.tasks.cleanup.cleanup_expired_data")
def cleanup_expired_data():
    """Daily task: delete records older than retention policy per tenant."""
    import asyncio
    asyncio.get_event_loop().run_until_complete(_cleanup_expired_data_async())


async def _cleanup_expired_data_async():
    """Async implementation of data retention cleanup."""
    async with async_session_factory() as db:
        result = await db.execute(select(DataRetentionConfig))
        configs = result.scalars().all()

        for config in configs:
            model_class = ENTITY_MODEL_MAP.get(config.entity_type)
            if not model_class:
                logger.warning(
                    "Unknown entity_type '%s' in retention config %s",
                    config.entity_type,
                    config.id,
                )
                continue

            cutoff_date = datetime.now(timezone.utc) - timedelta(days=config.retain_days)

            if config.archive_to_s3:
                logger.info(
                    "S3 archiving stub: would archive %s records older than %s "
                    "for tenant %s before deletion",
                    config.entity_type,
                    cutoff_date.isoformat(),
                    config.tenant_id,
                )

            # Delete expired records
            stmt = delete(model_class).where(
                and_(
                    model_class.tenant_id == config.tenant_id,
                    model_class.created_at < cutoff_date,
                )
            )
            delete_result = await db.execute(stmt)
            deleted_count = delete_result.rowcount

            if deleted_count > 0:
                logger.info(
                    "Retention cleanup: deleted %d %s records for tenant %s "
                    "(older than %d days)",
                    deleted_count,
                    config.entity_type,
                    config.tenant_id,
                    config.retain_days,
                )

        await db.commit()
