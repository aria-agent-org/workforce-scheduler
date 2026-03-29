# שבצק — Shavtzak

> Multi-Tenant Workforce Scheduling System — Hebrew-First, Production-Ready

[![CI](https://github.com/aria-agent-org/workforce-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/aria-agent-org/workforce-scheduler/actions/workflows/ci.yml)

## Stack

- **Backend:** Python 3.12 / FastAPI / SQLAlchemy 2.0 (async) / Alembic
- **Frontend:** React 18 / TypeScript / Vite / shadcn/ui / Tailwind CSS
- **Database:** PostgreSQL 16 / Redis 7
- **Task Queue:** Celery + Redis
- **Auth:** JWT + 2FA (TOTP) + WebAuthn + Magic Link + Google OAuth
- **i18n:** Hebrew-first RTL, English secondary
- **CI/CD:** GitHub Actions + Bitbucket Pipelines

## Quick Start

```bash
# Clone
git clone https://github.com/aria-agent-org/workforce-scheduler.git
cd workforce-scheduler

# Copy env
cp .env.example .env

# Start all services
docker compose up --build

# API: http://localhost:8001
# Frontend: http://localhost:3000
# API Docs: http://localhost:8001/docs
```

## Development

```bash
make dev          # docker compose up --build
make test-backend # run pytest
make lint         # run ruff
make migrate      # run alembic migrations
make logs         # tail logs
make down         # stop everything
make clean        # stop + remove volumes
```

## Project Structure

```
backend/
  app/
    main.py          # FastAPI app
    config.py        # Settings from env
    database.py      # Async SQLAlchemy
    models/          # SQLAlchemy models (30+ tables)
    schemas/         # Pydantic schemas
    routers/         # API endpoints
    services/        # Business logic (auth, rules engine, scheduling)
    tasks/           # Celery tasks (notifications, scheduling, sheets sync)
    middleware/      # Tenant, audit, rate limiting
  alembic/           # Database migrations
  tests/             # pytest test suite

frontend/
  src/
    components/      # UI components (shadcn + custom)
    pages/           # Page components
    stores/          # Zustand state
    i18n/            # Hebrew + English translations
    hooks/           # React hooks
    lib/             # API client, utilities
    types/           # TypeScript types

docker-compose.yml   # Dev environment
.github/workflows/   # CI/CD
docs/                # Architecture docs
```

## Domain

- Production: https://shavtzak.site
- Spec: See `docs/shavtzak-spec-v3.0.txt`

## License

Proprietary — ARIA Agent Org
