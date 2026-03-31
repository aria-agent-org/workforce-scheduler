#!/usr/bin/env python3
"""
Extended seed data for Shavtzak — Quality Improvement Loop.
Adds 50 soldiers, 5 mission types, 3 schedule windows, 100+ missions, varied attendance, swap requests.

Usage:
    docker compose exec backend python scripts/seed_extended.py
"""

import asyncio
import sys
import os
import random
from datetime import date, time, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, func

from app.database import async_session_factory
from app.models.tenant import Tenant
from app.models.resource import WorkRole
from app.models.user import User
from app.models.employee import Employee, EmployeeWorkRole, EmployeePreference
from app.models.attendance import AttendanceSchedule
from app.models.scheduling import (
    ScheduleWindow, ScheduleWindowEmployee, MissionType, Mission, MissionAssignment, SwapRequest,
)


HEBREW_FIRST_NAMES = [
    "אביב", "אדם", "אהרון", "אור", "אורי", "איתי", "אלון", "אמיר", "ארז", "בן",
    "גיל", "גלעד", "דוד", "דני", "הדר", "הלל", "זיו", "חיים", "טל", "ידין",
    "יהונתן", "יוגב", "יונתן", "יעקב", "ירון", "לירן", "מאור", "מיכאל", "נדב", "נועם",
    "ניר", "סהר", "עדי", "עמית", "פלג", "צחי", "קובי", "רועי", "רז", "שגיא",
    "שחר", "שי", "שמעון", "תומר", "ליאור", "עידו", "מתן", "עופר", "ניסים", "רפאל",
    "לינוי", "נועה", "מיכל", "שרה", "רחל", "תמר", "הדס", "יעל", "מורן", "דנה",
]

HEBREW_LAST_NAMES = [
    "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "דהן", "שמעוני", "גולן", "אשכנזי",
    "ברק", "ירושלמי", "חדד", "עזרא", "סויסה", "אוחיון", "מלכה", "שלום", "בן דוד", "מור",
    "אלוני", "שפירא", "גבאי", "סולומון", "חסון", "נחמיאס", "חזן", "שטרן", "רוזנברג", "קפלן",
]

STATUSES = ["present", "present", "present", "present", "home", "home", "sick", "training", "returning_home"]


async def seed_extended() -> None:
    print("🌱 Starting extended seed...")

    async with async_session_factory() as db:
        # Get existing tenant
        result = await db.execute(select(Tenant).where(Tenant.slug == "demo"))
        tenant = result.scalar_one_or_none()
        if not tenant:
            print("  ❌ Demo tenant not found. Run seed_data.py first.")
            return

        # Get admin user
        admin_result = await db.execute(
            select(User).where(User.email == "admin@shavtzak.site")
        )
        admin_user = admin_result.scalar_one_or_none()
        if not admin_user:
            print("  ❌ Admin user not found")
            return

        # Get existing work roles
        roles_result = await db.execute(
            select(WorkRole).where(WorkRole.tenant_id == tenant.id)
        )
        work_roles = list(roles_result.scalars().all())
        if not work_roles:
            print("  ❌ No work roles found")
            return

        role_map = {}
        for wr in work_roles:
            name_he = wr.name.get("he", "") if isinstance(wr.name, dict) else str(wr.name)
            role_map[name_he] = wr
        print(f"  📋 Found roles: {list(role_map.keys())}")

        # Check if extended seed already run
        emp_count = (await db.execute(
            select(func.count(Employee.id)).where(Employee.tenant_id == tenant.id)
        )).scalar() or 0
        if emp_count >= 50:
            print(f"  ⚠️  Already {emp_count} employees. Skipping employee creation.")
        else:
            # === CREATE 50 SOLDIERS ===
            print("  📋 Creating soldiers...")
            existing_numbers = set()
            existing_result = await db.execute(
                select(Employee.employee_number).where(Employee.tenant_id == tenant.id)
            )
            for row in existing_result.all():
                existing_numbers.add(row[0])

            new_employees = []
            used_names = set()
            emp_number = 13  # Start after existing 12

            while len(new_employees) < 50 - emp_count:
                first = random.choice(HEBREW_FIRST_NAMES)
                last = random.choice(HEBREW_LAST_NAMES)
                full_name = f"{first} {last}"
                if full_name in used_names:
                    continue
                used_names.add(full_name)

                num = f"{emp_number:03d}"
                while num in existing_numbers:
                    emp_number += 1
                    num = f"{emp_number:03d}"

                status = random.choice(STATUSES)
                emp = Employee(
                    tenant_id=tenant.id,
                    employee_number=num,
                    full_name=full_name,
                    preferred_language="he",
                    status=status,
                    is_active=True,
                    notification_channels={
                        "active_channels": ["push"],
                        "primary_channel": "push",
                    },
                )
                db.add(emp)
                new_employees.append(emp)
                emp_number += 1

            await db.flush()
            print(f"  ✅ Created {len(new_employees)} new employees")

            # Assign work roles randomly
            for emp in new_employees:
                # Pick 1-2 roles
                num_roles = random.choice([1, 1, 1, 2])
                selected_roles = random.sample(work_roles, min(num_roles, len(work_roles)))
                for i, wr in enumerate(selected_roles):
                    db.add(EmployeeWorkRole(
                        employee_id=emp.id,
                        work_role_id=wr.id,
                        is_primary=(i == 0),
                    ))
            await db.flush()
            print("  ✅ Work roles assigned")

            # Add preferences for some
            for emp in random.sample(new_employees, min(15, len(new_employees))):
                pref = EmployeePreference(
                    employee_id=emp.id,
                    time_slot_preferences=[
                        {"slot_key": random.choice(["morning", "afternoon", "night"]),
                         "preference": random.choice(["prefer", "avoid"])}
                    ],
                    notes=random.choice(["מעדיף בוקר", "לא אוהב לילות", "גמיש", ""]),
                )
                db.add(pref)
            await db.flush()
            print("  ✅ Preferences created")

        # === CREATE 5 MISSION TYPES (if not enough) ===
        mt_count = (await db.execute(
            select(func.count(MissionType.id)).where(MissionType.tenant_id == tenant.id)
        )).scalar() or 0

        new_mission_types = []
        if mt_count < 5:
            extra_types = [
                {
                    "name": {"he": "שמירה", "en": "Guard Duty"},
                    "description": {"he": "משמרת שמירה בעמדה", "en": "Guard duty at position"},
                    "color": "#ef4444", "icon": "🛡️", "duration_hours": 6,
                    "is_standby": False, "standby_can_count_as_rest": False,
                    "required_slots": [
                        {"slot_id": "s1", "label": {"he": "שומר 1", "en": "Guard 1"}, "work_role_id": None, "count": 1},
                        {"slot_id": "s2", "label": {"he": "שומר 2", "en": "Guard 2"}, "work_role_id": None, "count": 1},
                    ],
                },
                {
                    "name": {"he": "אבטחת מסלול", "en": "Route Security"},
                    "description": {"he": "ליווי ואבטחת מסלול תנועה", "en": "Escort and route security"},
                    "color": "#8b5cf6", "icon": "🚔", "duration_hours": 5,
                    "is_standby": False, "standby_can_count_as_rest": False,
                    "required_slots": [
                        {"slot_id": "s1", "label": {"he": "נהג", "en": "Driver"}, "work_role_id": None, "count": 1},
                        {"slot_id": "s2", "label": {"he": "מאבטח", "en": "Security"}, "work_role_id": None, "count": 2},
                    ],
                },
            ]

            # Fill required_slots work_role_ids with actual role IDs
            all_role_ids = [str(wr.id) for wr in work_roles]
            for mt_data in extra_types:
                if mt_count >= 5:
                    break
                for slot in mt_data["required_slots"]:
                    if slot["work_role_id"] is None:
                        slot["work_role_id"] = random.choice(all_role_ids)

                mt = MissionType(
                    tenant_id=tenant.id,
                    name=mt_data["name"],
                    description=mt_data["description"],
                    color=mt_data["color"],
                    icon=mt_data["icon"],
                    duration_hours=mt_data["duration_hours"],
                    is_standby=mt_data["is_standby"],
                    standby_can_count_as_rest=mt_data["standby_can_count_as_rest"],
                    required_slots=mt_data["required_slots"],
                    is_active=True,
                )
                db.add(mt)
                new_mission_types.append(mt)
                mt_count += 1

            await db.flush()
            print(f"  ✅ Created {len(new_mission_types)} additional mission types")

        # Get all mission types
        all_mt_result = await db.execute(
            select(MissionType).where(MissionType.tenant_id == tenant.id, MissionType.is_active.is_(True))
        )
        all_mission_types = list(all_mt_result.scalars().all())

        # === CREATE 3 SCHEDULE WINDOWS ===
        date.today()

        windows_to_create = [
            {"name": "מרץ 2026 (עבר)", "start": date(2026, 3, 1), "end": date(2026, 3, 31), "status": "archived"},
            {"name": "אפריל 2026 (נוכחי)", "start": date(2026, 3, 25), "end": date(2026, 4, 30), "status": "active"},
            {"name": "מאי 2026 (עתידי)", "start": date(2026, 5, 1), "end": date(2026, 5, 31), "status": "draft"},
        ]

        # Check existing windows
        existing_windows_result = await db.execute(
            select(ScheduleWindow).where(ScheduleWindow.tenant_id == tenant.id)
        )
        existing_windows = list(existing_windows_result.scalars().all())
        existing_window_names = {w.name for w in existing_windows}

        created_windows = []
        for w_data in windows_to_create:
            if w_data["name"] in existing_window_names:
                # Find existing
                for ew in existing_windows:
                    if ew.name == w_data["name"]:
                        created_windows.append(ew)
                        break
                continue
            window = ScheduleWindow(
                tenant_id=tenant.id,
                name=w_data["name"],
                start_date=w_data["start"],
                end_date=w_data["end"],
                status=w_data["status"],
            )
            db.add(window)
            created_windows.append(window)

        # Also include existing "אפריל 2026" if it exists
        for ew in existing_windows:
            if ew not in created_windows:
                created_windows.append(ew)

        await db.flush()
        print(f"  ✅ {len(created_windows)} schedule windows ready")

        # Get all employees for assignments
        all_emp_result = await db.execute(
            select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True))
        )
        all_employees = list(all_emp_result.scalars().all())

        # Add employees to active/current window
        current_window = None
        for w in created_windows:
            if w.status == "active":
                current_window = w
                break
        if not current_window and created_windows:
            current_window = created_windows[0]

        if current_window:
            # Check existing employees in window
            existing_swe = await db.execute(
                select(ScheduleWindowEmployee.employee_id).where(
                    ScheduleWindowEmployee.schedule_window_id == current_window.id
                )
            )
            existing_emp_ids = {row[0] for row in existing_swe.all()}

            added = 0
            for emp in all_employees:
                if emp.id not in existing_emp_ids:
                    db.add(ScheduleWindowEmployee(
                        schedule_window_id=current_window.id,
                        employee_id=emp.id,
                    ))
                    added += 1
            await db.flush()
            print(f"  ✅ {added} employees added to current window")

        # === SET VARIED ATTENDANCE ===
        # Commit what we have so far before attempting attendance (which may have conflicts)
        await db.commit()
        print("  ✅ Committed employees, mission types, windows")

    # Attendance in a separate session to avoid transaction rollback issues
    async with async_session_factory() as db:
        result = await db.execute(select(Tenant).where(Tenant.slug == "demo"))
        tenant = result.scalar_one_or_none()
        admin_result = await db.execute(select(User).where(User.email == "admin@shavtzak.site"))
        admin_user = admin_result.scalar_one_or_none()

        # Find current window
        windows_result = await db.execute(
            select(ScheduleWindow).where(ScheduleWindow.tenant_id == tenant.id, ScheduleWindow.status == "active")
        )
        current_window = None
        for w in windows_result.scalars().all():
            current_window = w
            break

        all_emp_result = await db.execute(
            select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True))
        )
        all_employees = list(all_emp_result.scalars().all())

        if current_window:
            att_count = (await db.execute(
                select(func.count(AttendanceSchedule.id)).where(
                    AttendanceSchedule.tenant_id == tenant.id,
                    AttendanceSchedule.schedule_window_id == current_window.id,
                )
            )).scalar() or 0

            if att_count < 100:
                # Get existing attendance to avoid duplicates (unique on tenant_id + employee_id + date)
                existing_att = await db.execute(
                    select(AttendanceSchedule.employee_id, AttendanceSchedule.date).where(
                        AttendanceSchedule.tenant_id == tenant.id,
                    )
                )
                existing_keys = {(row[0], row[1]) for row in existing_att.all()}

                att_start = current_window.start_date
                att_end = min(current_window.end_date, att_start + timedelta(days=10))
                att_statuses = ["present", "present", "present", "home", "home", "sick", "training"]
                att_created = 0

                current_date = att_start
                while current_date <= att_end:
                    for emp in all_employees:
                        if (emp.id, current_date) in existing_keys:
                            continue
                        if random.random() < 0.7:
                            status = random.choice(att_statuses)
                            db.add(AttendanceSchedule(
                                tenant_id=tenant.id,
                                schedule_window_id=current_window.id,
                                employee_id=emp.id,
                                date=current_date,
                                status_code=status,
                                source="seed",
                                created_by=admin_user.id,
                            ))
                            att_created += 1
                    current_date += timedelta(days=1)

                await db.flush()
                print(f"  ✅ Created {att_created} attendance records")

        # === GENERATE MISSIONS ===
        existing_mission_count = (await db.execute(
            select(func.count(Mission.id)).where(Mission.tenant_id == tenant.id)
        )).scalar() or 0

        all_mt_result = await db.execute(
            select(MissionType).where(MissionType.tenant_id == tenant.id, MissionType.is_active.is_(True))
        )
        all_mission_types = list(all_mt_result.scalars().all())

        if existing_mission_count < 100 and current_window:
            missions_to_create = []
            gen_start = current_window.start_date
            gen_end = min(current_window.end_date, gen_start + timedelta(days=14))
            time_slots_def = [
                ("בוקר", time(7, 0), time(15, 0)),
                ("צהריים", time(15, 0), time(23, 0)),
                ("לילה", time(23, 0), time(7, 0)),
            ]

            current_date = gen_start
            while current_date <= gen_end:
                for mt in all_mission_types:
                    num_slots = random.choice([1, 1, 2])
                    selected_slots = random.sample(time_slots_def, min(num_slots, len(time_slots_def)))
                    for slot_label, start_t, end_t in selected_slots:
                        mission = Mission(
                            tenant_id=tenant.id,
                            schedule_window_id=current_window.id,
                            mission_type_id=mt.id,
                            name=f"{mt.name.get('he', 'משימה') if isinstance(mt.name, dict) else mt.name} - {slot_label} - {current_date.isoformat()}",
                            date=current_date,
                            start_time=start_t,
                            end_time=end_t,
                            status="draft",
                            created_by=admin_user.id,
                        )
                        missions_to_create.append(mission)
                current_date += timedelta(days=1)

            for m in missions_to_create:
                db.add(m)
            await db.flush()
            print(f"  ✅ Created {len(missions_to_create)} missions")

        # === CREATE 5 SWAP REQUESTS ===
        missions_result = await db.execute(
            select(Mission).where(
                Mission.tenant_id == tenant.id,
            ).limit(20)
        )
        missions = list(missions_result.scalars().all())

        if missions and len(all_employees) >= 10:
            swap_statuses = ["pending", "pending", "approved", "rejected", "cancelled"]
            swap_types = ["swap", "give_away", "swap"]

            # First, ensure some missions have assignments for swap requests
            emp_work_roles = {}
            ewr_result = await db.execute(
                select(EmployeeWorkRole).where(
                    EmployeeWorkRole.employee_id.in_([e.id for e in all_employees[:20]])
                )
            )
            for ewr in ewr_result.scalars().all():
                emp_work_roles.setdefault(ewr.employee_id, []).append(ewr.work_role_id)

            # Create some assignments first
            created_assignments = []
            for mission in missions[:10]:
                emp = random.choice(all_employees[:20])
                roles_for_emp = emp_work_roles.get(emp.id, [])
                if not roles_for_emp:
                    continue
                assignment = MissionAssignment(
                    mission_id=mission.id,
                    employee_id=emp.id,
                    work_role_id=roles_for_emp[0],
                    slot_id="s1",
                    status="assigned",
                    assigned_at=datetime.utcnow(),
                )
                db.add(assignment)
                created_assignments.append(assignment)

            await db.flush()
            print(f"  ✅ Created {len(created_assignments)} sample assignments")

            # Now create swap requests
            swap_count = 0
            for i, assignment in enumerate(created_assignments[:5]):
                swap_type = swap_types[i % len(swap_types)]
                target_emp = None
                target_assignment = None
                if swap_type == "swap" and len(created_assignments) > i + 1:
                    target_assignment_obj = created_assignments[(i + 1) % len(created_assignments)]
                    target_emp = target_assignment_obj.employee_id
                    target_assignment = target_assignment_obj.id

                sr = SwapRequest(
                    tenant_id=tenant.id,
                    requester_employee_id=assignment.employee_id,
                    requester_assignment_id=assignment.id,
                    target_employee_id=target_emp,
                    target_assignment_id=target_assignment,
                    swap_type=swap_type,
                    reason=random.choice(["סיבות אישיות", "בעיה רפואית", "חפיפה עם קורס", "בקשה מיוחדת", "שינוי תוכניות"]),
                    status=swap_statuses[i % len(swap_statuses)],
                )
                db.add(sr)
                swap_count += 1

            await db.flush()
            print(f"  ✅ Created {swap_count} swap requests")

        await db.commit()
        print("\n🎉 Extended seed completed!")
        print(f"   Total employees: {len(all_employees)}")
        print(f"   Mission types: {len(all_mission_types)}")
        print(f"   Schedule windows: {len(created_windows)}")


if __name__ == "__main__":
    asyncio.run(seed_extended())
