"""Sprint 3 fixes: nullable work_role_id, timezone default, etc.

Revision ID: 005_sprint3_fixes
Revises: 004_lifecycle_events_and_cleanup
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa

revision = "005_sprint3_fixes"
down_revision = "004_lifecycle_events_and_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make work_role_id nullable on mission_assignments
    op.alter_column(
        "mission_assignments", "work_role_id",
        existing_type=sa.UUID(),
        nullable=True,
    )

    # Add onboarding_completed to users
    op.add_column(
        "users",
        sa.Column("onboarding_completed", sa.Boolean(), nullable=True, server_default="false"),
    )

    # Add timezone to tenants settings if not exists (handled via tenant_settings table)


def downgrade() -> None:
    op.alter_column(
        "mission_assignments", "work_role_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
    op.drop_column("users", "onboarding_completed")
