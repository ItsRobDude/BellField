#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../src/database/migrations" && pwd)"
RAW_NAME="${1:-}"

if [[ -z "$RAW_NAME" ]]; then
  echo "Usage: pnpm --filter @bellfield/api migration:create -- <migration_name>"
  exit 1
fi

SAFE_NAME="$(echo "$RAW_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+|_+$//g')"
if [[ -z "$SAFE_NAME" ]]; then
  echo "Error: migration name must include letters or numbers."
  exit 1
fi

STAMP="$(date -u +"%Y%m%d%H%M%S")"
UP_FILE="$MIGRATIONS_DIR/${STAMP}_${SAFE_NAME}.up.sql"
DOWN_FILE="$MIGRATIONS_DIR/${STAMP}_${SAFE_NAME}.down.sql"

cat > "$UP_FILE" <<SQL
-- Migration: ${STAMP}_${SAFE_NAME}
-- Write forward SQL here.
SQL

cat > "$DOWN_FILE" <<SQL
-- Migration: ${STAMP}_${SAFE_NAME}
-- Write rollback SQL here.
SQL

echo "Created:"
echo "  $UP_FILE"
echo "  $DOWN_FILE"
