"""Sprint 5: tenant features, communication config, import wizard, per-board rules.

Revision ID: 006_sprint5
Revises: 005_sprint3_fixes
Create Date: 2026-03-31 13:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

revision = "006_sprint5"
down_revision = "005_sprint3_fixes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Tenant features JSONB ──
    op.add_column("tenants", sa.Column("features", JSONB, nullable=True, server_default="{}"))
    # ── Custom domain / branding per tenant ──
    op.add_column("tenants", sa.Column("custom_domain", sa.String(255), nullable=True))
    op.add_column("tenants", sa.Column("branding", JSONB, nullable=True, server_default="{}"))

    # ── Communication channel configs ──
    op.create_table(
        "communication_channel_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(50), nullable=False),  # whatsapp, telegram, email, sms
        sa.Column("provider", sa.String(50), nullable=True),   # twilio, sns, ses, smtp, business_api, qr_session
        sa.Column("is_enabled", sa.Boolean, default=False, nullable=False),
        sa.Column("config", JSONB, nullable=True),
        sa.Column("verified", sa.Boolean, default=False, nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "channel", name="uq_channel_config_per_tenant"),
    )

    # ── User import batches ──
    op.create_table(
        "user_import_batches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(30), default="pending", nullable=False),
        sa.Column("source", sa.String(30), nullable=False),  # csv, excel, manual
        sa.Column("total_rows", sa.Integer, default=0),
        sa.Column("processed_rows", sa.Integer, default=0),
        sa.Column("created_roles", JSONB, nullable=True),
        sa.Column("conflicts", JSONB, nullable=True),
        sa.Column("invitation_method", sa.String(50), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "user_import_rows",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("user_import_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row_number", sa.Integer, nullable=False),
        sa.Column("raw_data", JSONB, nullable=True),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("roles", JSONB, nullable=True),
        sa.Column("status", sa.String(30), default="pending", nullable=False),  # pending, valid, invalid, duplicate, imported
        sa.Column("validation_errors", JSONB, nullable=True),
        sa.Column("conflict_type", sa.String(30), nullable=True),  # phone_exists, email_exists
        sa.Column("conflict_employee_id", UUID(as_uuid=True), nullable=True),
        sa.Column("resolution", sa.String(30), nullable=True),  # skip, update, create
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )

    # ── Per-board rules override ──
    op.add_column("schedule_windows", sa.Column("rules_override", JSONB, nullable=True))

    # ── Phone/email on Employee for matching ──
    op.add_column("employees", sa.Column("phone", sa.String(30), nullable=True))
    op.add_column("employees", sa.Column("email", sa.String(320), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "email")
    op.drop_column("employees", "phone")
    op.drop_column("schedule_windows", "rules_override")
    op.drop_table("user_import_rows")
    op.drop_table("user_import_batches")
    op.drop_table("communication_channel_configs")
    op.drop_column("tenants", "branding")
    op.drop_column("tenants", "custom_domain")
    op.drop_column("tenants", "features")
