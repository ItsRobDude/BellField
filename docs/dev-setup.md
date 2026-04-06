# Developer Setup

This document captures what has been scaffolded so far, why the initial tooling choices were made, and how to run BellField locally in a self-hosted development style.

## 1) What was scaffolded

### Apps

- `apps/office-web` — Next.js office-facing web app scaffold.
- `apps/field-mobile` — Expo + React Native mobile scaffold for technicians.
- `apps/api` — NestJS API scaffold (modular monolith host).
- `apps/worker` — lightweight Node/TypeScript worker scaffold for background tasks.

### Shared packages

- `packages/contracts` — shared TS contracts/shapes between surfaces.
- `packages/validation` — shared TS validation helpers.
- `packages/utils` — shared TS utility functions.

### Migration path

- API migrations are SQL-first files in `apps/api/src/database/migrations`.
- Migration commands are Node-based (`migration:create`, `migration:up`, `migration:down`) and run `psql` directly.

### Tooling baseline

- `pnpm` workspace monorepo layout with root scripts for dev/start/build/format/lint/typecheck/test.
- TypeScript configured across apps and packages.
- ESLint configured in root and per-app where needed.
- Prettier configured at repository root (`.prettierrc.json`).

## 2) Why these key tooling choices were made

### Minimal first

- The scaffold intentionally avoids heavy framework add-ons until product/workflow rules are stable.
- It is easier to add complexity than to remove accidental complexity.

### Conservative choices

- SQL-first migration files are explicit and easy to reason about in code review.
- Separate app surfaces and a worker are created early, but kept thin so architecture can evolve without rework.

### TypeScript-first across the stack

- Shared language and types reduce integration friction between office web, mobile, API, worker, and shared packages.
- Improves interface clarity and catches contract drift earlier during local development.

## 3) Install instructions

### Prerequisites

- Node.js 20+ (LTS recommended).
- `pnpm` 9+.
- PostgreSQL client (`psql`) available on your `PATH` for migration commands.

### Install

```bash
# from repository root
pnpm install
```

If `pnpm` is not installed yet:

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

## 4) Run commands (repository root)

### Development

```bash
pnpm dev:office-web
pnpm dev:field-mobile
pnpm dev:api
pnpm dev:worker
```

`pnpm dev:field-mobile` now runs the generic Expo startup flow (`expo start`), which lets you pick the target interactively.
For direct Android device/emulator launch (common on Windows setups), use:

```bash
pnpm --filter @bellfield/field-mobile dev:android
```

Additional convenience targets:

```bash
pnpm --filter @bellfield/field-mobile dev:ios
pnpm --filter @bellfield/field-mobile dev:web
```

Notes:
- iOS is not the expected local target on a normal Windows development setup.
- Web can be useful for quick iteration, but it is not a substitute for validating behavior on an actual mobile target.

### Production-style start commands

```bash
pnpm start:office-web
pnpm start:field-mobile
pnpm start:api
pnpm start:worker
```

> `office-web` uses standard Next.js behavior: `pnpm --filter @bellfield/office-web build` then `pnpm start:office-web`.

## 5) Migrations (API)

From repository root:

```bash
pnpm --filter @bellfield/api migration:create -- add_example
```

Notes:

- `psql` must be installed and available on `PATH` because the migration runner shells out to PostgreSQL client tools.
- `DATABASE_URL` is required for `migration:up` and `migration:down`.
- `schema_migrations` is created by the runner on `migration:up` if it does not exist yet.
- Commands are cross-platform Node entrypoints and call `psql`.

### Fresh local bootstrap example (throwaway DB)

```bash
# verify PostgreSQL CLI is available
psql --version

# create a throwaway database
createdb bellfield_migration_smoke

# set DATABASE_URL for this shell
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bellfield_migration_smoke

# create migration pair
pnpm --filter @bellfield/api migration:create -- add_smoke_table

# edit generated SQL files, then apply
pnpm --filter @bellfield/api migration:up

# rollback latest migration
pnpm --filter @bellfield/api migration:down

# clean up throwaway DB when done
dropdb bellfield_migration_smoke
```

PowerShell equivalent environment variable set:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/bellfield_migration_smoke"
```

## 6) Environment variables

Use `.env.example` files as documentation-first references:

- repository root: shared naming and sample values
- `apps/api/.env.example`: API runtime + API migration script variables
- `apps/worker/.env.example`: worker runtime variables

| Variable | Used by | Required? | Safe local sample value |
| --- | --- | --- | --- |
| `NODE_ENV` | `apps/api` runtime config, `apps/worker` runtime config | Optional (defaults to `development`) | `development` |
| `PORT` | `apps/api` runtime config (HTTP listen port) | Optional (defaults to `3001`) | `3001` |
| `DATABASE_URL` | `apps/api/scripts/migrations/*.mjs` (`migration:up`, `migration:down`) | Required for migration up/down scripts; not required for normal API startup | `postgresql://postgres:postgres@localhost:5432/bellfield` |

## 7) Repo-wide quality/check commands

CI baseline versions:

- Node.js 20 LTS
- pnpm 10.13.1

From repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 8) Intentionally deferred items (explicit)

The current scaffold is intentionally foundation-only. These are deferred on purpose:

1. Auth implementation (login/session/identity flows).
2. Role/permission enforcement implementation.
3. Business modules beyond starter health/shells (CRM, Jobs, Dispatch, Estimates, Billing, Inventory, etc.).
4. Real production schema/domain model (beyond starter migration path and placeholders).
5. Offline sync behavior implementation details (queue semantics, conflict resolution, retry policy, reconciliation UX).

## 9) Troubleshooting notes (local self-hosted oriented)

- **Port collisions:** If a surface fails to boot, check for port conflicts and stop old local processes.
- **Dependency drift:** Re-run `pnpm install` after lockfile updates or branch switches.
- **Expo/device issues:** Use `pnpm --filter @bellfield/field-mobile dev:android` when you want direct Android launch and ensure emulator/device tooling is running beforehand.
- **API migration commands:** Ensure `DATABASE_URL` and `psql` are both available when running migration scripts locally.
- **Type errors across workspaces:** Run `pnpm typecheck` at root to catch shared-package breakages affecting multiple apps.
- **Fresh start fallback:** If local state is inconsistent, clear local build artifacts and reinstall dependencies, then re-run the individual dev command.
