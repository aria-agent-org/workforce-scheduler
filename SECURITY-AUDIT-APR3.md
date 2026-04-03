# Security Audit — April 3, 2026

## Tenant Isolation ✅
- `get_tenant()` in `dependencies.py` verifies user belongs to the requested tenant
- Super admins can access any tenant; regular users restricted to their own
- All tenant-scoped routes use `CurrentTenant` dependency which enforces this
- 126 queries across routers include `tenant_id` filter
- DB models use `TenantBase` which auto-includes `tenant_id` column

## RBAC ✅
- `require_permission(resource, action)` dependency enforces role-based access
- Roles defined in `role_definitions` table with `permissions` JSONB
- Routes use `dependencies=[Depends(require_permission("settings", "write"))]`
- Admin routes use `_require_super_admin()` which checks role_definition name

## Auth ✅
- JWT tokens with expiration
- WebAuthn/Passkey support
- Google OAuth SSO
- Magic link login
- Passwords hashed with bcrypt

## Sensitive Data ✅
- Integration secrets encrypted with Fernet in DB (`encrypt_value`/`decrypt_value`)
- Service Account JSON stored encrypted, only email exposed to tenants
- API masks sensitive values in responses (`get_masked_value()`)

## Areas Reviewed
1. **admin.py** — Super admin only routes. No tenant filter needed (operates globally). ✅
2. **auth.py** — User-level operations. No tenant filter needed (login/register). ✅  
3. **push.py** — User-level push subscriptions. Filtered by user_id. ✅
4. **onboarding.py** — Uses user context. ✅
5. **scheduling.py** — All queries include `tenant_id == tenant.id`. ✅
6. **employees.py** — All queries include tenant filter + RBAC. ✅
7. **attendance.py** — Tenant-scoped. ✅
8. **board.py** — Tenant-scoped + visibility settings. ✅
9. **integrations.py** — Service info endpoint: only exposes email, not credentials. ✅
10. **integration_settings.py** — Super admin only. ✅

## Kiosk Endpoints
- `/kiosk/check-in` and `/kiosk/status` don't require auth (by design for tablet kiosks)
- Kiosk endpoints require `kiosk_code` parameter which is tenant-specific
- **Recommendation**: Add rate limiting to kiosk endpoints to prevent brute force

## Recommendations
1. Add rate limiting to kiosk check-in endpoints
2. Add rate limiting to magic link request endpoint
3. Consider adding audit log entry for failed login attempts
4. Consider IP whitelist for admin routes (feature exists but not enforced by default)

## Conclusion
No critical vulnerabilities found. Tenant isolation is properly enforced through the dependency injection system. RBAC is consistently applied across routes.
