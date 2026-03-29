# API Endpoints — Shavtzak

## Health
- `GET /health` — Basic health check
- `GET /ready` — Readiness check (DB connectivity)

## Auth (`/auth/`)
- `POST /auth/login` — Email + password login
- `POST /auth/refresh` — Refresh access token
- `POST /auth/logout` — Revoke current session
- `POST /auth/logout-all` — Revoke all sessions
- `GET /auth/me` — Current user info
- `POST /auth/change-password`
- `POST /auth/forgot-password`
- `GET /auth/sessions` — List active sessions

## Admin (`/admin/`) — Super admin only
- `GET /admin/tenants` — List tenants
- `POST /admin/tenants` — Create tenant
- `GET /admin/tenants/{id}` — Get tenant
- `PATCH /admin/tenants/{id}` — Update tenant

## Tenant-scoped (`/api/v1/{tenant_slug}/`)

### Employees
- `GET .../employees` — List (search, filter, paginate)
- `POST .../employees` — Create
- `GET .../employees/{id}` — Get
- `PATCH .../employees/{id}` — Update
- `DELETE .../employees/{id}` — Soft delete

### Scheduling
- `GET .../schedule-windows` — List windows
- `POST .../schedule-windows/{id}/pause` — Pause
- `POST .../schedule-windows/{id}/resume` — Resume
- `GET .../missions` — List missions
- `POST .../missions/auto-assign` — Trigger auto-assignment

### Attendance
- `GET .../attendance` — List attendance records
- `GET .../attendance/conflicts` — List sync conflicts

### Rules
- `GET .../rules` — List active rules
- `POST .../rules/evaluate` — Dry-run rule evaluation
- `GET .../rules/condition-fields` — Available fields

### Notifications
- `GET .../notifications/templates` — List templates
- `GET .../notifications/logs` — Notification history

### Reports
- `GET .../reports/costs` — Cost report
- `GET .../reports/workload` — Workload report
- `GET .../reports/attendance` — Attendance report

## Interactive docs
When DEBUG=true: `GET /docs` (Swagger UI), `GET /redoc`
