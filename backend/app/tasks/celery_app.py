"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "shavtzak",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Jerusalem",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,
)

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])

# Explicit task imports to ensure registration
import app.tasks.notifications  # noqa
import app.tasks.sheets_sync  # noqa
import app.tasks.scheduling  # noqa
import app.tasks.cleanup  # noqa

# Beat schedule
celery_app.conf.beat_schedule = {
    "whatsapp-daily-session-reminder": {
        "task": "app.tasks.notifications.send_daily_whatsapp_reminders",
        "schedule": crontab(hour=7, minute=0),
    },
    "cleanup-expired-tokens": {
        "task": "app.tasks.notifications.cleanup_expired_tokens",
        "schedule": crontab(hour=3, minute=0),
    },
    "cleanup-expired-data-retention": {
        "task": "app.tasks.cleanup.cleanup_expired_data",
        "schedule": crontab(hour=2, minute=30),
    },
}
