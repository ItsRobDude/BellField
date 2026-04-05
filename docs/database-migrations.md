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

## Local workflow

From repo root:

1. Create migration files:
   - `pnpm --filter @bellfield/api migration:create -- add_descriptive_name`
2. Add SQL to both generated files.
3. Apply pending migrations:
   - `DATABASE_URL=postgres://... pnpm --filter @bellfield/api migration:up`
4. Roll back the latest migration (if needed):
   - `DATABASE_URL=postgres://... pnpm --filter @bellfield/api migration:down`

Notes:

- Applied migrations are tracked in PostgreSQL table `schema_migrations`.
- `migration:up` applies pending `*.up.sql` files in filename order.
- `migration:down` rolls back one migration at a time using its paired `*.down.sql` file.
