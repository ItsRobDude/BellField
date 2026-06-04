# BellField - Field-Service Platform

BellField is a self-hosted-first field-service platform for real service companies.
It is being built for one company to use first, with future SaaS expansion kept in mind, while staying practical for small shops, Windows-friendly, and maintainable.

## BellField in One Minute

BellField is:

- customer/company first, then service locations
- browser-based for office work and mobile-first for field work
- TypeScript-first across office, field, backend, and shared packages
- history-preserving, accounting-safe, and permission-aware
- built slower and cleaner rather than fast and messy
- self-hosted first, with customer-owned data by default

Current product posture:

- BellField is not HVAC-only, but HVAC is an important early reference case.
- Office and field workflows both matter from the beginning.
- The backend is the source of truth for business rules.
- The product should stay boring, explicit, and maintainable.

## Current Repository Shape

Top-level apps:

- `apps/office-web` - Next.js office application
- `apps/field-mobile` - Expo / React Native field application
- `apps/api` - NestJS API and shared business logic host
- `apps/worker` - background worker service

Current shared packages:

- `packages/contracts` - shared request and response contracts
- `packages/validation` - shared validation helpers
- `packages/utils` - shared utility code

Important note:

- The filesystem is the source of truth for what currently exists in the repo.
- Some docs describe target-state architecture. Those docs should not be read as a promise that every listed app or package already exists.

## Local Quickstart

BellField uses `pnpm` only.

Expected local baseline:

- Node `24.x` (LTS)
- pnpm `10.13.1`

Bootstrap from the repo root:

```powershell
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
```

If the lockfile is intentionally being reconciled:

```powershell
pnpm install
```

Environment setup:

- Copy root settings from [.env.example](./.env.example) when running the API or worker locally.
- Copy [apps/office-web/.env.example](./apps/office-web/.env.example) for the office app.
- Copy [apps/field-mobile/.env.example](./apps/field-mobile/.env.example) for the field app.
- Set `DATABASE_URL` for the API runtime and migration scripts.
- Set `BELLFIELD_MEDIA_ROOT` and `BELLFIELD_MEDIA_TOKEN_SECRET` for any production-like API run that needs media uploads.
- Outside local development, point `NEXT_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_BASE_URL` at the BellField API running on the office server.

Common development commands:

```powershell
pnpm dev:postgres
pnpm dev:migrate
pnpm dev:office-web
pnpm dev:field-mobile
pnpm dev:api
pnpm dev:worker
pnpm dev:field-smoke-data
```

`pnpm dev:postgres` starts a local PostgreSQL server from a user-space PostgreSQL install.
It uses the development `DATABASE_URL` from [.env.example](./.env.example).
Docker Compose helpers are available with `pnpm dev:postgres:docker` when Docker Desktop is healthy.

Common maintenance commands:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Architecture guardrails are documented in [docs/architecture-guardrails.md](./docs/architecture-guardrails.md) and checked with:

```powershell
pnpm check:architecture
```

Source file-size guardrails are documented in [docs/maintainability-refactor-plan.md](./docs/maintainability-refactor-plan.md) and checked with:

```powershell
pnpm check:file-size
```

User-facing copy guardrails catch internal scaffold/milestone wording before it reaches the office or field UI:

```powershell
pnpm check:ui-copy
```

Field-mobile local smoke steps are documented in [docs/field-mobile-smoke.md](./docs/field-mobile-smoke.md).

API migration commands:

```powershell
pnpm --filter @bellfield/api migration:create -- add_descriptive_name
pnpm --filter @bellfield/api migration:up
pnpm --filter @bellfield/api migration:down
```

The default migration driver uses Node plus the PostgreSQL driver. Optional `psql` fallback commands are also available:

```powershell
pnpm --filter @bellfield/api migration:up:psql
pnpm --filter @bellfield/api migration:down:psql
```

Before running `pnpm dev:api` against a fresh local database, apply the API migrations first.

## Documentation Map

Start with [docs/README.md](./docs/README.md) for the documentation ownership map.

Core contributor docs:

- [AGENTS.md](./AGENTS.md) - working rules for AI contributors in this repo
- [docs/engineering-standards.md](./docs/engineering-standards.md) - coding and implementation standards
- [docs/dev-setup.md](./docs/dev-setup.md) - local development setup and command guidance
- [docs/database-migrations.md](./docs/database-migrations.md) - API migration workflow and rules
- [docs/api-endpoints.md](./docs/api-endpoints.md) - current API endpoint catalog
- [docs/glossary.md](./docs/glossary.md) - common BellField terms

Product source-of-truth docs:

- [docs/product-rules.md](./docs/product-rules.md) - product behavior rules
- [docs/workflows-and-state-machines.md](./docs/workflows-and-state-machines.md) - job, appointment, estimate, invoice, and related workflow behavior
- [docs/permissions-model.md](./docs/permissions-model.md) - permission model and override behavior
- [docs/offline-sync.md](./docs/offline-sync.md) - field sync and offline expectations
- [docs/screen-behavior-spec.md](./docs/screen-behavior-spec.md) - office and field screen behavior
- [docs/data-modeling-rules.md](./docs/data-modeling-rules.md) - data and history rules that schema work must obey

Operational and sequencing docs:

- [docs/deployment-model.md](./docs/deployment-model.md) - self-hosted deployment constraints and hosting posture
- [docs/self-hosted-installation-strategy.md](./docs/self-hosted-installation-strategy.md) - supported install posture, pilot setup boundary, and installer/runbook readiness gates
- [docs/milestone-implementation-plan.md](./docs/milestone-implementation-plan.md) - build order and milestone discipline
- [docs/whats-shipped.md](./docs/whats-shipped.md) - current shipped/open/not-started snapshot
- [docs/architecture-guardrails.md](./docs/architecture-guardrails.md) - checked architecture rules
- [docs/modular-monolith-codebase-structure.md](./docs/modular-monolith-codebase-structure.md) - architecture direction and repo-structure guardrails

Historical planning context:

- [docs/product-shape-plan.md](./docs/product-shape-plan.md) - earlier planning material kept for context, not as the current source of truth

## Current Sequencing Rule

BellField should be built in controlled layers.

Use [docs/milestone-implementation-plan.md](./docs/milestone-implementation-plan.md) as the sequencing source of truth for what should be built next and what should stay postponed.

## Working Expectations

- Prefer focused docs over broad planning notes when they overlap.
- Do not invent product behavior when a dedicated doc already owns it.
- Keep the repo Windows-friendly and `pnpm`-only.
- Do not bypass tracked migrations for schema changes.
- When docs and code disagree, fix the disagreement deliberately.
