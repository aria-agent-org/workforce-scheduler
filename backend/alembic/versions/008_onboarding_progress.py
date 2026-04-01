"""Add onboarding_progress table.

Revision ID: 008_onboarding_progress
Revises: 007_sprint9_mission_slots
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "008_onboarding_progress"
down_revision = "007_sprint9_mission_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "onboarding_progress",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("current_step", sa.Integer, nullable=False, server_default="0"),
        sa.Column("completed_steps", JSONB, nullable=False, server_default="'{}'"),
        sa.Column("status", sa.String(20), nullable=False, server_default="'in_progress'"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_onboarding_progress_user_id",
        "onboarding_progress",
        ["user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_onboarding_progress_user_id", table_name="onboarding_progress")
    op.drop_table("onboarding_progress")
