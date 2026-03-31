#!/usr/bin/env python3
"""Comprehensive API endpoint testing for Shavtzak."""

import requests
import sys
import uuid

BASE_URL = "http://localhost:8001"
TENANT = "demo"

def api(path, **kwargs):
    """Construct full API URL."""
    if path.startswith("/auth") or path.startswith("/admin") or path.startswith("/health"):
        return f"{BASE_URL}{path}"
    return f"{BASE_URL}/api/v1/{TENANT}{path}"


def login():
    r = requests.post(api("/auth/login"), json={"email": "admin@shavtzak.site", "password": "Admin123!"})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test(name, method, url, expected_status, token, data=None, params=None):
    """Run a single API test."""
    h = headers(token)
    try:
        if method == "GET":
            r = requests.get(url, headers=h, params=params, timeout=30)
        elif method == "POST":
            r = requests.post(url, headers=h, json=data, timeout=30)
        elif method == "PATCH":
            r = requests.patch(url, headers=h, json=data, timeout=30)
        elif method == "DELETE":
            r = requests.delete(url, headers=h, timeout=30)
        else:
            print(f"  ❌ {name}: Unknown method {method}")
            return False

        if r.status_code == expected_status:
            print(f"  ✅ {name} — {r.status_code}")
            return r or True  # Ensure truthy even for empty responses
        else:
            print(f"  ❌ {name} — Expected {expected_status}, got {r.status_code}: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"  ❌ {name} — Exception: {e}")
        return False


def main():
    print("🧪 Comprehensive API Testing\n")
    token = login()
    print("  ✅ Login successful\n")

    passed = 0
    failed = 0

    def check(result):
        nonlocal passed, failed
        if result:
            passed += 1
        else:
            failed += 1
        return result

    # ═══════════════════════════════════════════
    # HEALTH
    # ═══════════════════════════════════════════
    print("═══ Health ═══")
    check(test("Health check", "GET", api("/health"), 200, token))

    # ═══════════════════════════════════════════
    # EMPLOYEES
    # ═══════════════════════════════════════════
    print("\n═══ Employees ═══")
    r = check(test("List employees", "GET", api("/employees"), 200, token))
    check(test("List with pagination", "GET", api("/employees"), 200, token, params={"page": 1, "page_size": 5}))
    check(test("List with search", "GET", api("/employees"), 200, token, params={"search": "כהן"}))
    check(test("List by status", "GET", api("/employees"), 200, token, params={"status_filter": "present"}))

    # Create valid
    r = check(test("Create employee", "POST", api("/employees"), 201, token, data={
        "employee_number": "E999",
        "full_name": "טסט חייל",
        "status": "present",
    }))
    emp_id = r.json()["id"] if r else None

    # Create duplicate
    check(test("Create duplicate (409)", "POST", api("/employees"), 409, token, data={
        "employee_number": "E999",
        "full_name": "כפול",
        "status": "present",
    }))

    # Create invalid (empty name)
    check(test("Create invalid (422)", "POST", api("/employees"), 422, token, data={
        "employee_number": "",
        "full_name": "",
    }))

    # Update existing
    if emp_id:
        check(test("Update employee", "PATCH", api(f"/employees/{emp_id}"), 200, token, data={
            "full_name": "טסט מעודכן",
            "status": "home",
        }))

    # Update non-existent
    fake_id = str(uuid.uuid4())
    check(test("Update non-existent (404)", "PATCH", api(f"/employees/{fake_id}"), 404, token, data={
        "full_name": "לא קיים",
    }))

    # Delete existing
    if emp_id:
        check(test("Delete employee", "DELETE", api(f"/employees/{emp_id}"), 204, token))

    # ═══════════════════════════════════════════
    # SCHEDULE WINDOWS
    # ═══════════════════════════════════════════
    print("\n═══ Schedule Windows ═══")
    check(test("List windows", "GET", api("/schedule-windows"), 200, token))
    check(test("List with filter", "GET", api("/schedule-windows"), 200, token, params={"status_filter": "active"}))

    r = check(test("Create window", "POST", api("/schedule-windows"), 201, token, data={
        "name": "טסט חלון",
        "start_date": "2026-06-01",
        "end_date": "2026-06-30",
    }))
    win_id = r.json()["id"] if r else None

    # Invalid dates
    check(test("Create invalid (end before start)", "POST", api("/schedule-windows"), 400, token, data={
        "name": "לא תקין",
        "start_date": "2026-06-30",
        "end_date": "2026-06-01",
    }))

    if win_id:
        check(test("Get window", "GET", api(f"/schedule-windows/{win_id}"), 200, token))
        check(test("Update window", "PATCH", api(f"/schedule-windows/{win_id}"), 200, token, data={"name": "חלון מעודכן"}))
        check(test("Activate window", "POST", api(f"/schedule-windows/{win_id}/activate"), 200, token))
        check(test("Archive window", "POST", api(f"/schedule-windows/{win_id}/archive"), 200, token))

    check(test("Get non-existent window (404)", "GET", api(f"/schedule-windows/{fake_id}"), 404, token))

    # ═══════════════════════════════════════════
    # MISSION TYPES
    # ═══════════════════════════════════════════
    print("\n═══ Mission Types ═══")
    check(test("List mission types", "GET", api("/mission-types"), 200, token))

    r = check(test("Create mission type", "POST", api("/mission-types"), 201, token, data={
        "name": {"he": "טסט סוג", "en": "Test Type"},
        "description": {"he": "תיאור", "en": "Description"},
        "color": "#ff0000",
        "icon": "⚡",
        "duration_hours": 4,
        "is_standby": False,
        "standby_can_count_as_rest": False,
        "required_slots": [{"slot_id": "s1", "label": {"he": "עובד"}, "count": 1}],
    }))
    mt_id = r.json()["id"] if r else None

    if mt_id:
        check(test("Get mission type", "GET", api(f"/mission-types/{mt_id}"), 200, token))
        check(test("Update mission type", "PATCH", api(f"/mission-types/{mt_id}"), 200, token, data={"color": "#00ff00"}))
        check(test("Delete mission type", "DELETE", api(f"/mission-types/{mt_id}"), 204, token))

    check(test("Get non-existent type (404)", "GET", api(f"/mission-types/{fake_id}"), 404, token))

    # ═══════════════════════════════════════════
    # MISSIONS
    # ═══════════════════════════════════════════
    print("\n═══ Missions ═══")
    r = check(test("List missions", "GET", api("/missions"), 200, token))
    check(test("List with filters", "GET", api("/missions"), 200, token, params={"status_filter": "draft", "date_from": "2026-04-01"}))

    # Get first mission type for creating mission
    mt_list = requests.get(api("/mission-types"), headers=headers(token)).json()
    windows = requests.get(api("/schedule-windows"), headers=headers(token)).json()
    if mt_list and windows:
        first_mt = mt_list[0]["id"]
        first_win = windows[0]["id"]
        r = check(test("Create mission", "POST", api("/missions"), 201, token, data={
            "schedule_window_id": first_win,
            "mission_type_id": first_mt,
            "name": "משימת טסט",
            "date": "2026-04-15",
            "start_time": "08:00",
            "end_time": "16:00",
        }))
        mission_id = r.json()["id"] if r else None

        if mission_id:
            check(test("Update mission", "PATCH", api(f"/missions/{mission_id}"), 200, token, data={"name": "משימה מעודכנת"}))
            check(test("Approve mission", "POST", api(f"/missions/{mission_id}/approve"), 200, token))
            check(test("Cancel mission", "POST", api(f"/missions/{mission_id}/cancel"), 200, token))

    check(test("Get non-existent mission (404)", "GET", api(f"/missions/{fake_id}"), 404, token))

    # ═══════════════════════════════════════════
    # SWAP REQUESTS
    # ═══════════════════════════════════════════
    print("\n═══ Swap Requests ═══")
    check(test("List swap requests", "GET", api("/swap-requests"), 200, token))
    check(test("List with filter", "GET", api("/swap-requests"), 200, token, params={"status_filter": "pending"}))

    # ═══════════════════════════════════════════
    # NOTIFICATIONS
    # ═══════════════════════════════════════════
    print("\n═══ Notifications ═══")
    check(test("List templates", "GET", api("/notifications/templates"), 200, token))
    check(test("List logs", "GET", api("/notifications/logs"), 200, token))
    check(test("List channels", "GET", api("/notifications/channels"), 200, token))
    check(test("List event types", "GET", api("/notifications/event-types"), 200, token))

    r = check(test("Create template", "POST", api("/notifications/templates"), 201, token, data={
        "name": "טסט תבנית",
        "event_type_code": "test",
        "channels": {"push": {"enabled": True, "body": {"he": "בדיקה"}}},
    }))
    tmpl_id = r.json()["id"] if r else None

    if tmpl_id:
        check(test("Get template", "GET", api(f"/notifications/templates/{tmpl_id}"), 200, token))
        check(test("Update template", "PATCH", api(f"/notifications/templates/{tmpl_id}"), 200, token, data={"name": "מעודכן"}))
        check(test("Delete template", "DELETE", api(f"/notifications/templates/{tmpl_id}"), 204, token))

    # Broadcast
    check(test("Broadcast to all", "POST", api("/notifications/broadcast"), 200, token, data={
        "title": "בדיקה", "body": "תוכן בדיקה", "target": "all",
    }))
    check(test("Broadcast to present", "POST", api("/notifications/broadcast"), 200, token, data={
        "title": "בדיקה", "body": "תוכן", "target": "present",
    }))
    check(test("Broadcast invalid target", "POST", api("/notifications/broadcast"), 400, token, data={
        "title": "בדיקה", "body": "תוכן", "target": "invalid",
    }))
    check(test("Broadcast custom no ids (400)", "POST", api("/notifications/broadcast"), 400, token, data={
        "title": "בדיקה", "body": "תוכן", "target": "custom", "soldier_ids": [],
    }))

    # ═══════════════════════════════════════════
    # RULES
    # ═══════════════════════════════════════════
    print("\n═══ Rules ═══")
    check(test("List rules", "GET", api("/rules"), 200, token))

    # ═══════════════════════════════════════════
    # ATTENDANCE
    # ═══════════════════════════════════════════
    print("\n═══ Attendance ═══")
    check(test("List statuses", "GET", api("/attendance/statuses"), 200, token))

    # ═══════════════════════════════════════════
    # AUDIT
    # ═══════════════════════════════════════════
    print("\n═══ Audit ═══")
    check(test("List audit logs", "GET", api("/audit-logs"), 200, token))
    check(test("Audit with filters", "GET", api("/audit-logs"), 200, token, params={"entity_type": "employee", "page_size": 5}))

    # ═══════════════════════════════════════════
    # ADMIN
    # ═══════════════════════════════════════════
    print("\n═══ Admin ═══")
    check(test("Admin stats", "GET", api("/admin/stats"), 200, token))
    check(test("Admin tenants", "GET", api("/admin/tenants"), 200, token))
    check(test("Admin users", "GET", api("/admin/users"), 200, token))
    check(test("Admin plans", "GET", api("/admin/plans"), 200, token))
    check(test("Admin roles", "GET", api("/admin/role-definitions"), 200, token))

    # ═══════════════════════════════════════════
    # REPORTS
    # ═══════════════════════════════════════════
    print("\n═══ Reports ═══")
    check(test("Reports dashboard", "GET", api("/reports/dashboard"), 200, token))

    # ═══════════════════════════════════════════
    # WORK ROLES
    # ═══════════════════════════════════════════
    print("\n═══ Work Roles ═══")
    check(test("List work roles", "GET", api("/work-roles"), 200, token))

    # ═══════════════════════════════════════════
    # RESULTS
    # ═══════════════════════════════════════════
    print(f"\n{'='*50}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"📊 Total: {passed + failed}")
    print(f"{'='*50}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
