# Sprint 5 — Major Feature Sprint

## WORKING DIRECTORY: /tmp/workforce-scheduler
## SPEC: /root/.openclaw/workspace-ceo/docs/shavtzak-spec-v3.0.txt

---

## PART A: CRITICAL FIXES (do first)

### A1. Employee Status — MUST be Read-Only in List
The employee list STILL has an editable status dropdown. This is WRONG.
- Remove ALL status editing from EmployeesPage.tsx
- Status should be a simple colored Badge (read-only, no click, no dropdown)
- Status belongs ONLY in the attendance view of a specific board
- Verify by reading the rendered component — no onChange, no select, no dropdown on status

### A2. Schedule Board — Self-Contained World
When entering a schedule board (schedule window), it must be its own world:
- Only ONE board can be active per tenant at a time
- Add `is_primary` or enforce single-active in backend
- Board view shows: its employees, its missions, its attendance, its rules
- Everything is scoped to this board
- Clean, organized layout — not messy

### A3. Attendance is Per-Board
- Attendance records are linked to a specific schedule_window_id
- When viewing attendance, it's ONLY for the current active board
- The attendance page should show which board it relates to

### A4. Per-Board Rules Override
- Each board can have its own rule overrides
- Add `schedule_window_id` to rules or create a rules_override table per window
- UI: inside board view, option to customize rules for this specific board

### A5. Board Template Editor — Excel-Like
The template editor needs to be like Excel:
- Full grid editor where each cell can be assigned a mission type + slot + shift
- Place multiple missions in one row side by side
- No limitations — user decides layout completely
- Variables for auto-filling: mission name, soldier name, time, role
- Button: "Generate board for date X" from this template
- In EVERY board view: button to generate daily board from template

---

## PART B: USER IMPORT & INVITATION SYSTEM

### B1. Import Wizard (Complete Rewrite)
After file upload (CSV/Excel), show a multi-step wizard:

**Step 1: Column Mapping**
- Auto-detect columns (name, phone, email, roles)
- Required: full_name + (phone OR email)
- Roles: comma-separated, auto-detect

**Step 2: Data Validation**  
- Validate phone numbers (Israeli format default, flag non-Israeli as warning not error)
- Validate emails
- Flag truly invalid data with option to fix or skip
- Detect duplicates (same phone/email already exists)

**Step 3: Role Resolution**
- If a role doesn't exist in the system, offer to create it
- Wizard shows: "Role 'נהג' not found. Create it?" with fields for the new role
- Allow setting role conditions

**Step 4: Conflict Resolution**
- If employee with same phone/email exists: show conflict, ask to update or skip
- Each user import creates both User + Employee records
- Transfer all imported data to the employee record

**Step 5: Invitation Method**
After all users loaded, wizard for sending invitations:
- Choose channel: SMS, Email, WhatsApp, or Telegram
- Or: download file with registration links per user
- Or: let users self-register (system identifies by phone/email which tenant)

### B2. Self-Registration Flow
- User goes to registration page, fills: name, email, phone
- System checks if phone/email matches an imported user in any tenant
- If match: auto-assigns to that tenant
- If no match: show error or allow general registration

### B3. Soldier Cannot Change Own Name
- In MySettingsPage / MyProfilePage: name field is READ-ONLY for soldiers
- Only users with admin/manager permission can change names

---

## PART C: COMMUNICATION CHANNELS (Admin Configuration)

### C1. WhatsApp Integration
System admin can configure WhatsApp:
- **Option 1: WhatsApp Business API** — enter API token, phone number ID, business account ID
- **Option 2: Regular WhatsApp (QR)** — scan QR code, maintain session
- Store config in system settings
- Per-tenant: if feature enabled, tenant can configure their OWN WhatsApp

### C2. Telegram Bot
System admin configures the system Telegram bot:
- Bot token, bot username
- Per-tenant: if feature enabled, tenant creates their own bot
- Bot functionality:
  - Send notifications to channels/groups (tenant adds bot as admin)
  - Personal bot for each user (after registration in bot)
  - Banner in app telling users about Telegram bot option
  - Bot only responds to registered users

### C3. Email Configuration  
System admin configures email sender:
- **SMTP**: host, port, username, password, from address
- **AWS SES**: access key, secret key, region, from address
- **Other providers**: extensible
- Per-tenant: if feature enabled, tenant can set their own email (send from their domain)

### C4. SMS Configuration
System admin configures SMS provider:
- **AWS SNS**: access key, secret, region
- **Twilio**: account SID, auth token, from number
- **Other**: extensible
- Per-tenant: same as above if feature enabled

### C5. AI Bot Configuration
System admin sets:
- AI model name (e.g., claude-sonnet, gpt-4o)
- API key
- Per-tenant: if AI feature enabled, bot works with AI
- Bot only responds to registered system users

---

## PART D: TENANT FEATURES & BRANDING

### D1. Feature Flags per Tenant
Admin can enable/disable per tenant:
- Custom domain
- Custom email sending
- Own WhatsApp bot
- Own Telegram bot  
- AI bot
- Custom branding
- Advanced scheduling
Add a `features` JSONB field to Tenant model or a tenant_features table.
UI: in admin panel, per-tenant feature toggle switches.

### D2. Custom Domain per Tenant
If feature enabled:
- Tenant sets their custom domain
- Branded login page with their logo, colors, name
- All emails/links use their domain
- Backend: serve different branding based on request hostname

### D3. Full Branding Control
Tenant can customize (if feature enabled):
- Logo, favicon, app name
- Primary/secondary/accent colors
- Login page background, text
- Email templates with their branding
- PWA icon and name on mobile

---

## TECHNICAL NOTES:
- Backend: FastAPI + SQLAlchemy (async) + Alembic
- Frontend: React + TypeScript + Vite + Tailwind
- Hebrew RTL throughout
- Docker Compose deployment

## GIT:
- Commit frequently with descriptive messages
- Push to origin main

## AFTER ALL CHANGES:
```bash
cd /tmp/workforce-scheduler
docker compose down
docker compose build --no-cache
docker compose up -d
sleep 15
curl -s http://localhost:8001/health
```
