"""Initial schema — all tables.

Revision ID: 001_initial
Revises:
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── plans ──────────────────────────────────────────────────────
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("features", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── tenants ────────────────────────────────────────────────────
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("plans.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"])

    # ── tenant_settings ────────────────────────────────────────────
    op.create_table(
        "tenant_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", postgresql.JSONB, nullable=True),
        sa.Column("value_type", sa.String(20), nullable=False, server_default="string"),
        sa.Column("label", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("description", postgresql.JSONB, nullable=True),
        sa.Column("options", postgresql.JSONB, nullable=True),
        sa.Column("group", sa.String(50), nullable=False, server_default="general"),
        sa.Column("is_editable_by_tenant_admin", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── auth_method_configs (from tenant module) ──────────────────
    op.create_table(
        "auth_method_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("method", sa.String(50), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_required_as_second_factor", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("config", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "method", name="uq_auth_method_per_tenant"),
    )

    # ── role_definitions ───────────────────────────────────────────
    op.create_table(
        "role_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("label", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("permissions", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("ui_visibility", postgresql.JSONB, nullable=True),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_role_definitions_tenant_id", "role_definitions", ["tenant_id"])

    # ── work_roles ─────────────────────────────────────────────────
    op.create_table(
        "work_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", postgresql.JSONB, nullable=False),
        sa.Column("description", postgresql.JSONB, nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("is_resource_type", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_work_roles_tenant_id", "work_roles", ["tenant_id"])

    # ── employees ──────────────────────────────────────────────────
    op.create_table(
        "employees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_number", sa.String(50), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("preferred_language", sa.String(5), nullable=False, server_default="he"),
        sa.Column("notification_channels", postgresql.JSONB, nullable=True),
        sa.Column("whatsapp_session_expires_at", sa.String, nullable=True),
        sa.Column("whatsapp_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("telegram_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("custom_fields", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="present"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "employee_number", name="uq_employee_number_per_tenant"),
    )
    op.create_index("ix_employees_tenant_id", "employees", ["tenant_id"])

    # ── employee_profiles ──────────────────────────────────────────
    op.create_table(
        "employee_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("avatar_thumbnail_url", sa.String(500), nullable=True),
        sa.Column("bio", sa.Text, nullable=True),
        sa.Column("emergency_contact_name", sa.String(255), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── employee_field_definitions ─────────────────────────────────
    op.create_table(
        "employee_field_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column("label", postgresql.JSONB, nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False, server_default="text"),
        sa.Column("options", postgresql.JSONB, nullable=True),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("show_in_list", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_employee_field_definitions_tenant_id", "employee_field_definitions", ["tenant_id"])

    # ── employee_work_roles ────────────────────────────────────────
    op.create_table(
        "employee_work_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("work_role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("work_roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("employee_id", "work_role_id", name="uq_employee_work_role"),
    )

    # ── employee_preferences ───────────────────────────────────────
    op.create_table(
        "employee_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("partner_preferences", postgresql.JSONB, nullable=True),
        sa.Column("mission_type_preferences", postgresql.JSONB, nullable=True),
        sa.Column("time_slot_preferences", postgresql.JSONB, nullable=True),
        sa.Column("custom_preferences", postgresql.JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── employee_notification_preferences ──────────────────────────
    op.create_table(
        "employee_notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type_code", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("channel_overrides", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("employee_id", "event_type_code", name="uq_employee_event_pref"),
    )

    # ── users ──────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("role_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("role_definitions.id"), nullable=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("preferred_language", sa.String(5), nullable=False, server_default="he"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("two_factor_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("two_factor_secret", sa.String(255), nullable=True),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("employee_id", name="uq_user_employee_id"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ── user_sessions ──────────────────────────────────────────────
    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_token_hash", sa.String(255), nullable=False),
        sa.Column("device_info", postgresql.JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("auth_method", sa.String(50), nullable=True),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── user_totp ──────────────────────────────────────────────────
    op.create_table(
        "user_totp",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("secret", sa.String(255), nullable=False),
        sa.Column("backup_codes", postgresql.ARRAY(sa.String), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── user_webauthn_credentials ──────────────────────────────────
    op.create_table(
        "user_webauthn_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("credential_id", sa.LargeBinary, nullable=False, unique=True),
        sa.Column("public_key", sa.LargeBinary, nullable=False),
        sa.Column("sign_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("aaguid", sa.String(255), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("transports", postgresql.ARRAY(sa.String), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("backed_up", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── magic_link_tokens ──────────────────────────────────────────
    op.create_table(
        "magic_link_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_magic_link_tokens_token", "magic_link_tokens", ["token"])

    # ── user_sso_connections ───────────────────────────────────────
    op.create_table(
        "user_sso_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("provider_user_id", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── auth_methods_config (from user module) ─────────────────────
    op.create_table(
        "auth_methods_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("method", sa.String(50), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_required_as_second_factor", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("config", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── invitations ────────────────────────────────────────────────
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("token", sa.String(128), nullable=False, unique=True),
        sa.Column("role_definition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("role_definitions.id"), nullable=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("custom_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_invitations_token", "invitations", ["token"])

    # ── google_sheets_configs ──────────────────────────────────────
    op.create_table(
        "google_sheets_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_window_id", sa.String, nullable=True),
        sa.Column("spreadsheet_id", sa.String(255), nullable=False),
        sa.Column("sheet_name", sa.String(255), nullable=False),
        sa.Column("sync_direction", sa.String(20), nullable=False, server_default="bidirectional"),
        sa.Column("auto_sync_inbound", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("auto_sync_outbound", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("ask_before_push", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("column_mapping", postgresql.JSONB, nullable=True),
        sa.Column("status_code_mapping", postgresql.JSONB, nullable=True),
        sa.Column("conflict_notification_user_ids", postgresql.JSONB, nullable=True),
        sa.Column("last_sync_at", sa.String, nullable=True),
        sa.Column("last_sync_status", sa.String(30), nullable=True),
        sa.Column("credentials_secret_arn", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_google_sheets_configs_tenant_id", "google_sheets_configs", ["tenant_id"])

    # ── schedule_windows ───────────────────────────────────────────
    op.create_table(
        "schedule_windows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_windows.id"), nullable=True),
        sa.Column("google_sheets_config_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("google_sheets_configs.id"), nullable=True),
        sa.Column("settings_override", postgresql.JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_schedule_windows_tenant_id", "schedule_windows", ["tenant_id"])

    # ── schedule_window_employees ──────────────────────────────────
    op.create_table(
        "schedule_window_employees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("schedule_window_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("custom_rules_override", postgresql.JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("schedule_window_id", "employee_id", name="uq_window_employee"),
    )

    # ── mission_types ──────────────────────────────────────────────
    op.create_table(
        "mission_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", postgresql.JSONB, nullable=False),
        sa.Column("description", postgresql.JSONB, nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("duration_hours", sa.Numeric(5, 2), nullable=True),
        sa.Column("is_standby", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("standby_can_count_as_rest", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("required_slots", postgresql.JSONB, nullable=True),
        sa.Column("pre_mission_events", postgresql.JSONB, nullable=True),
        sa.Column("post_mission_rule", postgresql.JSONB, nullable=True),
        sa.Column("timeline_items", postgresql.JSONB, nullable=True),
        sa.Column("specific_rule_ids", postgresql.JSONB, nullable=True),
        sa.Column("notification_templates_override", postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mission_types_tenant_id", "mission_types", ["tenant_id"])

    # ── mission_templates ──────────────────────────────────────────
    op.create_table(
        "mission_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_window_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mission_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mission_types.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("recurrence", postgresql.JSONB, nullable=True),
        sa.Column("time_slots", postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mission_templates_tenant_id", "mission_templates", ["tenant_id"])

    # ── missions ───────────────────────────────────────────────────
    op.create_table(
        "missions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_window_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mission_type_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mission_types.id"), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mission_templates.id"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("is_activated", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("override_justification", sa.Text, nullable=True),
        sa.Column("resources_assigned", postgresql.JSONB, nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_missions_tenant_date", "missions", ["tenant_id", "date"])

    # ── mission_assignments ────────────────────────────────────────
    op.create_table(
        "mission_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("mission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("missions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("work_role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("work_roles.id"), nullable=False),
        sa.Column("slot_id", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="assigned"),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("conflicts_detected", postgresql.JSONB, nullable=True),
        sa.Column("override_approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("replaced_by_assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mission_assignments.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_assignments_employee", "mission_assignments", ["employee_id"])
    op.create_index("idx_assignments_mission", "mission_assignments", ["mission_id"])

    # ── swap_requests ──────────────────────────────────────────────
    op.create_table(
        "swap_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requester_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("requester_assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mission_assignments.id"), nullable=False),
        sa.Column("target_employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=True),
        sa.Column("target_assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("mission_assignments.id"), nullable=True),
        sa.Column("swap_type", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("validation_result", postgresql.JSONB, nullable=True),
        sa.Column("target_response", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("target_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("channel", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_swap_requests_tenant_id", "swap_requests", ["tenant_id"])

    # ── attendance_status_definitions ──────────────────────────────
    op.create_table(
        "attendance_status_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", postgresql.JSONB, nullable=False),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("is_schedulable", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("schedulable_from_time", sa.Time, nullable=True),
        sa.Column("schedulable_notes", postgresql.JSONB, nullable=True),
        sa.Column("triggers_rule_category", sa.String(50), nullable=True),
        sa.Column("counts_as_present", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", name="uq_attendance_status_code_per_tenant"),
    )
    op.create_index("ix_attendance_status_definitions_tenant_id", "attendance_status_definitions", ["tenant_id"])

    # ── attendance_schedule ────────────────────────────────────────
    op.create_table(
        "attendance_schedule",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_window_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("schedule_windows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("status_code", sa.String(50), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("google_sheets_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "employee_id", "date", name="uq_attendance_per_day"),
    )
    op.create_index("idx_attendance_tenant_date", "attendance_schedule", ["tenant_id", "date"])
    op.create_index("idx_attendance_employee_date", "attendance_schedule", ["employee_id", "date"])

    # ── attendance_sync_conflicts ──────────────────────────────────
    op.create_table(
        "attendance_sync_conflicts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("system_value", sa.String(50), nullable=False),
        sa.Column("sheets_value", sa.String(50), nullable=False),
        sa.Column("sheets_raw_value", sa.String(255), nullable=True),
        sa.Column("conflict_reason", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_attendance_sync_conflicts_tenant_id", "attendance_sync_conflicts", ["tenant_id"])

    # ── rule_definitions ───────────────────────────────────────────
    op.create_table(
        "rule_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", postgresql.JSONB, nullable=False),
        sa.Column("description", postgresql.JSONB, nullable=True),
        sa.Column("category", sa.String(50), nullable=False, server_default="general"),
        sa.Column("scope", sa.String(30), nullable=False, server_default="global"),
        sa.Column("scope_ref_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("condition_expression", postgresql.JSONB, nullable=False),
        sa.Column("action_expression", postgresql.JSONB, nullable=False),
        sa.Column("parameters", postgresql.JSONB, nullable=True),
        sa.Column("severity", sa.String(10), nullable=False, server_default="soft"),
        sa.Column("override_permission", sa.String(50), nullable=True),
        sa.Column("conflict_resolution_hint", postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_system_template", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_rules_tenant_scope", "rule_definitions", ["tenant_id", "scope"])

    # ── event_type_definitions ─────────────────────────────────────
    op.create_table(
        "event_type_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("label", postgresql.JSONB, nullable=False),
        sa.Column("available_variables", postgresql.JSONB, nullable=True),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", name="uq_event_type_code_per_tenant"),
    )
    op.create_index("ix_event_type_definitions_tenant_id", "event_type_definitions", ["tenant_id"])

    # ── notification_templates ─────────────────────────────────────
    op.create_table(
        "notification_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("event_type_code", sa.String(100), nullable=False),
        sa.Column("channels", postgresql.JSONB, nullable=False),
        sa.Column("send_offset_minutes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("conditions", postgresql.JSONB, nullable=True),
        sa.Column("require_whatsapp_session", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notification_templates_tenant_id", "notification_templates", ["tenant_id"])

    # ── notification_channel_configs ───────────────────────────────
    op.create_table(
        "notification_channel_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("provider_config", postgresql.JSONB, nullable=True),
        sa.Column("cost_per_message_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("monthly_budget_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("budget_alert_at_percent", sa.Integer, nullable=False, server_default="80"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "channel", name="uq_channel_config_per_tenant"),
    )

    # ── notification_logs ──────────────────────────────────────────
    op.create_table(
        "notification_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("event_type_code", sa.String(100), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("notification_templates.id"), nullable=True),
        sa.Column("body_sent", sa.Text, nullable=True),
        sa.Column("language_sent", sa.String(5), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_notif_logs_tenant_sent", "notification_logs", ["tenant_id", "sent_at"])

    # ── notification_locked_events ─────────────────────────────────
    op.create_table(
        "notification_locked_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type_code", sa.String(100), nullable=False),
        sa.Column("locked_channels", postgresql.ARRAY(sa.String), nullable=True),
        sa.Column("reason", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "event_type_code", name="uq_locked_event_per_tenant"),
    )

    # ── resources ──────────────────────────────────────────────────
    op.create_table(
        "resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", postgresql.JSONB, nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="equipment"),
        sa.Column("quantity_total", sa.Integer, nullable=False, server_default="1"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_resources_tenant_id", "resources", ["tenant_id"])

    # ── audit_logs ─────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("before_state", postgresql.JSONB, nullable=True),
        sa.Column("after_state", postgresql.JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("trace_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_audit_tenant_created", "audit_logs", ["tenant_id", "created_at"])

    # ── help_topics ────────────────────────────────────────────────
    op.create_table(
        "help_topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("topic_key", sa.String(100), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", postgresql.JSONB, nullable=False),
        sa.Column("content", postgresql.JSONB, nullable=False),
        sa.Column("examples", postgresql.JSONB, nullable=True),
        sa.Column("video_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── bot_configs ────────────────────────────────────────────────
    op.create_table(
        "bot_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(30), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("bot_name", sa.String(100), nullable=True),
        sa.Column("ai_mode_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("ai_system_prompt", sa.Text, nullable=True),
        sa.Column("welcome_message", postgresql.JSONB, nullable=True),
        sa.Column("fallback_message", postgresql.JSONB, nullable=True),
        sa.Column("allowed_actions", postgresql.JSONB, nullable=True),
        sa.Column("menu_structure", postgresql.JSONB, nullable=True),
        sa.Column("credentials_secret_arn", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_bot_configs_tenant_id", "bot_configs", ["tenant_id"])

    # ── bot_registration_tokens ────────────────────────────────────
    op.create_table(
        "bot_registration_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("token", sa.String(128), nullable=False, unique=True),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("platform", sa.String(30), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_bot_registration_tokens_token", "bot_registration_tokens", ["token"])

    # ── ai_usage_configs ───────────────────────────────────────────
    op.create_table(
        "ai_usage_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("limit_daily_messages", sa.Integer, nullable=True),
        sa.Column("limit_monthly_messages", sa.Integer, nullable=True),
        sa.Column("limit_total_messages", sa.Integer, nullable=True),
        sa.Column("on_limit_reached", sa.String(30), nullable=False, server_default="block"),
        sa.Column("alert_at_percent", sa.Integer, nullable=False, server_default="80"),
        sa.Column("reset_day_of_month", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── ai_usage_logs ──────────────────────────────────────────────
    op.create_table(
        "ai_usage_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("messages_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_used", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(10, 6), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ai_usage_logs_tenant_id", "ai_usage_logs", ["tenant_id"])

    # ── push_subscriptions ─────────────────────────────────────────
    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text, nullable=False, unique=True),
        sa.Column("p256dh", sa.String(255), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    tables = [
        "push_subscriptions", "ai_usage_logs", "ai_usage_configs",
        "bot_registration_tokens", "bot_configs",
        "help_topics", "audit_logs", "resources",
        "notification_locked_events", "notification_logs",
        "notification_channel_configs", "notification_templates",
        "event_type_definitions", "rule_definitions",
        "attendance_sync_conflicts", "attendance_schedule",
        "attendance_status_definitions", "swap_requests",
        "mission_assignments", "missions", "mission_templates",
        "mission_types", "schedule_window_employees", "schedule_windows",
        "google_sheets_configs", "invitations",
        "auth_methods_config", "user_sso_connections",
        "magic_link_tokens", "user_webauthn_credentials",
        "user_totp", "user_sessions", "users",
        "employee_notification_preferences", "employee_preferences",
        "employee_work_roles", "employee_field_definitions",
        "employee_profiles", "employees",
        "work_roles", "role_definitions",
        "auth_method_configs", "tenant_settings", "tenants", "plans",
    ]
    for t in tables:
        op.drop_table(t)
