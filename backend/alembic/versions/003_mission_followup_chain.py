"""Add parent_mission_id and post_mission_config to missions.

Revision ID: 003
Revises: 002_data_retention_and_window_version
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "003"
down_revision = "002_data_retention_and_window_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "missions",
        sa.Column("parent_mission_id", UUID(as_uuid=True), sa.ForeignKey("missions.id"), nullable=True),
    )
    op.add_column(
        "missions",
        sa.Column("post_mission_config", JSONB, nullable=True),
    )
    op.create_index(
        "idx_missions_parent",
        "missions",
        ["parent_mission_id"],
        postgresql_where=sa.text("parent_mission_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_missions_parent", table_name="missions")
    op.drop_column("missions", "post_mission_config")
    op.drop_column("missions", "parent_mission_id")
