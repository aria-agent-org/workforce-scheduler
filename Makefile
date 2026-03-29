.PHONY: dev up down build logs test-backend lint migrate seed clean

# --- Development ---
dev:
	docker compose up --build

up:
	docker compose up -d --build

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f backend

# --- Testing ---
test-backend:
	cd backend && python -m pytest -v

lint:
	cd backend && python -m ruff check .

# --- Database ---
migrate:
	docker compose exec backend alembic upgrade head

migrate-generate:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

# --- Production ---
prod-up:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# --- Cleanup ---
clean:
	docker compose down -v --remove-orphans
	docker system prune -f
