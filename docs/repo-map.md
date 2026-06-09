# BellField Repo Map

This is a compact orientation page for engineers and AI contributors.
It helps you find the right code and docs quickly; it does not override product rules,
workflow rules, API endpoint docs, or architecture guardrails.

## Current Apps

- `apps/office-web` - Next.js office application.
- `apps/field-mobile` - Expo / React Native field application.
- `apps/api` - NestJS API and shared business logic host.
- `apps/worker` - background worker service.

## Current Shared Packages

- `packages/contracts` - shared request/response contracts and cross-app types.
- `packages/estimating` - shared estimating/pricing engine used by API estimate pricing, invoice reflection, and job-cost money helpers.
- `packages/validation` - shared validation helpers.
- `packages/utils` - low-level shared utilities.

## Where Core Work Lives

- API modules live under `apps/api/src/modules`. Start with the controller for endpoint shape, then service/repository files for behavior.
- Shared company-data persistence and reference reads live under `apps/api/src/modules/company-data`.
- Office operation surfaces live mostly under `apps/office-web/src/modules/operations`; API client helpers live under `apps/office-web/src/lib`.
- Field operation, offline queue, register, media, and sync helpers live under `apps/field-mobile/src/modules/operations`.
- Database migrations live under `apps/api/src/database/migrations`; every schema change must use tracked migrations.

## Common Commands

- `pnpm install --frozen-lockfile`
- `pnpm dev:postgres` or `pnpm dev:postgres:docker`
- `pnpm dev:migrate`
- `pnpm dev:api`
- `pnpm dev:office-web`
- `pnpm dev:field-mobile`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:architecture`
- `pnpm check:ui-copy`

## Source Of Truth Docs

- `AGENTS.md` - contributor operating rules and doc routing.
- `docs/README.md` - documentation ownership map.
- `docs/whats-shipped.md` - short current-state snapshot.
- `docs/product-rules.md` - product invariants.
- `docs/workflows-and-state-machines.md` - lifecycle behavior.
- `docs/screen-behavior-spec.md` - office/field UI behavior.
- `docs/data-modeling-rules.md` - record ownership, history, snapshots, and schema semantics.
- `docs/offline-sync.md` - field app sync and offline rules.
- `docs/api-endpoints.md` - quick endpoint catalog; controller code remains exact source of truth.
- `docs/validation-playbook.md` - how to prove risky lanes with checks, browser smoke, and device evidence.

## Common Drift Traps

- Historical comparison and phase-plan docs may be useful context, but `docs/whats-shipped.md` and code should win for current state.
- Field-mobile validation often needs real-device proof; tests alone do not prove Expo/runtime behavior.
- Invoice, payment, register, job-cost, and service-agreement work is money/history-adjacent; preserve snapshots and correction paths.
- Office and field clients never talk directly to each other or to the database.
- The UI label is `Catalog`, not `Pricebook`, even when comparing against FSM pricebook concepts.
- Service agreements are lifecycle records; selling an agreement Catalog/register line does not automatically create a lifecycle agreement.
