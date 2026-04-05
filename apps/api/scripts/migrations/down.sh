#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is required."
  exit 1
fi

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../src/database/migrations" && pwd)"

last_filename="$(psql "$DATABASE_URL" -tA -c "SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1;" 2>/dev/null || true)"

if [[ -z "$last_filename" ]]; then
  echo "No applied migrations found."
  exit 0
fi

down_filename="${last_filename%.up.sql}.down.sql"
down_file="$MIGRATIONS_DIR/$down_filename"

if [[ ! -f "$down_file" ]]; then
  echo "Error: rollback file not found for $last_filename"
  echo "Expected: $down_file"
  exit 1
fi

echo "Reverting $last_filename using $down_filename"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$down_file"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DELETE FROM schema_migrations WHERE filename = '$last_filename';"

echo "Rolled back $last_filename"
