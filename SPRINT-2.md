# Sprint 2 — Bug Fixes + Enterprise UX Upgrade

## Repo: /tmp/workforce-scheduler
## Spec: /root/.openclaw/workspace-ceo/docs/shavtzak-spec-v3.0.txt

## CRITICAL BUGS (fix first):

### 1. WebAuthn Security Key Error (#7)
- Adding security key from settings throws error
- Check backend WebAuthn endpoints (py_webauthn) + frontend registration flow
- Must work end-to-end: register key, login with key

### 2. Admin Panel Not Responsive (#8)
- Admin page not mobile-friendly
- Convert tables to card layouts on mobile
- Touch targets 44px+, proper spacing, bottom nav

### 3. Schedule Board Not Responsive (#9)
- Board view breaks on mobile
- Need: horizontal scroll, pinned first column, touch-friendly cells
- Swipeable day navigation

### 4. Mission Update Error with Timeline (#10)
- Updating mission with hourly timeline throws error
- Check API endpoint validation — likely schema mismatch on timeline field
- Backend: ensure timeline JSON schema accepts hourly format
- Frontend: ensure form sends correct payload

### 5. Auto-Scheduling Not Working (#11)
- Button does nothing or errors
- Check: backend scheduling algorithm endpoint, frontend API call
- Must: run algorithm, fill slots, show results, allow confirmation

### 6. Print Button Not Working (#12)
- Print CSS not triggering or broken
- Check @media print styles, ensure board layout prints correctly
- RTL Hebrew, clean layout, no nav/sidebar in print

### 7. Daily Board Generation from Template (#13)
- No clear flow to generate daily board from template settings
- Add: "Generate Board" button in template view → creates daily schedule
- Connect board template settings to actual board generation

### 8. Soldier Live View UX (#14)
- Soldier should see TODAY first with day navigation
- Redesign /my/schedule: big today card, swipe/arrows for days
- Show: current duty, next duty, countdown timer
- Mobile-first, clean, intuitive

### 9. Soldier Personal Settings Access (#15)
- Soldier role missing settings access
- Add: /my/settings page with profile, security key, notifications, password, theme
- Route guards must allow soldier role

### 10. Tenant Branding Error (#16)
- Save branding throws error
- Fix: backend endpoint for tenant branding update
- Ensure: logo upload, color picker, theme changes actually apply to tenant UI

## ENTERPRISE UX UPGRADE (#17):

### Design System Upgrade
- Premium shadows (elevation levels 1-5)
- Smooth transitions (200-300ms ease)
- Glass morphism effects on cards
- Gradient accents (subtle, professional)
- Consistent border-radius (8px cards, 6px inputs, 4px buttons)
- Typography hierarchy (clear h1-h6 with proper spacing)

### Component Quality
- Loading skeletons on all data-loading states
- Empty states with illustrations/icons on all list pages
- Error boundaries with retry buttons
- Toast notifications with progress bars
- Confirmation dialogs for destructive actions

### Responsive Excellence (ALL pages)
- Mobile: single column, cards, bottom nav, touch targets 44px+
- Tablet: 2 columns where appropriate
- Desktop: full layout with sidebar
- Test every page at 375px, 768px, 1024px, 1440px

### Data Visualization
- Charts: use recharts or similar, consistent colors
- KPI cards with trend indicators
- Dashboard: actionable, not just informational

### Accessibility
- All interactive elements focusable
- Proper ARIA labels
- Color contrast 4.5:1 minimum
- Keyboard navigation on all pages

## SPEC COMPLIANCE:
Read the full spec at /root/.openclaw/workspace-ceo/docs/shavtzak-spec-v3.0.txt
Verify every feature described in the spec actually works in the code.
Fix any gaps found.

## COMMIT STRATEGY:
- Commit after each major fix/feature
- Descriptive commit messages in English
- Push to main after each batch of commits

## IMPORTANT:
- Language: Hebrew RTL throughout the app
- Framework: React + TypeScript frontend, FastAPI + SQLAlchemy backend
- Test that Docker containers build after changes
