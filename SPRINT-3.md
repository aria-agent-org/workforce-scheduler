# Sprint 3 — Comprehensive Quality Sprint

## CRITICAL BUG FIXES:

### 1. Passkey Login Issue
- Registration works (verified in logs). Login returned 401 because credential lookup didn't find the key.
- INVESTIGATE: Compare how credential_id is stored (from verify_registration_response) vs how it's looked up during login (base64url_to_bytes of rawId from browser).
- The raw_id from browser during login MUST match the credential_id stored during registration.
- Add debug logging to both register/finish and login/finish to log credential_id hex values.
- TEST the full flow: register → logout → login with passkey.

### 2. Security Key Management UI
- Users need a way to manage their security keys: view list, delete, add (up to configurable max per user, default 5).
- In SecuritySettingsPage.tsx: show a list of registered keys with name, creation date, last used, delete button.
- Add GET /auth/webauthn/credentials endpoint to list user's keys.
- Add DELETE /auth/webauthn/credentials/{credential_id} endpoint.
- System admin setting: max_webauthn_keys_per_user (default 5).

### 3. Board Template Editor — Full Dynamic Table Builder
- Currently the board template editor is basic. Need full dynamic editor:
  - Drag & drop rows and columns
  - Place sections side-by-side (multiple columns in one row)
  - Merge cells
  - Each cell can hold a mission type reference or free text
  - Variables system: {{mission_name}}, {{soldier_name}}, {{time_start}}, {{time_end}}, etc.
  - Template generates actual boards automatically from defined variables
  - Preview mode showing how the board will look with sample data
- This is basically a WYSIWYG table builder for shift boards.

### 4. Employee Status Display
- In employee list: status badge should be READ-ONLY display (show the display_name of the status).
- Remove any dropdown/editable status in the employee list — attendance changes belong in the schedule board.
- Make status a simple Badge component with color coding.

### 5. Schedule Board as Self-Contained World
- Each schedule board (schedule_window) is its own world:
  - Has its own list of assigned employees (can add/remove per board)
  - Employees can be in multiple boards
  - Attendance is PER BOARD, not global
  - Can add new employees to a specific board only
  - Removing from board doesn't delete the employee
- Make the board view comprehensive: shows employees, their assignments, attendance, conflicts

### 6. Soldier View Improvements
- Show team members for each mission (who else is assigned)
- Show schedule conflicts with clear explanation of what the conflict is
- Only show what's relevant to THIS soldier
- For active mission: show ONLY the active mission prominently (not duplicated)
- Future missions in a separate section below
- Manager view: can see everything, filtered by permissions

### 7. Soldier Profile Error
- Entering soldier profile through the app shows "שגיאה בטעינת העדפות"
- Debug the employee preferences loading endpoint
- Check: GET /api/v1/{tenant}/my/preferences or similar
- Fix the error — might be missing table data or wrong query

### 8. Tenant Branding — ACTUALLY APPLY
- The branding save works but doesn't actually affect the UI visually
- Need: When branding is loaded, apply as CSS custom properties that override the theme
- primary_color → --color-primary-* (generate shades)
- logo → display in sidebar/topbar
- PWA icon → update manifest.json dynamically
- App name → update document.title and manifest.json name

### 9. PWA Icon & Name Customization
- System admin: can set global PWA icon and app name
- Tenant admin: can set their own icon and app name (overrides global)
- Dynamic manifest.json: serve from API endpoint that returns tenant-specific manifest
- Icons: upload SVG/PNG, generate required PWA sizes (192x192, 512x512)
- Name: shows as app name on mobile home screen

### 10. Onboarding / Learning System
- First-time user gets an interactive onboarding wizard:
  - Step-by-step guided tour of the app
  - Tooltips highlighting key UI elements
  - Professional illustrations/animations
  - Written clearly for non-technical users (Hebrew)
  - Each step has "הבנתי" button to proceed
- Help center with categorized articles
- Contextual help (? icon near complex features)
- Mark onboarding as completed per user (don't show again)

### 11. Audit Log IP Fix
- Currently logs 172.20.0.1 (Docker internal IP) instead of real client IP
- Fix: Read X-Forwarded-For or X-Real-IP header from reverse proxy
- In the FastAPI middleware/dependency, extract real IP from headers
- Fallback to request.client.host if headers not present

### 12. Israel Timezone Default
- Default timezone should be Asia/Jerusalem
- Tenant setting: custom timezone (overrides default)
- All dates/times displayed in the configured timezone
- Backend: store in UTC, convert for display
- Frontend: use Intl.DateTimeFormat with timezone from tenant settings

### 13. Rules Engine Upgrade
- Current rules engine update throws errors
- Fix the update endpoint first
- Then upgrade UX:
  - Visual rule builder (drag & drop conditions)
  - Dropdown for field selection (employee fields, mission fields, time fields)
  - Operator selection (equals, greater, less, contains, between, in)
  - Value input adapts to field type (date picker, number, select, etc.)
  - AND/OR grouping of conditions
  - Preview: test rule against current data before saving
  - Templates: pre-built common rules (max hours, rest time, role requirements)
  - Hebrew labels and descriptions for everything
  - Tooltips explaining each field and operator

### 14. Scheduling System Verification
- Verify auto-scheduling works correctly:
  - Respects rules engine output
  - Respects employee preferences
  - Handles conflicts properly
  - Configurable per-tenant scheduling matrix
  - Per-mission-type scheduling options
- Tenant can configure:
  - Shift patterns (8h, 12h, custom)
  - Rotation rules
  - Fair distribution algorithm
  - Max consecutive shifts
  - Required rest between shifts

### 15. Full Spec Compliance Re-Audit
- Read /root/.openclaw/workspace-ceo/docs/shavtzak-spec-v3.0.txt
- Verify EVERY feature described in the spec is implemented and working
- Fix any gaps found

### 16. Backend Deep Audit
- Check every router file for:
  - Proper error handling (no 500s, meaningful Hebrew error messages)
  - Input validation on all endpoints
  - Proper authorization checks
  - SQL injection protection (parameterized queries only)
  - Missing endpoints that should exist per the spec
- Check all models: proper relationships, constraints, indexes
- Check all services: business logic correctness

### 17. Frontend Deep Audit
- Every page must be:
  - Responsive (375px, 768px, 1024px, 1440px)
  - Hebrew RTL correct
  - Touch-friendly (44px targets)
  - Loading states present
  - Error states handled
  - Empty states present
- Test every button, every form, every dropdown
- Test with various data inputs (empty, long strings, special characters, Hebrew)
- Test all CRUD operations on every entity

## TECHNICAL:
- Stack: React+TypeScript+Vite frontend, FastAPI+SQLAlchemy+Alembic backend
- Spec: /root/.openclaw/workspace-ceo/docs/shavtzak-spec-v3.0.txt
- Hebrew RTL throughout
- Docker compose for deployment

## GIT:
- Commit after each major fix with descriptive messages
- Push to origin main after each batch

## AFTER ALL FIXES:
- Rebuild Docker: docker compose down && docker compose build --no-cache && docker compose up -d
- Run: alembic upgrade head (if new migrations)
- Verify: curl http://localhost:8001/health
