#!/bin/sh
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups/mysql}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/itrack-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker compose exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | gzip > "$FILE"

echo "Created backup: $FILE"
