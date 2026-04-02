"""Chat messages, outgoing webhooks, calendar sync.

Revision ID: 013_chat_webhooks
Revises: 012_gps_compliance
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "013_chat_webhooks"
down_revision = "012_gps_compliance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # In-app chat messages
    op.create_table(
        "chat_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("sender_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recipient_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),  # null = broadcast
        sa.Column("channel", sa.String(30), default="direct"),  # direct, broadcast, mission
        sa.Column("mission_id", UUID(as_uuid=True), sa.ForeignKey("missions.id"), nullable=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_messages_tenant", "chat_messages", ["tenant_id"])
    op.create_index("ix_chat_messages_recipient", "chat_messages", ["recipient_id"])
    op.create_index("ix_chat_messages_sender", "chat_messages", ["sender_id"])
    op.create_index("ix_chat_messages_created", "chat_messages", ["created_at"])

    # Outgoing webhooks config
    op.create_table(
        "outgoing_webhooks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("secret", sa.String(200), nullable=True),
        sa.Column("events", JSONB, nullable=False),  # ["mission.created", "swap.requested", ...]
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_count", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_outgoing_webhooks_tenant", "outgoing_webhooks", ["tenant_id"])

    # Webhook delivery log
    op.create_table(
        "webhook_deliveries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("webhook_id", UUID(as_uuid=True), sa.ForeignKey("outgoing_webhooks.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column("status_code", sa.Integer, nullable=True),
        sa.Column("response_body", sa.Text, nullable=True),
        sa.Column("success", sa.Boolean, default=False),
        sa.Column("attempt", sa.Integer, default=1),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_webhook_deliveries_webhook", "webhook_deliveries", ["webhook_id"])

    # Calendar sync preferences per employee
    op.create_table(
        "calendar_sync_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),  # google, outlook, ics
        sa.Column("access_token", sa.Text, nullable=True),
        sa.Column("refresh_token", sa.Text, nullable=True),
        sa.Column("calendar_id", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_calendar_sync_employee", "calendar_sync_configs", ["employee_id"], unique=True)


def downgrade() -> None:
    op.drop_table("calendar_sync_configs")
    op.drop_table("webhook_deliveries")
    op.drop_table("outgoing_webhooks")
    op.drop_table("chat_messages")
