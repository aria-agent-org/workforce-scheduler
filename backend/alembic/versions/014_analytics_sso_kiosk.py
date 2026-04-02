"""Analytics, SSO, Kiosk mode.

Revision ID: 014_analytics_sso_kiosk
Revises: 013_chat_webhooks
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "014_analytics_sso_kiosk"
down_revision = "013_chat_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SSO provider config per tenant
    op.create_table(
        "sso_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),  # google, saml, azure_ad
        sa.Column("client_id", sa.String(500), nullable=True),
        sa.Column("client_secret", sa.Text, nullable=True),
        sa.Column("metadata_url", sa.Text, nullable=True),  # SAML metadata URL
        sa.Column("domain_hint", sa.String(200), nullable=True),
        sa.Column("auto_provision", sa.Boolean, default=False),
        sa.Column("allow_password_login", sa.Boolean, default=True),
        sa.Column("is_active", sa.Boolean, default=False),
        sa.Column("config", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sso_configs_tenant", "sso_configs", ["tenant_id"])

    # Kiosk sessions (tablet check-in)
    op.create_table(
        "kiosk_sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("pin_code", sa.String(10), nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("last_heartbeat", sa.DateTime(timezone=True), nullable=True),
        sa.Column("config", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Add location_id to missions
    try:
        op.add_column("missions", sa.Column("location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True))
    except Exception:
        pass


def downgrade() -> None:
    op.drop_table("kiosk_sessions")
    op.drop_table("sso_configs")
    try:
        op.drop_column("missions", "location_id")
    except Exception:
        pass
