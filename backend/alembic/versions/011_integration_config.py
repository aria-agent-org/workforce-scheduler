"""Integration config table.

Revision ID: 011_integration_config
Revises: 010_webauthn_table
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "011_integration_config"
down_revision = "010_webauthn_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "integration_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(100), unique=True, nullable=False),
        sa.Column("value", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_by", UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_integration_configs_key", "integration_configs", ["key"])
    op.create_index("ix_integration_configs_category", "integration_configs", ["category"])


def downgrade() -> None:
    op.drop_table("integration_configs")
