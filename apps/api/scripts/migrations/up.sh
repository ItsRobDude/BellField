#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: DATABASE_URL is required."
  exit 1
fi

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../src/database/migrations" && pwd)"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob
for up_file in "$MIGRATIONS_DIR"/*.up.sql; do
  filename="$(basename "$up_file")"
  already_applied="$(psql "$DATABASE_URL" -tA -c "SELECT 1 FROM schema_migrations WHERE filename = '$filename' LIMIT 1;")"

  if [[ "$already_applied" == "1" ]]; then
    continue
  fi

  echo "Applying $filename"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$up_file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (filename) VALUES ('$filename');"
done

echo "Migrations are up to date."
