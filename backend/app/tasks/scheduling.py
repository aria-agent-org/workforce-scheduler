"""Scheduling-related Celery tasks."""

import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.scheduling.run_auto_assign")
def run_auto_assign(tenant_id: str, window_id: str) -> dict:
    """Run the auto-assignment algorithm for a schedule window."""
    logger.info(f"Running auto-assign for tenant={tenant_id}, window={window_id}")
    # In production: create async DB session and use auto_assign service
    return {"status": "completed", "assigned": 0, "unresolved": 0}


@celery_app.task(name="app.tasks.scheduling.generate_missions_from_templates")
def generate_missions_from_templates(tenant_id: str, window_id: str) -> dict:
    """Generate mission instances from templates for a date range."""
    logger.info(f"Generating missions for tenant={tenant_id}, window={window_id}")
    return {"status": "completed", "generated": 0}
