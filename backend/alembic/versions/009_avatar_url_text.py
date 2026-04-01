"""Widen avatar_url columns to Text for base64 storage.

Revision ID: 009_avatar_url_text
Revises: 008_onboarding_progress
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = "009_avatar_url_text"
down_revision = "008_onboarding_progress"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Widen avatar_url and avatar_thumbnail_url from VARCHAR(500) to TEXT
    # This allows storing base64-encoded image data (data URIs can be 100KB+)
    op.alter_column(
        "employee_profiles",
        "avatar_url",
        type_=sa.Text,
        existing_type=sa.String(500),
        existing_nullable=True,
    )
    op.alter_column(
        "employee_profiles",
        "avatar_thumbnail_url",
        type_=sa.Text,
        existing_type=sa.String(500),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "employee_profiles",
        "avatar_url",
        type_=sa.String(500),
        existing_type=sa.Text,
        existing_nullable=True,
    )
    op.alter_column(
        "employee_profiles",
        "avatar_thumbnail_url",
        type_=sa.String(500),
        existing_type=sa.Text,
        existing_nullable=True,
    )
