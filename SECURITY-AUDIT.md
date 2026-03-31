# Security Audit Report — Sprint 4
**Date:** 2026-03-31
**System:** Shavtzak Workforce Scheduler v0.2.0

## A. RBAC / Permission Verification ✅

### Findings
- **Tenant isolation**: All queries use `tenant_id == tenant.id` filter via `CurrentTenant` dependency
- **User-tenant binding**: `get_tenant()` in dependencies.py verifies `user.tenant_id != tenant.id` → 403
- **Super admin bypass**: Only `super_admin` role can access any tenant
- **Self-service scoping**: All `/my/*` endpoints filter by `user.employee_id`
- **Teammates endpoint**: Returns only `id`, `full_name`, `employee_number` — no sensitive data

### Verified Endpoints
- `GET /employees` → filtered by `Employee.tenant_id == tenant.id` ✅
- `GET /my/schedule` → filtered by `MissionAssignment.employee_id == user.employee_id` ✅
- `GET /my/notifications` → filtered by `NotificationLog.employee_id == user.employee_id` ✅
- `GET /my/swap-requests` → filtered by `SwapRequest.requester_employee_id == user.employee_id` ✅
- `GET /my/teammates` → returns only public fields, scoped to tenant ✅

### No Issues Found

---

## B. Authentication Security ✅ (with fixes applied)

### Existing
- ✅ Password hashing: bcrypt (`_bcrypt.hashpw` with `gensalt()`)
- ✅ JWT with expiration: 15 min access, 7 day refresh
- ✅ 2FA/TOTP support with backup codes
- ✅ Magic Link authentication
- ✅ WebAuthn/Passkey support
- ✅ Google OAuth integration
- ✅ SAML SSO support
- ✅ Session management (logout, logout-all)
- ✅ Rate limiting middleware defined (Redis-backed)

### Fixes Applied
- **CRITICAL**: Rate limit middleware was defined but **never applied** in `main.py` → Now applied
- **Password complexity**: Added validators requiring uppercase, lowercase, digit, min 8 chars
- **Account lockout**: Redis-based lockout after 10 failed login attempts (30 min lockout)

---

## C. Input Validation & Injection ✅

### Findings
- ✅ All database queries use SQLAlchemy ORM (parameterized) — no raw SQL with f-strings
- ✅ JSONB fields validated through Pydantic schemas before storage
- ✅ Pydantic `EmailStr` for email validation
- ✅ `Field(min_length=..., max_length=...)` on password fields
- ✅ No `text(f"...")` patterns found in any router

### Fixes Applied
- Added `sanitize_text()` and `sanitize_dict_values()` utilities for XSS prevention
- Added HTML tag stripping and null byte removal

---

## D. Security Headers ✅ (with fixes applied)

### Previously Present
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Permissions-Policy: camera=(), microphone=(), geolocation=()
- ✅ Content-Security-Policy (strict)

### Fixes Applied
- **Added HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- **Added Cache-Control**: `no-store, no-cache` for all API/auth responses
- **Added Pragma**: `no-cache` for backward compatibility
- **Server header removal**: Stripped `server` header to prevent fingerprinting
- **CSP hardened**: Added `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`
- **Debug-aware CSP**: Relaxed CSP only in debug mode for hot-reload

---

## E. CORS Configuration ✅ (with fixes applied)

### Previously
- CORS origins configurable via environment variable
- `allow_credentials=True` (required for JWT cookies)

### Fixes Applied
- **Wildcard rejection**: `cors_origins_list` now raises `ValueError` if `*` is used in production
- Cookie settings added: `cookie_secure` (True in production), `cookie_samesite` (Lax)

---

## F. Data Protection ✅

### Findings
- ✅ Passwords hashed with bcrypt
- ✅ SQL echo disabled in production (`echo=settings.debug`)
- ✅ API docs disabled in production (`docs_url=None if not debug`)
- ✅ Audit logging captures security-relevant events
- ✅ Secret key warning at startup if insecure default detected

### Fixes Applied
- **Generic error handler**: Unhandled exceptions now return generic message in production, no stack traces
- **Structured logging**: Errors logged with full context via structlog but hidden from clients

---

## G. SSO Readiness ✅

### Current Support
- ✅ SAML 2.0 configuration fields: `saml_idp_entity_id`, `saml_idp_sso_url`, `saml_idp_certificate`
- ✅ Google OAuth: `google_client_id`, `google_client_secret`, `google_redirect_uri`
- ✅ WebAuthn: `webauthn_rp_id`, `webauthn_rp_name`, `webauthn_origin`
- ✅ Per-tenant auth method configuration: `AuthMethodConfig` model with method, is_enabled, config JSON

### Architecture
- `AuthMethodConfig` supports: password, webauthn, magic_link, sso_google, sso_saml
- Each method is toggleable per-tenant
- Custom certificate upload supported via `saml_idp_certificate` setting
- SAML metadata can be constructed from `saml_idp_entity_id` + `saml_idp_sso_url`

---

## Summary of Changes Made

| Category | Issue | Severity | Status |
|----------|-------|----------|--------|
| Rate Limiting | Middleware defined but not applied | CRITICAL | ✅ Fixed |
| HSTS | Missing header | HIGH | ✅ Fixed |
| Password | No complexity requirements | MEDIUM | ✅ Fixed |
| Error Handler | Stack traces could leak in production | HIGH | ✅ Fixed |
| Cache-Control | API responses cacheable | MEDIUM | ✅ Fixed |
| CSP | Missing base-uri, form-action | LOW | ✅ Fixed |
| CORS | No wildcard rejection | MEDIUM | ✅ Fixed |
| XSS | No sanitization utility | LOW | ✅ Added |
| Server Header | Fingerprinting possible | LOW | ✅ Fixed |
