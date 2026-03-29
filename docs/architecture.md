# Architecture — Shavtzak v3.0

## Overview

Shavtzak is a multi-tenant workforce scheduling system built for Hebrew-first organizations.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI (async) |
| Database | PostgreSQL 16 (JSONB-heavy) |
| Cache/Queue | Redis 7 |
| Task Queue | Celery + Redis |
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS (RTL) |
| State | Zustand + TanStack Query |
| i18n | react-i18next (Hebrew/English) |
| Auth | JWT (15m access + 7d refresh) |
| PDF | WeasyPrint |
| IaC | Terraform (AWS prep) |
| CI/CD | GitHub Actions + Bitbucket Pipelines |

## Architecture Diagram

```
[React PWA] → [Nginx] → [FastAPI (uvicorn)]
                              │
                              ├── PostgreSQL 16
                              ├── Redis 7
                              └── Celery Workers
                                    ├── Notifications
                                    ├── Scheduling
                                    └── Google Sheets Sync
```

## Multi-Tenancy

- Every tenant gets a URL slug: `/api/v1/{tenant_slug}/...`
- Tenant isolation via `tenant_id` FK on all scoped models
- Middleware extracts tenant from URL path
- Settings are fully dynamic per tenant (key-value JSONB)

## Authentication

- JWT with access (15min) + refresh (7 days) tokens
- Password + TOTP 2FA
- WebAuthn/Passkeys
- Magic Link
- Google OAuth 2.0 / SAML 2.0
- Session management with device tracking

## Rules Engine

- Fully dynamic — no hardcoded rule types
- JSON-based condition/action expressions
- Hard rules block assignments, soft rules warn
- 48-hour future impact simulation
- Tenant-configurable per scope (global, role, employee, mission type)

## Full spec

See [shavtzak-spec-v3.0.txt](../backend/../docs/) in the docs directory.
