"""GPS check-in table and compliance rules.

Revision ID: 012_gps_compliance
Revises: 011_integration_config
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "012_gps_compliance"
down_revision = "011_integration_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # GPS Check-in/Check-out table
    op.create_table(
        "gps_checkins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("mission_id", UUID(as_uuid=True), sa.ForeignKey("missions.id"), nullable=True),
        sa.Column("check_type", sa.String(10), nullable=False),  # 'in' or 'out'
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("accuracy_meters", sa.Float, nullable=True),
        sa.Column("is_within_geofence", sa.Boolean, default=False),
        sa.Column("distance_from_target_m", sa.Float, nullable=True),
        sa.Column("device_info", sa.Text, nullable=True),
        sa.Column("photo_url", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_gps_checkins_tenant", "gps_checkins", ["tenant_id"])
    op.create_index("ix_gps_checkins_employee", "gps_checkins", ["employee_id"])
    op.create_index("ix_gps_checkins_mission", "gps_checkins", ["mission_id"])
    op.create_index("ix_gps_checkins_created", "gps_checkins", ["created_at"])

    # Location geofences for missions/bases
    op.create_table(
        "locations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("geofence_radius_m", sa.Integer, default=200),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_locations_tenant", "locations", ["tenant_id"])

    # Compliance rules table
    op.create_table(
        "compliance_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=True),  # null = system-wide
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("rule_type", sa.String(50), nullable=False),  # rest_between_shifts, max_weekly_hours, max_consecutive_days, etc.
        sa.Column("parameters", JSONB, nullable=False),  # e.g. {"min_hours": 8, "max_hours": 42}
        sa.Column("severity", sa.String(20), default="warning"),  # warning, error, info
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_compliance_rules_tenant", "compliance_rules", ["tenant_id"])

    # Compliance violations log
    op.create_table(
        "compliance_violations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("rule_id", UUID(as_uuid=True), sa.ForeignKey("compliance_rules.id"), nullable=False),
        sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("mission_id", UUID(as_uuid=True), sa.ForeignKey("missions.id"), nullable=True),
        sa.Column("violation_type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("resolved", sa.Boolean, default=False),
        sa.Column("resolved_by", UUID(as_uuid=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_compliance_violations_tenant", "compliance_violations", ["tenant_id"])
    op.create_index("ix_compliance_violations_employee", "compliance_violations", ["employee_id"])

    # Notification templates — make editable per tenant
    # Already exists as notification_templates, add more columns
    try:
        op.add_column("notification_templates", sa.Column("channel", sa.String(30), nullable=True))
        op.add_column("notification_templates", sa.Column("subject_template", sa.Text, nullable=True))
        op.add_column("notification_templates", sa.Column("variables_schema", JSONB, nullable=True))
    except Exception:
        pass  # columns might already exist


def downgrade() -> None:
    op.drop_table("compliance_violations")
    op.drop_table("compliance_rules")
    op.drop_table("locations")
    op.drop_table("gps_checkins")
    try:
        op.drop_column("notification_templates", "channel")
        op.drop_column("notification_templates", "subject_template")
        op.drop_column("notification_templates", "variables_schema")
    except Exception:
        pass
