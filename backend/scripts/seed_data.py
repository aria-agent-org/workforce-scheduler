#!/usr/bin/env python3
"""
Seed data script for Shavtzak.
Creates demo tenant, users, employees, roles, statuses, rules, and mission types.

Usage:
    docker compose exec backend python scripts/seed_data.py
"""

import asyncio
import sys
import os
import uuid
from datetime import date, time, datetime, timedelta, timezone

# Add parent to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory, engine
from app.models.base import Base
from app.models.tenant import Plan, Tenant, TenantSetting
from app.models.resource import RoleDefinition, WorkRole, Resource
from app.models.user import User
from app.models.employee import Employee, EmployeeWorkRole
from app.models.attendance import AttendanceStatusDefinition
from app.models.rules import RuleDefinition
from app.models.scheduling import ScheduleWindow, MissionType, MissionTemplate
from app.models.notification import EventTypeDefinition
from app.models.help import HelpTopic
from app.services.auth_service import AuthService


async def seed() -> None:
    """Run all seed operations."""
    print("🌱 Starting seed...")

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("  ✅ Tables created")

    async with async_session_factory() as db:
        # Check if already seeded
        result = await db.execute(select(Tenant).limit(1))
        if result.scalar_one_or_none():
            print("  ⚠️  Data already exists, skipping seed")
            return

        # === Plans ===
        plan_free = Plan(
            name="free",
            features={
                "max_employees": 20,
                "ai_bot": False,
                "custom_branding": False,
                "excel_export": True,
                "pdf_export": False,
                "audit_log": False,
                "pwa_push": True,
                "telegram_bot": False,
                "whatsapp_bot": False,
                "google_sheets_sync": False,
                "max_schedule_windows": 2,
                "data_retention_days": 90,
            },
        )
        plan_pro = Plan(
            name="pro",
            features={
                "max_employees": 100,
                "ai_bot": True,
                "custom_branding": True,
                "excel_export": True,
                "pdf_export": True,
                "audit_log": True,
                "pwa_push": True,
                "telegram_bot": True,
                "whatsapp_bot": True,
                "google_sheets_sync": True,
                "max_schedule_windows": 10,
                "data_retention_days": 365,
            },
        )
        plan_enterprise = Plan(
            name="enterprise",
            features={
                "max_employees": 9999,
                "ai_bot": True,
                "custom_branding": True,
                "excel_export": True,
                "pdf_export": True,
                "audit_log": True,
                "pwa_push": True,
                "telegram_bot": True,
                "whatsapp_bot": True,
                "google_sheets_sync": True,
                "max_schedule_windows": 999,
                "data_retention_days": 730,
            },
        )
        db.add_all([plan_free, plan_pro, plan_enterprise])
        await db.flush()
        print("  ✅ Plans created")

        # === Demo Tenant ===
        tenant = Tenant(name="צוות דמו", slug="demo", is_active=True, plan_id=plan_pro.id)
        db.add(tenant)
        await db.flush()
        print(f"  ✅ Tenant created: {tenant.slug}")

        # === Tenant Settings (seed) ===
        settings = [
            ("timezone", "Asia/Jerusalem", "string", "general", {"he": "אזור זמן", "en": "Timezone"}),
            ("default_language", "he", "select", "general", {"he": "שפת ברירת מחדל", "en": "Default Language"}),
            ("default_min_rest_hours", 16, "int", "scheduling", {"he": "שעות מנוחה מינימליות", "en": "Minimum Rest Hours"}),
            ("default_max_work_hours", 8, "int", "scheduling", {"he": "שעות עבודה מקסימליות", "en": "Max Work Hours"}),
            ("branding_primary_color", "#2563eb", "color", "branding", {"he": "צבע ראשי", "en": "Primary Color"}),
            ("auto_scheduling_mode", False, "bool", "scheduling", {"he": "שיבוץ אוטומטי", "en": "Auto-Scheduling Mode"}),
            ("ai_bot_enabled", False, "bool", "ai", {"he": "בוט AI פעיל", "en": "AI Bot Enabled"}),
            ("ai_bot_name", "עוזר השיבוץ", "string", "ai", {"he": "שם הבוט", "en": "Bot Name"}),
            ("google_sheets_auto_sync_inbound", True, "bool", "integrations", {"he": "סנכרון אוטומטי מ-Sheets", "en": "Auto Sync from Sheets"}),
            ("google_sheets_ask_before_push", True, "bool", "integrations", {"he": "שאל לפני עדכון Sheets", "en": "Ask Before Push to Sheets"}),
        ]
        for key, value, vtype, group, label in settings:
            db.add(TenantSetting(
                tenant_id=tenant.id, key=key, value=value,
                value_type=vtype, group=group, label=label,
            ))
        await db.flush()
        print("  ✅ Tenant settings created")

        # === System Role Definitions ===
        role_super_admin = RoleDefinition(
            tenant_id=tenant.id, name="super_admin",
            label={"he": "מנהל מערכת", "en": "Super Admin"},
            permissions={"employees": ["read", "write", "delete"], "missions": ["read", "write", "approve", "auto_assign"],
                         "rules": ["read", "write"], "attendance": ["read", "write"], "settings": ["read", "write"],
                         "reports": ["read", "export"], "audit_log": ["read"], "override_soft": True, "override_hard": True},
            is_system=True,
        )
        role_tenant_admin = RoleDefinition(
            tenant_id=tenant.id, name="tenant_admin",
            label={"he": "מנהל טננט", "en": "Tenant Admin"},
            permissions={"employees": ["read", "write", "delete"], "missions": ["read", "write", "approve"],
                         "rules": ["read", "write"], "attendance": ["read", "write"], "settings": ["read", "write"],
                         "reports": ["read", "export"], "audit_log": ["read"], "override_soft": True, "override_hard": False},
            is_system=True,
        )
        role_scheduler = RoleDefinition(
            tenant_id=tenant.id, name="scheduler",
            label={"he": "משבץ", "en": "Scheduler"},
            permissions={"employees": ["read"], "missions": ["read", "write", "approve"],
                         "rules": ["read"], "attendance": ["read", "write"],
                         "reports": ["read"], "override_soft": True, "override_hard": False},
            is_system=True,
        )
        role_viewer = RoleDefinition(
            tenant_id=tenant.id, name="viewer",
            label={"he": "צופה", "en": "Viewer"},
            permissions={"employees": ["read"], "missions": ["read"],
                         "attendance": ["read"], "reports": ["read"]},
            is_system=True,
        )
        db.add_all([role_super_admin, role_tenant_admin, role_scheduler, role_viewer])
        await db.flush()
        print("  ✅ Role definitions created")

        # === Demo Users ===
        admin_user = User(
            tenant_id=tenant.id,
            email="admin@shavtzak.site",
            password_hash=AuthService.hash_password("Admin123!"),
            role_definition_id=role_tenant_admin.id,
            preferred_language="he",
            is_active=True,
        )
        scheduler_user = User(
            tenant_id=tenant.id,
            email="scheduler@shavtzak.site",
            password_hash=AuthService.hash_password("Scheduler123!"),
            role_definition_id=role_scheduler.id,
            preferred_language="he",
            is_active=True,
        )
        db.add_all([admin_user, scheduler_user])
        await db.flush()
        print("  ✅ Demo users created (admin@shavtzak.site / Admin123!)")

        # === Work Roles ===
        role_driver = WorkRole(
            tenant_id=tenant.id,
            name={"he": "נהג", "en": "Driver"},
            color="#3b82f6", sort_order=1,
        )
        role_team_lead = WorkRole(
            tenant_id=tenant.id,
            name={"he": "ראש צוות", "en": "Team Lead"},
            color="#10b981", sort_order=2,
        )
        role_worker = WorkRole(
            tenant_id=tenant.id,
            name={"he": "עובד כללי", "en": "General Worker"},
            color="#f59e0b", sort_order=3,
        )
        role_medic = WorkRole(
            tenant_id=tenant.id,
            name={"he": "חובש", "en": "Medic"},
            color="#ef4444", sort_order=4,
        )
        db.add_all([role_driver, role_team_lead, role_worker, role_medic])
        await db.flush()
        print("  ✅ Work roles created")

        # === Resources ===
        db.add_all([
            Resource(tenant_id=tenant.id, name={"he": "רכב 4x4", "en": "4x4 Vehicle"}, category="vehicle", quantity_total=3),
            Resource(tenant_id=tenant.id, name={"he": "רכב קל", "en": "Light Vehicle"}, category="vehicle", quantity_total=5),
            Resource(tenant_id=tenant.id, name={"he": "אלונקה", "en": "Stretcher"}, category="equipment", quantity_total=2),
        ])
        await db.flush()
        print("  ✅ Resources created")

        # === Attendance Status Definitions ===
        statuses = [
            ("present", {"he": "נוכח", "en": "Present"}, "#22c55e", "✅", True, True, 0, True),
            ("home", {"he": "בבית", "en": "Home"}, "#6b7280", "🏠", False, False, 1, False),
            ("going_home", {"he": "יוצא הביתה", "en": "Going Home"}, "#eab308", "🚪", False, False, 2, True),
            ("returning_home", {"he": "חוזר מהבית", "en": "Returning"}, "#3b82f6", "🔙", True, True, 3, True),
            ("sick", {"he": "חולה", "en": "Sick"}, "#ef4444", "🤒", False, False, 4, False),
            ("training", {"he": "הכשרה", "en": "Training"}, "#8b5cf6", "📚", False, True, 5, True),
            ("released", {"he": "שוחרר", "en": "Released"}, "#9ca3af", "🎖️", False, False, 6, False),
        ]
        for code, name, color, icon, is_sched, counts_present, order, is_sys in statuses:
            db.add(AttendanceStatusDefinition(
                tenant_id=tenant.id, code=code, name=name, color=color, icon=icon,
                is_schedulable=is_sched, counts_as_present=counts_present,
                sort_order=order, is_system=is_sys,
            ))
        await db.flush()
        print("  ✅ Attendance statuses created")

        # === Demo Employees ===
        employees_data = [
            ("001", "דוד כהן", "he"),
            ("002", "שרה לוי", "he"),
            ("003", "יוסי אברהם", "he"),
            ("004", "רחל מזרחי", "he"),
            ("005", "משה ביטון", "he"),
            ("006", "נועה שמעוני", "he"),
            ("007", "אלי פרץ", "he"),
            ("008", "מיכל דהן", "he"),
            ("009", "עמית גולן", "he"),
            ("010", "תמר אשכנזי", "he"),
            ("011", "אורי ברק", "he"),
            ("012", "הדס ירושלמי", "he"),
        ]
        created_employees = []
        for num, name, lang in employees_data:
            emp = Employee(
                tenant_id=tenant.id,
                employee_number=num,
                full_name=name,
                preferred_language=lang,
                status="present",
                is_active=True,
                notification_channels={
                    "active_channels": ["push"],
                    "primary_channel": "push",
                },
            )
            db.add(emp)
            created_employees.append(emp)
        await db.flush()

        # Assign work roles to employees
        role_assignments = [
            (0, role_driver.id, True), (0, role_worker.id, False),
            (1, role_team_lead.id, True),
            (2, role_driver.id, True),
            (3, role_worker.id, True), (3, role_medic.id, False),
            (4, role_worker.id, True),
            (5, role_driver.id, True),
            (6, role_team_lead.id, True),
            (7, role_worker.id, True),
            (8, role_driver.id, True), (8, role_team_lead.id, False),
            (9, role_worker.id, True),
            (10, role_medic.id, True),
            (11, role_worker.id, True),
        ]
        for emp_idx, wr_id, is_primary in role_assignments:
            db.add(EmployeeWorkRole(
                employee_id=created_employees[emp_idx].id,
                work_role_id=wr_id,
                is_primary=is_primary,
            ))
        await db.flush()
        print(f"  ✅ {len(created_employees)} employees created with work roles")

        # === Mission Types ===
        mt_patrol = MissionType(
            tenant_id=tenant.id,
            name={"he": "סיור", "en": "Patrol"},
            description={"he": "סיור שגרתי באזור", "en": "Routine area patrol"},
            color="#3b82f6", icon="🚗", duration_hours=4,
            is_standby=False, standby_can_count_as_rest=False,
            required_slots=[
                {"slot_id": "s1", "label": {"he": "נהג", "en": "Driver"}, "work_role_id": str(role_driver.id), "count": 1},
                {"slot_id": "s2", "label": {"he": "ראש צוות", "en": "Team Lead"}, "work_role_id": str(role_team_lead.id), "count": 1},
                {"slot_id": "s3", "label": {"he": "עובד", "en": "Worker"}, "work_role_id": str(role_worker.id), "count": 2},
            ],
            is_active=True,
        )
        mt_standby = MissionType(
            tenant_id=tenant.id,
            name={"he": "כוננות", "en": "Standby"},
            description={"he": "כוננות להקפצה", "en": "Standby for activation"},
            color="#eab308", icon="⏰", duration_hours=8,
            is_standby=True, standby_can_count_as_rest=True,
            required_slots=[
                {"slot_id": "s1", "label": {"he": "נהג", "en": "Driver"}, "work_role_id": str(role_driver.id), "count": 1},
                {"slot_id": "s2", "label": {"he": "עובד", "en": "Worker"}, "work_role_id": str(role_worker.id), "count": 2},
            ],
            is_active=True,
        )
        mt_transport = MissionType(
            tenant_id=tenant.id,
            name={"he": "ניוד ציוד", "en": "Equipment Transfer"},
            description={"he": "העברת ציוד בין נקודות", "en": "Equipment transfer between points"},
            color="#10b981", icon="📦", duration_hours=3,
            is_standby=False, standby_can_count_as_rest=False,
            required_slots=[
                {"slot_id": "s1", "label": {"he": "נהג", "en": "Driver"}, "work_role_id": str(role_driver.id), "count": 1},
                {"slot_id": "s2", "label": {"he": "עובד", "en": "Worker"}, "work_role_id": str(role_worker.id), "count": 1},
            ],
            is_active=True,
        )
        db.add_all([mt_patrol, mt_standby, mt_transport])
        await db.flush()
        print("  ✅ Mission types created")

        # === Rule Definitions ===
        rule_min_rest = RuleDefinition(
            tenant_id=tenant.id,
            name={"he": "מנוחה מינימלית", "en": "Minimum Rest"},
            description={"he": "לפחות 16 שעות מנוחה בין משימות", "en": "At least 16 hours rest between missions"},
            category="rest", scope="global",
            condition_expression={
                "operator": "AND",
                "conditions": [
                    {"field": "employee.hours_since_last_mission", "op": "less_than", "value": 16}
                ],
            },
            action_expression={
                "severity": "hard", "block": True, "score_delta": -50,
                "message_template": {
                    "he": "לעובד {employee.name} נותרו {hours} שעות מנוחה, נדרש מינימום 16",
                    "en": "Employee {employee.name} has {hours} rest hours, minimum 16 required",
                },
            },
            parameters={"min_rest_hours": 16},
            severity="hard", priority=100, is_active=True, is_system_template=True,
        )
        rule_max_work = RuleDefinition(
            tenant_id=tenant.id,
            name={"he": "שעות עבודה מקסימליות", "en": "Max Work Hours"},
            description={"he": "לא יותר מ-8 שעות עבודה ביום", "en": "No more than 8 work hours per day"},
            category="work_hours", scope="global",
            condition_expression={
                "operator": "AND",
                "conditions": [
                    {"field": "employee.total_work_hours_today", "op": "greater_than", "value": 8}
                ],
            },
            action_expression={
                "severity": "soft", "block": False, "score_delta": -30,
                "message_template": {
                    "he": "העובד {employee.name} חורג מ-8 שעות עבודה היום",
                    "en": "Employee {employee.name} exceeds 8 work hours today",
                },
            },
            parameters={"max_work_hours": 8},
            severity="soft", priority=90, is_active=True, is_system_template=True,
        )
        rule_night_rest = RuleDefinition(
            tenant_id=tenant.id,
            name={"he": "מנוחה אחרי לילה", "en": "Rest After Night"},
            description={"he": "אחרי משימת לילה, לא לשבץ בוקר למחרת", "en": "After night mission, don't schedule morning next day"},
            category="rest", scope="global",
            condition_expression={
                "operator": "AND",
                "conditions": [
                    {"field": "employee.last_mission_was_night", "op": "is_true", "value": None},
                    {"field": "mission.start_hour", "op": "less_than", "value": 12},
                ],
            },
            action_expression={
                "severity": "hard", "block": True, "score_delta": -40,
                "message_template": {
                    "he": "העובד {employee.name} עשה לילה ולא יכול בוקר",
                    "en": "Employee {employee.name} had night shift, cannot do morning",
                },
            },
            parameters={},
            severity="hard", priority=95, is_active=True, is_system_template=True,
        )
        db.add_all([rule_min_rest, rule_max_work, rule_night_rest])
        await db.flush()
        print("  ✅ Rule definitions created")

        # === Schedule Window ===
        window = ScheduleWindow(
            tenant_id=tenant.id,
            name="אפריל 2026",
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
            status="active",
        )
        db.add(window)
        await db.flush()
        print("  ✅ Schedule window created")

        # === Event Type Definitions ===
        event_types = [
            ("mission_assigned", {"he": "שובצת למשימה", "en": "Mission Assigned"}, True),
            ("mission_updated", {"he": "שיבוץ עודכן", "en": "Mission Updated"}, True),
            ("mission_cancelled", {"he": "משימה בוטלה", "en": "Mission Cancelled"}, True),
            ("mission_reminder", {"he": "תזכורת משימה", "en": "Mission Reminder"}, True),
            ("swap_requested", {"he": "בקשת החלפה", "en": "Swap Requested"}, True),
            ("swap_approved", {"he": "החלפה אושרה", "en": "Swap Approved"}, True),
            ("swap_rejected", {"he": "החלפה נדחתה", "en": "Swap Rejected"}, True),
            ("schedule_published", {"he": "לוח פורסם", "en": "Schedule Published"}, True),
            ("sheets_conflict_detected", {"he": "התנגשות Sheets", "en": "Sheets Conflict"}, True),
        ]
        for code, label, is_sys in event_types:
            db.add(EventTypeDefinition(
                tenant_id=tenant.id, code=code, label=label, is_system=is_sys,
            ))
        await db.flush()
        print("  ✅ Event types created")

        # === Help Topics ===
        db.add_all([
            HelpTopic(
                topic_key="rules_builder",
                title={"he": "בונה חוקים", "en": "Rules Builder"},
                content={"he": "בונה החוקים מאפשר ליצור חוקי שיבוץ מותאמים אישית. בחרו תנאי, אופרטור וערך.", "en": "The rules builder lets you create custom scheduling rules. Choose a condition, operator, and value."},
            ),
            HelpTopic(
                topic_key="mission_types",
                title={"he": "סוגי משימות", "en": "Mission Types"},
                content={"he": "סוגי משימות מגדירים את המבנה של כל משימה — תפקידים נדרשים, משך, ואירועים.", "en": "Mission types define the structure of each mission — required roles, duration, and events."},
            ),
            HelpTopic(
                topic_key="schedule_windows",
                title={"he": "לוחות עבודה", "en": "Schedule Windows"},
                content={"he": "לוח עבודה הוא תקופת זמן שבה מנהלים שיבוצים — למשל מאי-יולי 2026.", "en": "A schedule window is a time period for managing assignments — e.g., May-July 2026."},
            ),
        ])
        await db.flush()
        print("  ✅ Help topics created")

        await db.commit()
        print("\n🎉 Seed completed successfully!")
        print("   Login: admin@shavtzak.site / Admin123!")
        print("   Login: scheduler@shavtzak.site / Scheduler123!")


if __name__ == "__main__":
    asyncio.run(seed())
