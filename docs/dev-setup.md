# Developer Setup

This document captures the current local development baseline for BellField.

It should match the repo as it exists today, not an older scaffold or a future target-state layout.

## 1. Local Baseline

BellField uses:

- Node `24.x` (LTS)
- pnpm `10.13.1`

BellField is a `pnpm` workspace repo.
Do not mix `npm`, `yarn`, `bun`, or extra monorepo tooling unless the repo is intentionally changed to support them.

## 2. What Exists Today

Current apps:

- `apps/office-web` - Next.js office web app
- `apps/field-mobile` - Expo / React Native field app
- `apps/api` - NestJS API
- `apps/worker` - TypeScript worker

Current shared packages:

- `packages/contracts`
- `packages/estimating` - shared estimating/pricing engine used by API estimate pricing, invoice reflection, and job-cost money helpers
- `packages/validation`
- `packages/utils`

## 3. Install

From the repo root:

```powershell
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
```

If the lockfile is intentionally being updated:

```powershell
pnpm install
```

## 4. Environment Setup

Root runtime settings:

- Copy `.env.example` values into your local shell or app-specific `.env` files when running the API or worker.
- `DATABASE_URL` is required for API runtime and migration scripts.
- `PORT` controls the local API listen port.
- `BELLFIELD_API_PORT` is the production/server-config API port override; it takes precedence over `PORT` when set.
- `BOOTSTRAP_SEED_DATA=true` opts local development into seeded demo accounts; omitted means no seed bootstrap.
- `BELLFIELD_OFFICE_ORIGINS` lists allowed office-web origins in production. Development/test are permissive when it is omitted.
- `BELLFIELD_MEDIA_ROOT` controls where uploaded media blobs are stored.
- `BELLFIELD_MEDIA_TOKEN_SECRET` signs short-lived upload/download tokens for media blobs.
- `BELLFIELD_MEDIA_MAX_BYTES` controls the raw blob upload limit. The default is 50 MB.
- `BELLFIELD_MEDIA_TOKEN_TTL_SECONDS` controls signed media token lifetime. The default is 300 seconds.

Media config notes:

- Production API startup fails if `BELLFIELD_MEDIA_ROOT` or `BELLFIELD_MEDIA_TOKEN_SECRET` is missing.
- Production also rejects media token secrets shorter than 32 characters or known sample/dev placeholder values.
- Development and test runs fall back to an OS temp media folder and a weak dev-only token secret if those values are omitted.
- Use an absolute Windows-friendly path such as `C:\BellFieldData\media` for local server-style testing.

Client runtime settings:

- `apps/office-web/.env.example` defines `NEXT_PUBLIC_API_BASE_URL`
- `apps/field-mobile/.env.example` defines `EXPO_PUBLIC_API_BASE_URL`

Outside local development, point both client base URLs at the BellField API running on the office server.

## 5. Run Commands

Run these from the repository root:

```powershell
pnpm dev:postgres
pnpm dev:migrate
pnpm dev:office-web
pnpm dev:field-mobile
pnpm dev:api
pnpm dev:worker
```

Local database helpers:

```powershell
pnpm dev:postgres
pnpm dev:postgres:stop
pnpm dev:postgres:docker
pnpm dev:postgres:docker:logs
pnpm dev:postgres:docker:stop
pnpm dev:postgres:docker:down
```

`pnpm dev:postgres` starts a local PostgreSQL server from a user-space PostgreSQL install.
The default local connection string is `postgresql://postgres:postgres@localhost:5432/bellfield`.
By default, the helper looks for PostgreSQL binaries under `%LOCALAPPDATA%\Programs\PostgreSQL\16.14\pgsql\bin`.
Set `POSTGRES_BIN` if PostgreSQL is installed elsewhere.
`pnpm dev:migrate` applies pending API migrations against that default unless `DATABASE_URL` is already set.
Docker Compose helpers are kept as an optional path for machines where Docker Desktop is healthy.

Start commands:

```powershell
pnpm start:office-web
pnpm start:field-mobile
pnpm start:api
pnpm start:worker
```

`pnpm start:worker` now expects `apps/worker/dist` to exist. Run `pnpm --filter @bellfield/worker build` first when using the production-style start command.

Field mobile convenience targets:

```powershell
pnpm --filter @bellfield/field-mobile dev:android
pnpm --filter @bellfield/field-mobile dev:ios
pnpm --filter @bellfield/field-mobile dev:web
```

Notes:

- `pnpm dev:field-mobile` runs the generic Expo startup flow.
- Android is the expected day-to-day local mobile target on a normal Windows setup.
- iOS is available as a script target but is not the normal Windows path.

## 6. Common Checks

Repository-wide checks:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Production-style release assembly:

```powershell
pnpm build:release
```

This creates a generated `release/` folder with compiled API/worker output, the office-web standalone server, migration scripts, install helpers, and the bundled Node runtime from the current machine. See [install-runbook.md](./install-runbook.md) for the assisted install flow and current validation boundaries.

Current testing posture:

- workspace `test` scripts are still lightweight in some apps
- `apps/api` has a real Jest test command
- some app `test` scripts currently delegate to typecheck

## 7. API Migrations

Before running `pnpm dev:api` against a fresh local database, apply the API migrations first.

Current commands:

```powershell
pnpm --filter @bellfield/api migration:create -- add_descriptive_name
pnpm --filter @bellfield/api migration:up
pnpm --filter @bellfield/api migration:down
```

Optional `psql` fallback commands:

```powershell
pnpm --filter @bellfield/api migration:up:psql
pnpm --filter @bellfield/api migration:down:psql
```

Important notes:

- the default migration driver is the repository-owned Node runner plus the PostgreSQL driver
- `psql` is optional unless you intentionally use the `:psql` commands
- migration SQL files live under `apps/api/src/database/migrations`

See [database-migrations.md](./database-migrations.md) for the full migration workflow and safety rules.

## 8. Practical Working Notes

- Run commands from the repo root so workspace resolution stays consistent.
- Prefer PowerShell-friendly and Windows-friendly instructions in docs and scripts.
- If a setup instruction and the actual package scripts disagree, update the docs deliberately rather than relying on tribal knowledge.
