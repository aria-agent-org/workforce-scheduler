# ═══════════════════════════════════════════
# Stage 1: Builder — install dependencies
# ═══════════════════════════════════════════
FROM python:3.12-slim AS builder

WORKDIR /build

# System dependencies for building
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ═══════════════════════════════════════════
# Stage 2: Runtime — lean production image
# ═══════════════════════════════════════════
FROM python:3.12-slim AS runtime

WORKDIR /app

# Runtime-only system libs (no build-essential)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libcairo2 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && adduser --disabled-password --gecos '' appuser

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Run as non-root user
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
