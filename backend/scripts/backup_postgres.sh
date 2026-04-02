#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Shavtzak — Automated PostgreSQL Backup
# Usage: ./backup_postgres.sh [backup_dir]
# Cron:  0 3 * * * /app/scripts/backup_postgres.sh /opt/shavtzak/backups
# ═══════════════════════════════════════════════════════════

set -euo pipefail

BACKUP_DIR="${1:-/opt/shavtzak/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-shavtzak}"
DB_USER="${POSTGRES_USER:-shavtzak}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/shavtzak_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of $DB_NAME..."

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --verbose \
  2>/dev/null | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup completed: $BACKUP_FILE ($BACKUP_SIZE)"

# Cleanup old backups
echo "[$(date)] Cleaning up backups older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -name "shavtzak_*.sql.gz" -mtime +$KEEP_DAYS -delete
REMAINING=$(ls -1 "$BACKUP_DIR"/shavtzak_*.sql.gz 2>/dev/null | wc -l)
echo "[$(date)] $REMAINING backups remaining"

echo "[$(date)] Done."
