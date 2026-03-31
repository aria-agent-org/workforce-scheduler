"""
Seed default data for a newly created tenant.

Called from admin.py create_tenant endpoint.
Creates: role definitions, attendance statuses, event types,
notification templates, and default settings.
"""

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.resource import RoleDefinition
from app.models.attendance import AttendanceStatusDefinition
from app.models.tenant import TenantSetting
from app.models.notification import EventTypeDefinition, NotificationTemplate


# ═══════════════════════════════════════════
# Default Role Definitions
# ═══════════════════════════════════════════

DEFAULT_ROLES = [
    {
        "name": "super_admin",
        "label": {"he": "מנהל מערכת", "en": "Super Admin"},
        "permissions": {
            "dashboard": ["read"],
            "scheduling": ["read", "write", "delete"],
            "attendance": ["read", "write"],
            "employees": ["read", "write", "delete"],
            "settings": ["read", "write"],
            "reports": ["read", "export"],
            "audit": ["read"],
            "admin": ["read", "write"],
        },
        "is_system": True,
    },
    {
        "name": "tenant_admin",
        "label": {"he": "מנהל ארגון", "en": "Tenant Admin"},
        "permissions": {
            "dashboard": ["read"],
            "scheduling": ["read", "write", "delete"],
            "attendance": ["read", "write"],
            "employees": ["read", "write", "delete"],
            "settings": ["read", "write"],
            "reports": ["read", "export"],
            "audit": ["read"],
        },
        "is_system": True,
    },
    {
        "name": "scheduler",
        "label": {"he": "משבץ", "en": "Scheduler"},
        "permissions": {
            "dashboard": ["read"],
            "scheduling": ["read", "write"],
            "attendance": ["read", "write"],
            "employees": ["read"],
            "reports": ["read"],
        },
        "is_system": False,
    },
    {
        "name": "viewer",
        "label": {"he": "צופה", "en": "Viewer"},
        "permissions": {
            "dashboard": ["read"],
            "scheduling": ["read"],
            "attendance": ["read"],
            "employees": ["read"],
            "reports": ["read"],
        },
        "is_system": False,
    },
    {
        "name": "soldier",
        "label": {"he": "חייל", "en": "Soldier"},
        "permissions": {
            "dashboard": ["read"],
            "my_schedule": ["read"],
            "my_profile": ["read", "write"],
            "my_swap": ["read", "write"],
        },
        "is_system": False,
    },
]


# ═══════════════════════════════════════════
# Default Attendance Statuses
# ═══════════════════════════════════════════

DEFAULT_STATUSES = [
    {"code": "present", "name": {"he": "נוכח", "en": "Present"}, "color": "#22c55e", "icon": "✅", "counts_as_present": True, "is_schedulable": True, "sort_order": 0},
    {"code": "home", "name": {"he": "בית", "en": "Home"}, "color": "#3b82f6", "icon": "🏠", "counts_as_present": False, "is_schedulable": True, "sort_order": 1},
    {"code": "sick", "name": {"he": "חולה", "en": "Sick"}, "color": "#ef4444", "icon": "🤒", "counts_as_present": False, "is_schedulable": True, "sort_order": 2},
    {"code": "vacation", "name": {"he": "חופשה", "en": "Vacation"}, "color": "#eab308", "icon": "🏖️", "counts_as_present": False, "is_schedulable": True, "sort_order": 3},
    {"code": "training", "name": {"he": "הדרכה", "en": "Training"}, "color": "#f97316", "icon": "📚", "counts_as_present": True, "is_schedulable": True, "sort_order": 4},
    {"code": "reserve", "name": {"he": "מילואים", "en": "Reserve"}, "color": "#a855f7", "icon": "🎖️", "counts_as_present": False, "is_schedulable": True, "sort_order": 5},
    {"code": "course", "name": {"he": "קורס", "en": "Course"}, "color": "#06b6d4", "icon": "🎓", "counts_as_present": False, "is_schedulable": True, "sort_order": 6},
]


# ═══════════════════════════════════════════
# Default Event Type Definitions
# ═══════════════════════════════════════════

DEFAULT_EVENT_TYPES = [
    {"code": "mission_assigned", "label": {"he": "שובץ למשימה", "en": "Mission Assigned"}},
    {"code": "mission_cancelled", "label": {"he": "משימה בוטלה", "en": "Mission Cancelled"}},
    {"code": "mission_updated", "label": {"he": "משימה עודכנה", "en": "Mission Updated"}},
    {"code": "swap_requested", "label": {"he": "בקשת החלפה", "en": "Swap Requested"}},
    {"code": "swap_approved", "label": {"he": "החלפה אושרה", "en": "Swap Approved"}},
    {"code": "swap_rejected", "label": {"he": "החלפה נדחתה", "en": "Swap Rejected"}},
    {"code": "schedule_published", "label": {"he": "לוח פורסם", "en": "Schedule Published"}},
    {"code": "reminder", "label": {"he": "תזכורת", "en": "Reminder"}},
    {"code": "general", "label": {"he": "הודעה כללית", "en": "General"}},
]


# ═══════════════════════════════════════════
# Default Notification Templates
# ═══════════════════════════════════════════

DEFAULT_TEMPLATES = [
    {
        "name": "שובץ למשימה — Push",
        "event_type_code": "mission_assigned",
        "channels": {
            "push": {
                "title": "שובצת למשימה",
                "body": "שובצת למשימה {{mission_name}} בתאריך {{date}} בשעה {{start_time}}",
            },
        },
    },
    {
        "name": "משימה בוטלה — Push",
        "event_type_code": "mission_cancelled",
        "channels": {
            "push": {
                "title": "משימה בוטלה",
                "body": "המשימה {{mission_name}} בתאריך {{date}} בוטלה",
            },
        },
    },
    {
        "name": "בקשת החלפה — Push",
        "event_type_code": "swap_requested",
        "channels": {
            "push": {
                "title": "בקשת החלפה חדשה",
                "body": "{{requester_name}} מבקש להחליף איתך משימה",
            },
        },
    },
    {
        "name": "תזכורת — Push",
        "event_type_code": "reminder",
        "channels": {
            "push": {
                "title": "תזכורת משימה",
                "body": "תזכורת: משימה {{mission_name}} מתחילה בעוד {{minutes}} דקות",
            },
        },
    },
]


# ═══════════════════════════════════════════
# Default Tenant Settings
# ═══════════════════════════════════════════

DEFAULT_SETTINGS = [
    {"key": "timezone", "value": "Asia/Jerusalem", "group": "general"},
    {"key": "language", "value": "he", "group": "general"},
    {"key": "date_format", "value": "DD/MM/YYYY", "group": "general"},
    {"key": "time_format", "value": "24h", "group": "general"},
    {"key": "min_rest_hours", "value": 8, "group": "scheduling"},
    {"key": "max_consecutive_missions", "value": 3, "group": "scheduling"},
    {"key": "auto_assign_enabled", "value": True, "group": "scheduling"},
    {"key": "notification_enabled", "value": True, "group": "notifications"},
    {"key": "reminder_minutes_before", "value": 60, "group": "notifications"},
]


async def seed_tenant_data(tenant_id: UUID, db: AsyncSession) -> dict:
    """
    Seed all default data for a newly created tenant.
    Returns a summary of what was created.
    """
    summary = {
        "roles": 0,
        "statuses": 0,
        "event_types": 0,
        "templates": 0,
        "settings": 0,
    }

    # 1. Role Definitions
    for role_data in DEFAULT_ROLES:
        existing = await db.execute(
            select(RoleDefinition).where(
                RoleDefinition.tenant_id == tenant_id,
                RoleDefinition.name == role_data["name"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        rd = RoleDefinition(
            tenant_id=tenant_id,
            name=role_data["name"],
            label=role_data["label"],
            permissions=role_data["permissions"],
            is_system=role_data["is_system"],
        )
        db.add(rd)
        summary["roles"] += 1

    # 2. Attendance Statuses
    for status_data in DEFAULT_STATUSES:
        existing = await db.execute(
            select(AttendanceStatusDefinition).where(
                AttendanceStatusDefinition.tenant_id == tenant_id,
                AttendanceStatusDefinition.code == status_data["code"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        st = AttendanceStatusDefinition(
            tenant_id=tenant_id,
            code=status_data["code"],
            name=status_data["name"],
            color=status_data["color"],
            icon=status_data["icon"],
            counts_as_present=status_data["counts_as_present"],
            is_schedulable=status_data["is_schedulable"],
            sort_order=status_data["sort_order"],
        )
        db.add(st)
        summary["statuses"] += 1

    # 3. Event Type Definitions
    for evt_data in DEFAULT_EVENT_TYPES:
        existing = await db.execute(
            select(EventTypeDefinition).where(
                EventTypeDefinition.tenant_id == tenant_id,
                EventTypeDefinition.code == evt_data["code"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        evt = EventTypeDefinition(
            tenant_id=tenant_id,
            code=evt_data["code"],
            label=evt_data["label"],
        )
        db.add(evt)
        summary["event_types"] += 1

    # 4. Notification Templates
    for tmpl_data in DEFAULT_TEMPLATES:
        existing = await db.execute(
            select(NotificationTemplate).where(
                NotificationTemplate.tenant_id == tenant_id,
                NotificationTemplate.event_type_code == tmpl_data["event_type_code"],
                NotificationTemplate.name == tmpl_data["name"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        tmpl = NotificationTemplate(
            tenant_id=tenant_id,
            name=tmpl_data["name"],
            event_type_code=tmpl_data["event_type_code"],
            channels=tmpl_data["channels"],
        )
        db.add(tmpl)
        summary["templates"] += 1

    # 5. Default Settings
    for setting_data in DEFAULT_SETTINGS:
        existing = await db.execute(
            select(TenantSetting).where(
                TenantSetting.tenant_id == tenant_id,
                TenantSetting.key == setting_data["key"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        ts = TenantSetting(
            tenant_id=tenant_id,
            key=setting_data["key"],
            value=setting_data["value"],
            group=setting_data["group"],
        )
        db.add(ts)
        summary["settings"] += 1

    await db.flush()
    return summary
