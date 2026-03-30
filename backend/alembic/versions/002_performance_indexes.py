"""Performance indexes — GIN on JSONB, composite & partial indexes.

Revision ID: 002_performance_indexes
Revises: 001_initial
Create Date: 2026-03-30
"""

from alembic import op

revision = "002_performance_indexes"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── GIN indexes on JSONB columns ──────────────────────────────
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_employees_custom_fields_gin "
        "ON employees USING GIN (custom_fields jsonb_path_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_missions_resources_assigned_gin "
        "ON missions USING GIN (resources_assigned jsonb_path_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_mission_types_required_slots_gin "
        "ON mission_types USING GIN (required_slots jsonb_path_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rule_definitions_condition_gin "
        "ON rule_definitions USING GIN (condition_expression jsonb_path_ops)"
    )

    # ── Composite indexes for common query patterns ───────────────
    # Missions by tenant + date (scheduling views)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_missions_tenant_date "
        "ON missions (tenant_id, date, start_time)"
    )
    # Missions by window + status (window management)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_missions_window_status "
        "ON missions (schedule_window_id, status)"
    )
    # Assignments by employee + date (conflict checks, eligible soldiers)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_assignments_employee_mission "
        "ON mission_assignments (employee_id, mission_id)"
    )
    # Employees by tenant + status (list/filter views)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_employees_tenant_status "
        "ON employees (tenant_id, status) WHERE is_active = true"
    )
    # Audit logs by tenant + timestamp (audit trail queries)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_tenant_created "
        "ON audit_logs (tenant_id, created_at DESC)"
    )
    # Rules by tenant + active + priority (rule evaluation)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rules_tenant_active_priority "
        "ON rule_definitions (tenant_id, priority DESC) WHERE is_active = true"
    )

    # ── Partial indexes for active records ────────────────────────
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_missions_active "
        "ON missions (tenant_id, date) "
        "WHERE status NOT IN ('cancelled', 'archived')"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_mission_types_active "
        "ON mission_types (tenant_id) WHERE is_active = true"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_swap_requests_pending "
        "ON swap_requests (tenant_id, created_at DESC) WHERE status = 'pending'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_assignments_not_replaced "
        "ON mission_assignments (mission_id, employee_id) WHERE status != 'replaced'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_employees_custom_fields_gin")
    op.execute("DROP INDEX IF EXISTS ix_missions_resources_assigned_gin")
    op.execute("DROP INDEX IF EXISTS ix_mission_types_required_slots_gin")
    op.execute("DROP INDEX IF EXISTS ix_rule_definitions_condition_gin")
    op.execute("DROP INDEX IF EXISTS ix_missions_tenant_date")
    op.execute("DROP INDEX IF EXISTS ix_missions_window_status")
    op.execute("DROP INDEX IF EXISTS ix_assignments_employee_mission")
    op.execute("DROP INDEX IF EXISTS ix_employees_tenant_status")
    op.execute("DROP INDEX IF EXISTS ix_audit_tenant_created")
    op.execute("DROP INDEX IF EXISTS ix_rules_tenant_active_priority")
    op.execute("DROP INDEX IF EXISTS ix_missions_active")
    op.execute("DROP INDEX IF EXISTS ix_mission_types_active")
    op.execute("DROP INDEX IF EXISTS ix_swap_requests_pending")
    op.execute("DROP INDEX IF EXISTS ix_assignments_not_replaced")
