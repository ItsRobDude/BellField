# Database Migrations (API)

This document defines the tracked schema-change workflow for `apps/api`.

BellField should use migrations for every intentional schema change.
Do not "just change the database."

## 1. Current Migration Approach

BellField API uses plain SQL migration files with repository-owned runner scripts.

Current behavior:

- migration files live in `apps/api/src/database/migrations`
- each migration is a forward and rollback pair
- the default runner uses Node plus the PostgreSQL driver
- optional `psql` fallback commands exist when that driver is intentionally needed

This keeps migrations explicit, reviewable, and independent from ORM-owned migration systems.

## 2. Migration Files

Each migration is a pair of SQL files:

- `<timestamp>_<name>.up.sql`
- `<timestamp>_<name>.down.sql`

Current naming rules:

- timestamp format: `YYYYMMDDHHMMSS`
- name format: lowercase `snake_case`
- example: `20260416093000_add_customer_flags.up.sql`

The create script generates both files:

```powershell
pnpm --filter @bellfield/api migration:create -- add_customer_flags
```

## 3. Commands

Create a migration pair:

```powershell
pnpm --filter @bellfield/api migration:create -- add_descriptive_name
```

Apply pending migrations:

```powershell
pnpm --filter @bellfield/api migration:up
```

Roll back the latest applied migration:

```powershell
pnpm --filter @bellfield/api migration:down
```

Optional `psql` fallback:

```powershell
pnpm --filter @bellfield/api migration:up:psql
pnpm --filter @bellfield/api migration:down:psql
```

## 4. Environment Requirements

`DATABASE_URL` is required for `migration:up` and `migration:down`.

Example PowerShell setup:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/bellfield"
```

Important notes:

- the default migration flow does not require `psql` on `PATH`
- `psql` is only required when using the `:psql` commands
- the API runtime uses the same `DATABASE_URL`

## 5. Fresh Local Workflow

Typical flow from the repository root:

1. Point `DATABASE_URL` at a local BellField database.
2. Create a migration pair with `migration:create`.
3. Write forward SQL in the `.up.sql` file.
4. Write rollback SQL in the matching `.down.sql` file.
5. Apply pending migrations with `migration:up`.
6. Start the API after the database is up to date.
7. Use `migration:down` only when intentionally testing rollback or undoing the latest local migration.

## 6. Tracking Behavior

The migration runner automatically manages the `schema_migrations` table.

Current rules:

- pending `.up.sql` files run in filename order
- applied migrations are recorded in `schema_migrations`
- `migration:down` rolls back one migration at a time using the paired `.down.sql` file

## 7. Safety Rules

- every committed schema change must have both an `.up.sql` and `.down.sql` file
- do not bypass migrations for BellField-owned schema changes
- keep SQL conservative and reviewable
- be extra careful with jobs, invoices, payments, history, and snapshots
- if a migration changes product meaning, update the owning docs as part of the same work
