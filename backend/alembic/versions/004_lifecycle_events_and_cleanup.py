"""Add schedule_window_lifecycle_events table and parent_mission_id index.

Revision ID: 004
Revises: 003
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "schedule_window_lifecycle_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("schedule_window_id", UUID(as_uuid=True), sa.ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(20), nullable=False),
        sa.Column("resume_mode", sa.String(30), nullable=True),
        sa.Column("performed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("state_snapshot", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "idx_lifecycle_events_window",
        "schedule_window_lifecycle_events",
        ["schedule_window_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_lifecycle_events_window", table_name="schedule_window_lifecycle_events")
    op.drop_table("schedule_window_lifecycle_events")
