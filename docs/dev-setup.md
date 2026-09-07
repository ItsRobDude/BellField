# Developer Setup

This document captures the current local development baseline for BellField.

It should match the repo as it exists today, not an older scaffold or a future target-state layout.

## 1. Local Baseline

BellField uses:

- Node `24.18.0` (LTS; pinned by `devEngines.runtime` in `package.json`)
- pnpm `11.13.0`

BellField is a `pnpm` workspace repo.
Do not mix `npm`, `yarn`, `bun`, or extra monorepo tooling unless the repo is intentionally changed to support them.

## 2. What Exists Today

Current apps:

- `apps/office-web` - Next.js office web app
- `apps/field-mobile` - Expo / React Native field app
- `apps/api` - NestJS API
- `apps/worker` - TypeScript worker
- `apps/relay` - NestJS BellField-hosted delivery relay (own `bellfield_relay` database; only needed locally when working on relay or delivery code)

Current shared packages:

- `packages/contracts`
- `packages/estimating` - shared estimating/pricing engine used by API estimate pricing, invoice reflection, and job-cost money helpers
- `packages/validation`
- `packages/utils`

## 3. Install

From the repo root:

```powershell
corepack enable
corepack install
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
- `BELLFIELD_OFFICE_SESSION_TTL_HOURS` controls office-web absolute session expiry. The default is 12 hours. The office browser remembers its session token in `localStorage` (`bellfield.office.session`) and re-validates it with `GET /identity/auth/me` on every load; Sign out or a rejected token clears it.
- `BELLFIELD_FIELD_SESSION_TTL_DAYS` controls field-mobile absolute session expiry. The default is 30 days.
- `BELLFIELD_MEDIA_ROOT` controls where uploaded media blobs are stored.
- `BELLFIELD_MEDIA_TOKEN_SECRET` signs short-lived upload/download tokens for media blobs.
- `BELLFIELD_MEDIA_MAX_BYTES` controls the raw blob upload limit. The default is 50 MB.
- `BELLFIELD_MEDIA_TOKEN_TTL_SECONDS` controls signed media token lifetime. The default is 300 seconds.

Media config notes:

- Production API startup fails if `BELLFIELD_MEDIA_ROOT` or `BELLFIELD_MEDIA_TOKEN_SECRET` is missing.
- Production also rejects media token secrets shorter than 32 characters or known sample/dev placeholder values.
- Development and test runs fall back to an OS temp media folder and a weak dev-only token secret if those values are omitted.
- Use an absolute Windows-friendly path such as `C:\BellFieldData\media` for local server-style testing.

Relay settings (only when working on delivery/relay code):

- The API and worker relay clients use `BELLFIELD_RELAY_BASE_URL` + `BELLFIELD_RELAY_TOKEN` as the activation switch. With both blank, estimate/invoice sends report delivery as not configured even if `BELLFIELD_RELAY_SERVER_INSTANCE_ID` is already generated. When base URL/token are set, `BELLFIELD_RELAY_SERVER_INSTANCE_ID` must also be set.
- The relay app itself reads `BELLFIELD_RELAY_DATABASE_URL` (its own `bellfield_relay` database), `BELLFIELD_RELAY_RESEND_API_KEY`, `BELLFIELD_RELAY_ESTIMATE_FROM_ADDRESS`, `BELLFIELD_RELAY_INVOICE_FROM_ADDRESS`, `BELLFIELD_RELAY_WEBHOOK_SIGNING_SECRET`, and optionally `BELLFIELD_RELAY_PORT`, `BELLFIELD_RELAY_DEFAULT_MONTHLY_QUOTA`, and `BELLFIELD_RELAY_ARTIFACTS_ROOT` (release-download storage). `BELLFIELD_RELAY_FROM_ADDRESS` remains a legacy estimate-sender fallback for older relay env files.
- Production relay deployment lives under `deploy/relay/` (compose stack, env template, backup script); see `docs/relay-deployment-2026-06-12.md` for the live-host record.

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

Relay (only when working on relay code; it needs its own `bellfield_relay` database and `BELLFIELD_RELAY_*` env values from Section 4):

```powershell
pnpm dev:relay:migrate
pnpm dev:relay
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

This requires a clean Git tree, creates a disposable detached worktree at the
current commit, installs frozen dependencies there, and builds/signs in that
staging checkout. Only the completed `release/` folder is copied back; normal
development dependencies and build outputs are not mutated by release assembly.
See [install-runbook.md](./install-runbook.md) for the assisted install flow and
current validation boundaries.

Preview the safe generated-output cleanup allowlist before applying it:

```powershell
pnpm clean:generated --dry-run
pnpm clean:generated --apply
```

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
- the relay keeps its own migrations under `apps/relay` (`pnpm --filter @bellfield/relay migration:up` / `migration:down`, or `pnpm dev:relay:migrate` from the root) against `BELLFIELD_RELAY_DATABASE_URL`

See [database-migrations.md](./database-migrations.md) for the full migration workflow and safety rules.

## 8. Practical Working Notes

- Run commands from the repo root so workspace resolution stays consistent.
- Prefer PowerShell-friendly and Windows-friendly instructions in docs and scripts.
- If a setup instruction and the actual package scripts disagree, update the docs deliberately rather than relying on tribal knowledge.
