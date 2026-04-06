# Database migrations (API)

## Foundation decision

BellField API uses **plain SQL file migrations executed by `psql`** with a tiny repository-owned runner script. This is intentionally conservative for PostgreSQL: SQL is explicit, easy to review, and avoids locking migration flow to an ORM in this early phase.

## Directory structure

Migrations live in:

- `apps/api/src/database/migrations`

Each migration is a pair of files:

- `<timestamp>_<name>.up.sql` (forward change)
- `<timestamp>_<name>.down.sql` (rollback change)

## Naming convention

- Timestamp format: `YYYYMMDDHHMMSS` in UTC.
- Name format: lowercase `snake_case`.
- Full example: `20260405103045_add_jobs_table.up.sql` and `20260405103045_add_jobs_table.down.sql`.

## Zero-to-local-database bootstrap (fresh machine)

From repository root:

1. Confirm PostgreSQL client tooling is installed and available on `PATH`:
   - `psql --version`
2. Create a throwaway local database (example name):
   - `createdb bellfield_migration_smoke`
3. Set `DATABASE_URL` for migration commands:
   - macOS/Linux: `export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bellfield_migration_smoke`
   - Windows PowerShell: `$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/bellfield_migration_smoke"`
4. Create a migration pair:
   - `pnpm --filter @bellfield/api migration:create -- add_descriptive_name`
5. Add SQL to both generated files (`.up.sql` and `.down.sql`).
6. Apply pending migrations:
   - `pnpm --filter @bellfield/api migration:up`
7. Roll back the latest migration (if needed):
   - `pnpm --filter @bellfield/api migration:down`
8. (Optional) Drop the throwaway database after verification:
   - `dropdb bellfield_migration_smoke`

Notes:

- `DATABASE_URL` is required for `migration:up` and `migration:down`.
- The migration runner creates `schema_migrations` automatically with `CREATE TABLE IF NOT EXISTS ...` before applying migrations.
- Applied migrations are tracked in PostgreSQL table `schema_migrations`.
- `migration:up` applies pending `*.up.sql` files in filename order.
- `migration:down` rolls back one migration at a time using its paired `*.down.sql` file.
- Keep Milestone 0 SQL-first workflow as-is: no fake baseline migration should be committed before a real BellField-owned schema change exists.
