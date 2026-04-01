"""Sprint 9: Add required_slots and notes columns to missions table.

Revision ID: 007_sprint9_mission_slots
Revises: 006_sprint5_features
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "007_sprint9_mission_slots"
down_revision = "006_sprint5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add required_slots and notes columns to missions (idempotent)
    conn = op.get_bind()
    # Check existing columns
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='missions' AND column_name IN ('required_slots','notes')"
    ))
    existing = {row[0] for row in result}
    if "required_slots" not in existing:
        op.add_column("missions", sa.Column("required_slots", JSONB, nullable=True))
    if "notes" not in existing:
        op.add_column("missions", sa.Column("notes", sa.Text, nullable=True))

    # Backfill required_slots from mission_types for existing missions
    op.execute("""
        UPDATE missions m
        SET required_slots = mt.required_slots
        FROM mission_types mt
        WHERE m.mission_type_id = mt.id
          AND mt.required_slots IS NOT NULL
          AND m.required_slots IS NULL
    """)


def downgrade() -> None:
    op.drop_column("missions", "notes")
    op.drop_column("missions", "required_slots")
