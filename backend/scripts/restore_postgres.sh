#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Shavtzak — PostgreSQL Restore
# Usage: ./restore_postgres.sh backup_file.sql.gz
# ═══════════════════════════════════════════════════════════

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Available backups:"
  ls -lh /opt/shavtzak/backups/shavtzak_*.sql.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_FILE="$1"
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-shavtzak}"
DB_USER="${POSTGRES_USER:-shavtzak}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  WARNING: This will REPLACE all data in $DB_NAME!"
echo "Backup: $BACKUP_FILE"
echo ""
read -p "Type 'RESTORE' to confirm: " confirm

if [ "$confirm" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

echo "[$(date)] Restoring from $BACKUP_FILE..."

gunzip -c "$BACKUP_FILE" | PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --clean \
  --if-exists \
  --no-owner \
  --verbose \
  2>&1

echo "[$(date)] Restore completed."
